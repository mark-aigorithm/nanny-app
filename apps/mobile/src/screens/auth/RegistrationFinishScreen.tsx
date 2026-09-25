import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { CURRENT_TERMS_VERSION } from '@nanny-app/shared';
import { idTypeRequiresBack } from '@shared/nanny';
import { colors } from '@mobile/theme';
import Button from '@mobile/components/ui/button';
import ReferralCodeField from '@mobile/components/ReferralCodeField';
import RegistrationHeader from '@mobile/components/RegistrationHeader';
import { auth } from '@mobile/lib/firebase';
import { useRegisterProfile, useSignOut } from '@mobile/hooks/useAuth';
import { apiStatusOf } from '@mobile/lib/api';
import { abandonSocialSignUpForLink } from '@mobile/lib/pendingLink';
import { stepInfo } from '@mobile/lib/registrationSteps';
import { uploadImageToFirebase } from '@mobile/lib/storage';
import { dobToIso } from '@mobile/lib/validation';
import { useRedeemReferralCode } from '@mobile/hooks/useReferrals';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { uploadFor, useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-finish-screen.styles';

const PHOTO_UPLOAD_FAILED_MESSAGE =
  "Couldn't upload your photos. Check your connection and try again.";

const SESSION_ENDED_MESSAGE = 'Your session ended. Please start again.';

const REFERRAL_FAILED = {
  title: 'Your account is ready',
  message: "But the referral code couldn't be applied. You can still use the app as normal.",
};

type Uploads = { avatarUrl: string; idDocumentFrontUrl?: string; idDocumentBackUrl?: string };

/**
 * The last step of every wizard: accept the terms, then create the row.
 * Everything that needs proving was proved on the way — the phone on "Your
 * number", the email on "Secure your account" — and the photos were uploaded
 * on the screens that took them, so this only sends what the draft holds.
 * Complete setup is a safe retry after any failure.
 *
 * - The account signed in must still be this sign-up's (`signUpUid`, holding
 *   its number); otherwise the only way on is "Start again".
 * - Any photo not uploaded yet (an earlier upload failed and she went on) is
 *   uploaded here as a fallback.
 * - A Google/Apple sign-up that the server finds already has an account
 *   (409) is collision B.
 * - A referral code that won't apply doesn't block her: the account is made,
 *   and she's told.
 * - The wizard is left for good: the stack is dismissed before the
 *   notification prompt, so Back can't land in an empty wizard.
 */
export default function RegistrationFinishScreen() {
  const router = useRouter();
  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const resetDraft = useRegistrationDraftStore((s) => s.reset);
  const step = stepInfo('finish', draft);
  const isSocial = draft.authProvider !== 'phone';
  const isMother = (draft.role ?? 'parent') === 'parent';

  const registerProfile = useRegisterProfile();
  const redeemReferral = useRedeemReferralCode();
  const signOut = useSignOut();

  const [referralCode, setReferralCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Collision B deletes or signs out the account this screen is working on.
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const phone = draft.accountPhone ?? '';

  function openLegal(key: 'terms' | 'privacy') {
    router.push({ pathname: '/(auth)/legal/[key]', params: { key } });
  }

  function handleStartAgain() {
    signOut.mutate(undefined, { onSettled: () => router.dismissTo('/(auth)/sign-in') });
  }

  /** Uploads whatever the earlier steps didn't manage to; null if any fails. */
  async function ensureUploads(photoUri: string, needsBack: boolean): Promise<Uploads | null> {
    setIsUploading(true);
    try {
      let avatarUrl = uploadFor(draft.avatarUpload, photoUri);
      if (!avatarUrl) {
        avatarUrl = await uploadImageToFirebase(photoUri, 'avatars');
        patch({ avatarUpload: { uri: photoUri, url: avatarUrl } });
      }
      if (draft.role !== 'nanny' || !draft.idFrontUri) return { avatarUrl };

      let idDocumentFrontUrl = uploadFor(draft.idFrontUpload, draft.idFrontUri);
      if (!idDocumentFrontUrl) {
        idDocumentFrontUrl = await uploadImageToFirebase(draft.idFrontUri, 'nanny-ids');
        patch({ idFrontUpload: { uri: draft.idFrontUri, url: idDocumentFrontUrl } });
      }
      let idDocumentBackUrl: string | undefined;
      if (needsBack && draft.idBackUri) {
        idDocumentBackUrl = uploadFor(draft.idBackUpload, draft.idBackUri) ?? undefined;
        if (!idDocumentBackUrl) {
          idDocumentBackUrl = await uploadImageToFirebase(draft.idBackUri, 'nanny-ids');
          patch({ idBackUpload: { uri: draft.idBackUri, url: idDocumentBackUrl } });
        }
      }
      return { avatarUrl, idDocumentFrontUrl, idDocumentBackUrl };
    } catch {
      return null;
    } finally {
      setIsUploading(false);
    }
  }

  function leaveWizard() {
    const role = draft.role ?? 'parent';
    resetDraft();
    // Pop the whole wizard first: a replace alone would leave its screens
    // under the notification prompt for Back to land in.
    router.dismissAll();
    router.replace({ pathname: '/(auth)/notification-permission', params: { role } });
  }

  async function handleCompleteSetup() {
    if (!termsAccepted) return;
    setFormError(null);

    // The account this sign-up proved its number on must still be the one
    // signed in; anything else can't be finished from here.
    const user = auth().currentUser;
    if (!user || user.uid !== draft.signUpUid || !phone || user.phoneNumber !== phone) {
      setSessionEnded(true);
      setFormError(SESSION_ENDED_MESSAGE);
      return;
    }

    const dobIso = dobToIso(draft.dob);
    if (!dobIso) {
      setFormError('Date of birth is invalid. Please go back and fix it.');
      return;
    }
    const { latitude, longitude } = draft;
    if (latitude === null || longitude === null) {
      setFormError('Home location is missing. Please go back and set it on the map.');
      return;
    }
    const apiRole = draft.role === 'nanny' ? 'NANNY' : 'MOTHER';
    // A social sign-up has no token: Firebase verified its address, and the
    // backend checks that instead.
    const emailVerificationToken = draft.emailVerificationToken;
    if (!isSocial && !emailVerificationToken) {
      setFormError('Your email is not verified. Please go back and confirm the code.');
      return;
    }
    const needsBack = draft.idDocumentType != null && idTypeRequiresBack(draft.idDocumentType);
    if (
      apiRole === 'NANNY' &&
      (!draft.idDocumentType || !draft.idFrontUri || (needsBack && !draft.idBackUri))
    ) {
      setFormError('Your ID is missing. Please go back and upload it.');
      return;
    }
    if (!draft.photoUri) {
      setFormError('Your profile photo is missing. Please go back and add it.');
      return;
    }

    const uploads = await ensureUploads(draft.photoUri, needsBack);
    if (!uploads) {
      setFormError(PHOTO_UPLOAD_FAILED_MESSAGE);
      return;
    }

    // Idempotent on the backend, so tapping Complete setup again after a
    // failure is a safe retry.
    try {
      await registerProfile.mutateAsync({
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: draft.email.trim().toLowerCase(),
        // Spent server-side inside the register transaction — this is what
        // makes a phone sign-up start out with a verified address.
        ...(emailVerificationToken ? { emailVerificationToken } : {}),
        phone,
        dateOfBirth: dobIso,
        role: apiRole,
        termsAcceptedVersion: CURRENT_TERMS_VERSION,
        address: draft.address,
        latitude,
        longitude,
        idDocumentType: draft.idDocumentType ?? undefined,
        ...uploads,
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
        // Collision B, found by the server: drop the new account, keep the
        // credential, and send her to sign in with her number.
        setIsHandingOff(true);
        await abandonSocialSignUpForLink(phone);
        router.dismissTo('/(auth)/sign-in');
        return;
      }
      setFormError(err instanceof Error ? err.message : 'Could not save your profile.');
      return;
    }

    setIsLeaving(true);
    const code = referralCode.trim();
    if (apiRole === 'MOTHER' && code) {
      try {
        await redeemReferral.mutateAsync(code);
      } catch {
        // The account exists either way; a code that won't apply must never
        // strand her mid-onboarding — but she should know it didn't count.
        noticeDialog({ ...REFERRAL_FAILED, onDismiss: leaveWizard });
        return;
      }
    }
    leaveWizard();
  }

  const isSubmitting =
    isUploading || registerProfile.isPending || redeemReferral.isPending || isHandingOff || isLeaving;
  const canSubmit = termsAccepted && !isSubmitting && !sessionEnded;

  return (
    <View style={styles.container}>
      <RegistrationHeader step={step} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepLabel}>{step.label}</Text>

        <View style={styles.headlineGroup}>
          <Text style={styles.headline}>Almost done</Text>
          <Text style={styles.subtitle}>Accept the terms to create your account.</Text>
        </View>

        {phone !== '' && (
          <View style={styles.summaryRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.summaryText}>{`Signed in as ${phone}`}</Text>
          </View>
        )}

        {/* Referral code — mothers only; Care Points have no nanny outlet yet. */}
        {isMother && <ReferralCodeField value={referralCode} onChange={setReferralCode} />}

        {/* The card toggles the box; the two links open their documents. */}
        <Pressable
          style={styles.termsCard}
          onPress={() => setTermsAccepted((prev) => !prev)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
        >
          <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
            {termsAccepted && <Ionicons name="checkmark" size={14} color={colors.white} />}
          </View>
          <Text style={styles.termsText}>
            {'I agree to the '}
            <Text style={styles.termsLink} onPress={() => openLegal('terms')} accessibilityRole="link">
              Terms of Service
            </Text>
            {' and '}
            <Text style={styles.termsLink} onPress={() => openLegal('privacy')} accessibilityRole="link">
              Privacy Policy
            </Text>
          </Text>
        </Pressable>

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
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={
            isUploading
              ? 'Uploading photos…'
              : registerProfile.isPending || isLeaving
                ? 'Saving…'
                : 'Complete setup'
          }
          onPress={() => void handleCompleteSetup()}
          disabled={!canSubmit}
        />
      </View>
    </View>
  );
}
