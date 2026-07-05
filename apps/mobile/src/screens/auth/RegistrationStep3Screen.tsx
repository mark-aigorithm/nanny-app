import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { OTP_LENGTH, BYPASS_OTP, APP_NAME } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import { useCreatePhoneAccount, useRegisterProfile } from '@mobile/hooks/useAuth';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
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

  const createAccount = useCreatePhoneAccount();
  const registerProfile = useRegisterProfile();

  const phoneE164 = toE164(draft.countryCode, draft.phone);
  // Show the user-friendly format from what they typed.
  const phoneDisplay = draft.phone
    ? `${draft.countryCode} ${draft.phone}`
    : '+20 100 000 0000';

  // Phone verification is bypassed (no SMS provider yet): the code is
  // pre-filled with the fixed test value and accepted locally.
  const [otp, setOtp] = useState(BYPASS_OTP);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);

  function handleBack() {
    router.back();
  }

  function handleCompleteSetup() {
    if (otp !== BYPASS_OTP) {
      setFormError(`For testing, enter ${BYPASS_OTP} to continue.`);
      return;
    }
    if (!termsAccepted) return;
    setFormError(null);

    const dobIso = dobToIso(draft.dob);
    if (!dobIso) {
      setFormError('Date of birth is invalid. Please go back and fix it.');
      return;
    }

    // Placeholder email derived from the phone number backs the Firebase
    // account while sign-up is phone-only. See phoneToPlaceholderEmail.
    const email = phoneToPlaceholderEmail(phoneE164);

    createAccount.mutate(
      { email, password: draft.password },
      {
        onSuccess: () => {
          patch({ termsAcceptedAt: Date.now() });

          const localRole = draft.role ?? 'parent';
          // Mobile uses 'parent' / 'nanny'; backend enum is 'MOTHER' / 'NANNY'.
          const apiRole = localRole === 'parent' ? 'MOTHER' : 'NANNY';

          registerProfile.mutate(
            {
              firstName: draft.firstName,
              lastName: draft.lastName,
              email,
              phone: phoneE164,
              dateOfBirth: dobIso,
              role: apiRole,
              termsAcceptedVersion: TERMS_VERSION,
              address: draft.address || undefined,
            },
            {
              onSuccess: () => {
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
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setOtp(cleaned);
    if (formError) setFormError(null);
  }

  const isSubmitting = createAccount.isPending || registerProfile.isPending;
  const canSubmit = otp === BYPASS_OTP && termsAccepted && !isSubmitting;

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
            <Text style={styles.phoneHighlight}>{phoneDisplay}</Text>
          </Text>
        </View>

        {/* OTP input */}
        <View style={styles.otpSection}>
          {/* Hidden real input */}
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={otp}
            onChangeText={handleOtpChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            caretHidden
          />

          {/* Visual OTP boxes */}
          <Pressable
            style={styles.otpBoxRow}
            onPress={() => inputRef.current?.focus()}
          >
            {Array.from({ length: OTP_LENGTH }).map((_, i) => {
              const isActive = i === otp.length && otp.length < OTP_LENGTH;
              const digit = otp[i] ?? '';
              return (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    isActive && styles.otpBoxActive,
                  ]}
                >
                  {digit !== '' ? (
                    <Text style={styles.otpDigit}>{digit}</Text>
                  ) : isActive ? (
                    <View style={styles.cursor} />
                  ) : null}
                </View>
              );
            })}
          </Pressable>

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}
        </View>

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
            createAccount.isPending
              ? 'Creating account…'
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
