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

import { idTypeRequiresBack } from '@shared/nanny';
import { colors } from '@mobile/theme';
import { OTP_LENGTH, RESEND_SECONDS, APP_NAME } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import OtpCodeInput from '@mobile/components/ui/otp-code-input';
import ReferralCodeField from '@mobile/components/ReferralCodeField';
import type { PhoneConfirmation } from '@mobile/lib/firebase';
import {
  useConfirmPhoneAndLink,
  useRegisterProfile,
  useSendPhoneOtp,
} from '@mobile/hooks/useAuth';
import { useRedeemReferralCode } from '@mobile/hooks/useReferrals';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { uploadImageToFirebase } from '@mobile/lib/storage';
import { toE164, phoneToPlaceholderEmail } from '@mobile/lib/validation';
import { styles } from './styles/registration-step3-screen.styles';

// Bumping this version triggers a re-acceptance flow when terms change.
const TERMS_VERSION = 'v1.0';

/** Convert 'mm/dd/yyyy' to 'YYYY-MM-DD'. Returns empty string on bad input. */
function dobToIso(dob: string): string {
  const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

export default function RegistrationStep3Screen() {
  const router = useRouter();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const resetDraft = useRegistrationDraftStore((s) => s.reset);

  const sendOtp = useSendPhoneOtp();
  const confirmPhone = useConfirmPhoneAndLink();
  const registerProfile = useRegisterProfile();
  const redeemReferral = useRedeemReferralCode();

  const phoneE164 = toE164(draft.countryCode, draft.phone);
  // Show the user-friendly format from what they typed.
  const phoneDisplay = draft.phone
    ? `${draft.countryCode} ${draft.phone}`
    : '+20 100 000 0000';

  const [otp, setOtp] = useState('');
  // Firebase's handle on the SMS it sent; the code is checked against it.
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [referralCode, setReferralCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The nanny's ID images upload between account creation and profile save;
  // that gap isn't covered by either mutation's pending flag, so track it here.
  const [isUploadingId, setIsUploadingId] = useState(false);

  const sendCode = useCallback(
    (forceResend: boolean) => {
      setFormError(null);
      sendOtp.mutate(
        { phone: phoneE164, forceResend },
        {
          onSuccess: (result) => {
            setConfirmation(result);
            setSecondsLeft(RESEND_SECONDS);
          },
          onError: (err) => setFormError(err.message),
        },
      );
    },
    // `sendOtp` is a new object every render; the mutation itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phoneE164],
  );

  // Send once on arrival. A ref, not a dep list, because React 18 mounts twice
  // in dev and a second send would invalidate the first code.
  const hasSentRef = useRef(false);
  useEffect(() => {
    if (hasSentRef.current) return;
    hasSentRef.current = true;
    sendCode(false);
  }, [sendCode]);

  // Resend cooldown.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  function handleBack() {
    router.back();
  }

  function handleCompleteSetup() {
    if (!confirmation) {
      setFormError("We haven't sent your code yet. Tap resend to try again.");
      return;
    }
    if (otp.length !== OTP_LENGTH) {
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

    const isNannyRole = apiRole === 'NANNY';

    // Two different addresses, deliberately.
    //
    // `credentialEmail` is the placeholder linked onto the phone-verified
    // Firebase account so SignInScreen has something to check — sign-in is by
    // phone for everyone, so it is the placeholder for everyone.
    //
    // `profileEmail` is what lands in `users.email`: for a nanny the real
    // address she proved two steps in, which is how receipts reach her. A
    // mother has not given one yet; she does at the pre-booking email gate.
    const credentialEmail = phoneToPlaceholderEmail(phoneE164);
    const profileEmail = isNannyRole ? draft.email.trim().toLowerCase() : credentialEmail;

    if (isNannyRole && !draft.emailVerificationToken) {
      setFormError('Your email is not verified. Please go back and confirm the code.');
      return;
    }

    confirmPhone.mutate(
      { confirmation, code: otp, email: credentialEmail, password: draft.password },
      {
        onSuccess: async () => {
          patch({ termsAcceptedAt: Date.now() });

          // Nannies must supply their ID (both sides for a national ID, front
          // only for a passport). Upload happens here, after the Firebase
          // account exists (uploadImageToFirebase needs the signed-in uid) and
          // before the profile is saved so the resulting URLs go out with the
          // register request. The profile photo (required for nannies since
          // RegistrationStep1Screen) uploads alongside it, for the same reason.
          let idDocumentFrontUrl: string | undefined;
          let idDocumentBackUrl: string | undefined;
          let avatarUrl: string | undefined;
          const idDocumentType = draft.idDocumentType ?? undefined;
          if (apiRole === 'NANNY') {
            const needsBack = draft.idDocumentType != null && idTypeRequiresBack(draft.idDocumentType);
            if (!draft.idDocumentType || !draft.idFrontUri || (needsBack && !draft.idBackUri)) {
              setFormError('Your ID is missing. Please go back and upload it.');
              return;
            }
            if (!draft.photoUri) {
              setFormError('Your profile photo is missing. Please go back and add it.');
              return;
            }
            try {
              setIsUploadingId(true);
              idDocumentFrontUrl = await uploadImageToFirebase(draft.idFrontUri, 'nanny-ids');
              if (needsBack && draft.idBackUri) {
                idDocumentBackUrl = await uploadImageToFirebase(draft.idBackUri, 'nanny-ids');
              }
              avatarUrl = await uploadImageToFirebase(draft.photoUri, 'avatars');
            } catch (err) {
              setFormError(
                err instanceof Error
                  ? err.message
                  : 'Could not upload your ID. Please try again.',
              );
              return;
            } finally {
              setIsUploadingId(false);
            }
          }

          registerProfile.mutate(
            {
              firstName: draft.firstName,
              lastName: draft.lastName,
              email: profileEmail,
              phone: phoneE164,
              dateOfBirth: dobIso,
              role: apiRole,
              termsAcceptedVersion: TERMS_VERSION,
              address: draft.address || undefined,
              latitude,
              longitude,
              idDocumentType,
              idDocumentFrontUrl,
              idDocumentBackUrl,
              ...(apiRole === 'NANNY' && {
                // Spent server-side inside the register transaction — this is
                // what makes her account start out with a verified address.
                emailVerificationToken: draft.emailVerificationToken ?? undefined,
                avatarUrl,
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
            },
            {
              onSuccess: async () => {
                // Redeem any referral code now that the backend account exists.
                // Deliberately non-blocking: the account is already created, so
                // a failed redeem must never strand the user mid-onboarding.
                const code = referralCode.trim();
                if (apiRole === 'MOTHER' && code) {
                  try {
                    await redeemReferral.mutateAsync(code);
                  } catch {
                    // Swallowed on purpose — see above.
                  }
                }
                resetDraft();
                router.replace({
                  pathname: '/(auth)/notification-permission',
                  params: { role: localRole },
                });
              },
              onError: (err) => {
                // Backend rejected the registration — the Firebase user
                // already exists, so the user can retry by tapping
                // Complete setup again (idempotent on the backend).
                setFormError(
                  err instanceof Error ? err.message : 'Could not save your profile.',
                );
              },
            },
          );
        },
        onError: (err) => {
          setFormError(err.message);
        },
      },
    );
  }

  function handleOtpChange(value: string) {
    setOtp(value);
    if (formError) setFormError(null);
  }

  const isSubmitting =
    confirmPhone.isPending || isUploadingId || registerProfile.isPending;
  const canSubmit =
    confirmation !== null &&
    otp.length === OTP_LENGTH &&
    termsAccepted &&
    !isSubmitting;
  const resendDisabled = secondsLeft > 0 || sendOtp.isPending;

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
            {`Enter the ${OTP_LENGTH}-digit code we sent to `}
            <Text style={styles.phoneHighlight}>{phoneDisplay}</Text>
          </Text>
        </View>

        {/* OTP input */}
        <View style={styles.otpSection}>
          <OtpCodeInput
            testID="registerStep3.code"
            value={otp}
            onChange={handleOtpChange}
            disabled={isSubmitting}
          />

          <View style={styles.resendRow}>
            <Text style={styles.timerText}>
              {sendOtp.isPending ? 'Sending code…' : "Didn't get a code?"}
            </Text>
            <Pressable onPress={() => sendCode(true)} disabled={resendDisabled} hitSlop={8}>
              <Text
                style={[styles.resendLink, resendDisabled && styles.resendLinkDisabled]}
              >
                {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
              </Text>
            </Pressable>
          </View>

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
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
            confirmPhone.isPending
              ? 'Verifying…'
              : isUploadingId
                ? 'Uploading ID…'
                : registerProfile.isPending
                  ? 'Saving…'
                  : 'Complete setup'
          }
          onPress={handleCompleteSetup}
          disabled={!canSubmit}
        />
      </ScrollView>
    </View>
  );
}
