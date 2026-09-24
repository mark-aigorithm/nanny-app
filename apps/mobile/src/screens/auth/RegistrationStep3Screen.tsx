import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { CURRENT_TERMS_VERSION } from '@nanny-app/shared';
import { idTypeRequiresBack } from '@shared/nanny';
import { colors } from '@mobile/theme';
import { OTP_LENGTH, RESEND_SECONDS, APP_NAME } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import OtpCodeInput from '@mobile/components/ui/otp-code-input';
import ReferralCodeField from '@mobile/components/ReferralCodeField';
import { auth } from '@mobile/lib/firebase';
import type { PhoneConfirmation } from '@mobile/lib/firebase';
import {
  useConfirmPhoneAndLink,
  useLinkPhoneToCurrentUser,
  useRegisterProfile,
  useSendPhoneLinkCode,
  useSendPhoneOtp,
  useSignOut,
  type PhoneLinkChallenge,
} from '@mobile/hooks/useAuth';
import { apiStatusOf } from '@mobile/lib/api';
import type { MappedAuthError } from '@mobile/lib/authErrors';
import { abandonSocialSignUpForLink } from '@mobile/lib/pendingLink';
import { useRedeemReferralCode } from '@mobile/hooks/useReferrals';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { uploadImageToFirebase } from '@mobile/lib/storage';
import { dobToIso, toE164 } from '@mobile/lib/validation';
import { styles } from './styles/registration-step3-screen.styles';

// An Android instant verification can be linked only once (see
// useLinkPhoneToCurrentUser), so after a failed link the only way on is a
// fresh SMS.
const INSTANT_VERIFICATION_SPENT_MESSAGE =
  "We couldn't confirm your number. Tap Resend code to get a code by SMS.";

const PHOTO_UPLOAD_FAILED_MESSAGE =
  "Couldn't upload your photos. Check your connection and try again.";

/**
 * What the code on this screen is checked against. The phone wizard signs in
 * *with* the phone (then links the password onto that account); a Google/Apple
 * wizard is already signed in and links the phone *onto* that account.
 */
type PhoneChallenge =
  | { kind: 'sign-in'; confirmation: PhoneConfirmation }
  | { kind: 'link'; link: PhoneLinkChallenge };

/**
 * The last step of every wizard: verify the phone, accept the terms, then put
 * the phone on the Firebase account, upload the photos and create the row.
 * Complete setup is a safe retry after any failure.
 *
 * Non-obvious states:
 * - A resumed account that already holds this number sends no SMS and shows
 *   "Your number is already verified." instead of the code boxes.
 * - Android can verify the number instantly (no code to type); that
 *   verification can be spent only once, so a failed link asks for an SMS.
 * - Collision B (a Google/Apple sign-up whose phone, or the server's 409,
 *   shows an existing account) drops the new account and goes to sign-in.
 * - Session mismatch: the signed-in account is no longer the one this
 *   sign-up is finishing, so the only way on is "Start again".
 */
export default function RegistrationStep3Screen() {
  const router = useRouter();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const resetDraft = useRegistrationDraftStore((s) => s.reset);

  const isSocial = draft.authProvider !== 'phone';

  const sendOtp = useSendPhoneOtp();
  const sendLinkCode = useSendPhoneLinkCode();
  const confirmPhone = useConfirmPhoneAndLink();
  const linkPhone = useLinkPhoneToCurrentUser();
  const registerProfile = useRegisterProfile();
  const redeemReferral = useRedeemReferralCode();
  const signOut = useSignOut();

  const phoneE164 = toE164(draft.countryCode, draft.phone);
  // A resumed sign-up whose account already holds this very number: there is
  // nothing to verify, so no SMS is sent and there is no code to type. Only
  // for the account this sign-up is finishing.
  const phoneAlreadyVerified =
    draft.accountPhone !== null &&
    draft.accountPhone === phoneE164 &&
    auth().currentUser?.uid === draft.signUpUid;
  // Show the user-friendly format from what they typed.
  const phoneDisplay = draft.phone
    ? `${draft.countryCode} ${draft.phone}`
    : '+20 100 000 0000';

  const [otp, setOtp] = useState('');
  // Firebase's handle on the SMS it sent; the code is checked against it.
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [referralCode, setReferralCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The step-1 photo (and a nanny's ID images) upload between account creation
  // and profile save; that gap isn't covered by either mutation's pending
  // flag, so track it here.
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  // Collision B deletes or signs out the account this screen is working on.
  // Complete setup stays disabled from then until the replace to sign-in, so
  // a second tap can't run against that account.
  const [isHandingOff, setIsHandingOff] = useState(false);
  // The signed-in account is no longer the one this sign-up is finishing;
  // the only way on is to sign out and start again.
  const [sessionEnded, setSessionEnded] = useState(false);

  const sendCode = useCallback(
    (forceResend: boolean) => {
      setFormError(null);
      const onError = (err: MappedAuthError) => setFormError(err.message);
      if (isSocial) {
        sendLinkCode.mutate(
          { phone: phoneE164, forceResend },
          {
            onSuccess: (link) => {
              setChallenge({ kind: 'link', link });
              // Android read the SMS itself — fill the boxes in for her.
              if (link.code) setOtp(link.code);
              setSecondsLeft(RESEND_SECONDS);
            },
            onError,
          },
        );
      } else {
        sendOtp.mutate(
          { phone: phoneE164, forceResend },
          {
            onSuccess: (confirmation) => {
              setChallenge({ kind: 'sign-in', confirmation });
              setSecondsLeft(RESEND_SECONDS);
            },
            onError,
          },
        );
      }
    },
    // The mutation objects are new every render; the mutations are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phoneE164, isSocial],
  );

  // Android verified the number without an SMS at all: there is no code to type.
  const instantlyVerified =
    challenge?.kind === 'link' && challenge.link.autoVerified && !challenge.link.code;

  // Send once on arrival. A ref, not a dep list, because React 18 mounts twice
  // in dev and a second send would invalidate the first code.
  const hasSentRef = useRef(false);
  useEffect(() => {
    if (hasSentRef.current || phoneAlreadyVerified) return;
    hasSentRef.current = true;
    sendCode(false);
  }, [sendCode, phoneAlreadyVerified]);

  // Resend cooldown.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  function handleBack() {
    router.back();
  }

  // Collision B: the email or phone belongs to an account that already
  // exists. Drop the account this sign-up created, keep its credential, and
  // send her to sign in with the number she typed.
  async function handOffToSignIn() {
    setIsHandingOff(true);
    await abandonSocialSignUpForLink(phoneE164);
    router.dismissTo('/(auth)/sign-in');
  }

  /**
   * Upload the step-1 photo and, for a nanny, her ID images. Resolves null if
   * any upload fails.
   */
  async function uploadPhotos(
    photoUri: string,
    isNannyAccount: boolean,
    needsBack: boolean,
  ): Promise<{ avatarUrl: string; idDocumentFrontUrl?: string; idDocumentBackUrl?: string } | null> {
    setIsUploadingPhotos(true);
    try {
      let idDocumentFrontUrl: string | undefined;
      let idDocumentBackUrl: string | undefined;
      if (isNannyAccount && draft.idFrontUri) {
        idDocumentFrontUrl = await uploadImageToFirebase(draft.idFrontUri, 'nanny-ids');
        if (needsBack && draft.idBackUri) {
          idDocumentBackUrl = await uploadImageToFirebase(draft.idBackUri, 'nanny-ids');
        }
      }
      const avatarUrl = await uploadImageToFirebase(photoUri, 'avatars');
      return { avatarUrl, idDocumentFrontUrl, idDocumentBackUrl };
    } catch {
      return null;
    } finally {
      setIsUploadingPhotos(false);
    }
  }

  function handleStartAgain() {
    signOut.mutate(undefined, { onSettled: () => router.dismissTo('/(auth)/sign-in') });
  }

  async function handleCompleteSetup() {
    if (!phoneAlreadyVerified && !challenge) {
      setFormError("We haven't sent your code yet. Tap resend to try again.");
      return;
    }
    if (!phoneAlreadyVerified && !instantlyVerified && otp.length !== OTP_LENGTH) {
      setFormError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    if (!termsAccepted) return;
    setFormError(null);

    const dobIso = dobToIso(draft.dob);
    if (!dobIso) {
      setFormError('Date of birth is invalid. Please go back and fix it.');
      return;
    }

    // Step 2 blocks Continue without a pin, but guard anyway — the backend
    // requires coordinates.
    const { latitude, longitude } = draft;
    if (latitude === null || longitude === null) {
      setFormError('Home location is missing. Please go back and set it on the map.');
      return;
    }

    const localRole = draft.role ?? 'parent';
    // Mobile uses 'parent' / 'nanny'; backend enum is 'MOTHER' / 'NANNY'.
    const apiRole = localRole === 'parent' ? 'MOTHER' : 'NANNY';

    // One address: the real one — proved on step 2 by the phone wizard, or by
    // Google/Apple for a social sign-up. It is `users.email`, and for the phone
    // wizard also the Firebase password credential.
    const profileEmail = draft.email.trim().toLowerCase();

    // A social sign-up has no token: Firebase verified its address, and the
    // backend checks that instead.
    const emailVerificationToken = draft.emailVerificationToken;
    if (!isSocial && !emailVerificationToken) {
      setFormError('Your email is not verified. Please go back and confirm the code.');
      return;
    }

    // 1. Put the verified phone on the Firebase account.
    // With the number already on the account there is no challenge, and the
    // hooks check that instead.
    try {
      if (!isSocial) {
        await confirmPhone.mutateAsync({
          confirmation:
            !phoneAlreadyVerified && challenge?.kind === 'sign-in' ? challenge.confirmation : null,
          code: phoneAlreadyVerified ? '' : otp,
          phone: phoneE164,
          email: profileEmail,
          password: draft.password,
          emailVerificationToken,
        });
      } else {
        await linkPhone.mutateAsync({
          challenge: !phoneAlreadyVerified && challenge?.kind === 'link' ? challenge.link : null,
          code: phoneAlreadyVerified ? '' : otp,
          phone: phoneE164,
          signUpUid: draft.signUpUid,
        });
      }
    } catch (error) {
      const err = error as MappedAuthError;
      if (err.code === 'session-mismatch') {
        setSessionEnded(true);
        setFormError(err.message);
        return;
      }
      if (isSocial && err.code === 'auth/credential-already-in-use') {
        // Collision B: this number belongs to an account that already exists.
        await handOffToSignIn();
        return;
      }
      if (instantlyVerified) {
        // The native side has already spent that verification; linking with
        // it again would always fail, and there is no code box to fall back
        // on. Drop it so she can have an SMS sent straight away.
        setChallenge(null);
        setSecondsLeft(0);
        setFormError(INSTANT_VERIFICATION_SPENT_MESSAGE);
        return;
      }
      setFormError(err.message);
      return;
    }

    patch({ termsAcceptedAt: Date.now() });

    // 2. Upload the photos, now that the account is signed in
    // (uploadImageToFirebase files them under the uid) and before the profile
    // is saved, so the URLs go out with the register request. Every account
    // brings the step-1 photo; a nanny also brings her ID (both sides for a
    // national ID, front only for a passport).
    const needsBack = draft.idDocumentType != null && idTypeRequiresBack(draft.idDocumentType);
    if (apiRole === 'NANNY' && (!draft.idDocumentType || !draft.idFrontUri || (needsBack && !draft.idBackUri))) {
      setFormError('Your ID is missing. Please go back and upload it.');
      return;
    }
    if (!draft.photoUri) {
      setFormError('Your profile photo is missing. Please go back and add it.');
      return;
    }
    const photos = await uploadPhotos(draft.photoUri, apiRole === 'NANNY', needsBack);
    if (!photos) {
      setFormError(PHOTO_UPLOAD_FAILED_MESSAGE);
      return;
    }
    const { avatarUrl, idDocumentFrontUrl, idDocumentBackUrl } = photos;

    // 3. Create the application account. Idempotent on the backend, so
    // tapping Complete setup again after a failure is a safe retry.
    try {
      await registerProfile.mutateAsync({
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: profileEmail,
        // Spent server-side inside the register transaction — this is what
        // makes a phone sign-up start out with a verified address.
        ...(emailVerificationToken ? { emailVerificationToken } : {}),
        phone: phoneE164,
        dateOfBirth: dobIso,
        role: apiRole,
        termsAcceptedVersion: CURRENT_TERMS_VERSION,
        address: draft.address,
        latitude,
        longitude,
        idDocumentType: draft.idDocumentType ?? undefined,
        idDocumentFrontUrl,
        idDocumentBackUrl,
        avatarUrl,
        ...(apiRole === 'NANNY' && {
          bio: draft.bio,
          yearsOfExperience: draft.yearsOfExperience
            ? parseInt(draft.yearsOfExperience, 10)
            : undefined,
          ageRanges: draft.ageRanges,
          availabilityType: draft.availabilityType ?? undefined,
          schedule: draft.schedule ?? undefined,
          certificationIds: draft.certificationIds,
          skillIds: draft.skillIds,
        }),
      });
    } catch (err) {
      if (isSocial && apiStatusOf(err) === 409) {
        // Collision B, found by the server.
        await handOffToSignIn();
        return;
      }
      setFormError(err instanceof Error ? err.message : 'Could not save your profile.');
      return;
    }

    // 4. Redeem any referral code now that the account exists. Deliberately
    // non-blocking: a failed redeem must never strand her mid-onboarding.
    const code = referralCode.trim();
    if (apiRole === 'MOTHER' && code) {
      try {
        await redeemReferral.mutateAsync(code);
      } catch {
        // Swallowed on purpose — see above.
      }
    }
    resetDraft();
    router.replace({ pathname: '/(auth)/notification-permission', params: { role: localRole } });
  }

  function handleOtpChange(value: string) {
    setOtp(value);
    if (formError) setFormError(null);
  }

  const isSubmitting =
    confirmPhone.isPending ||
    linkPhone.isPending ||
    isHandingOff ||
    isUploadingPhotos ||
    registerProfile.isPending;
  const canSubmit =
    (phoneAlreadyVerified || (challenge !== null && (instantlyVerified || otp.length === OTP_LENGTH))) &&
    termsAccepted &&
    !isSubmitting &&
    !sessionEnded;
  const resendDisabled = secondsLeft > 0 || sendOtp.isPending || sendLinkCode.isPending;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Fixed header bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.brandText}>{APP_NAME}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress section */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.stepLabel}>FINAL STEP</Text>
            <Text style={styles.completionLabel}>100% Complete</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={styles.progressBarFill} />
          </View>
        </View>

        {/* Headline */}
        <View style={styles.headlineGroup}>
          <Text style={styles.headline}>Verify your phone number</Text>
          <Text style={styles.subtitle}>
            {phoneAlreadyVerified ? (
              <Text style={styles.phoneHighlight}>{phoneDisplay}</Text>
            ) : instantlyVerified ? (
              'Your number was verified automatically.'
            ) : (
              <>
                {`Enter the ${OTP_LENGTH}-digit code we sent to `}
                <Text style={styles.phoneHighlight}>{phoneDisplay}</Text>
              </>
            )}
          </Text>
        </View>

        {/* OTP input */}
        <View style={styles.otpSection}>
          {phoneAlreadyVerified ? (
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.verifiedText}>Your number is already verified.</Text>
            </View>
          ) : (
            <>
              {!instantlyVerified && (
                <OtpCodeInput
                  testID="registerStep3.code"
                  value={otp}
                  onChange={handleOtpChange}
                  disabled={isSubmitting}
                />
              )}

              <View style={styles.resendRow}>
                <Text style={styles.timerText}>
                  {sendOtp.isPending || sendLinkCode.isPending ? 'Sending code…' : "Didn't get a code?"}
                </Text>
                <Pressable onPress={() => sendCode(true)} disabled={resendDisabled} hitSlop={8}>
                  <Text
                    style={[styles.resendLink, resendDisabled && styles.resendLinkDisabled]}
                  >
                    {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          {sessionEnded && (
            <Button
              title="Start again"
              variant="outline"
              onPress={handleStartAgain}
              loading={signOut.isPending}
              disabled={signOut.isPending}
            />
          )}
        </View>

        {/* Referral code — parents only; Care Points have no nanny outlet yet. */}
        {(draft.role ?? 'parent') === 'parent' && (
          <ReferralCodeField value={referralCode} onChange={setReferralCode} />
        )}

        {/* Terms card */}
        <Pressable
          style={styles.termsCard}
          onPress={() => setTermsAccepted((prev) => !prev)}
        >
          <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
            {termsAccepted && (
              <Ionicons name="checkmark" size={14} color={colors.white} />
            )}
          </View>
          <Text style={styles.termsText}>
            {'I agree to '}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {' and '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </Pressable>

        {/* Complete setup button */}
        <Button
          title={
            confirmPhone.isPending || linkPhone.isPending
              ? 'Verifying…'
              : isUploadingPhotos
                ? 'Uploading photos…'
                : registerProfile.isPending
                  ? 'Saving…'
                  : 'Complete setup'
          }
          onPress={() => void handleCompleteSetup()}
          disabled={!canSubmit}
        />
      </ScrollView>
    </View>
  );
}
