import React, { useState, useEffect, useRef } from 'react';
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
import { OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import {
  useLinkPhoneNumber,
  useConfirmPhoneCode,
  useRegisterProfile,
} from '@mobile/hooks/useAuth';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { toE164 } from '@mobile/lib/validation';
import type { PhoneConfirmation } from '@mobile/lib/firebase';
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

  const linkPhone = useLinkPhoneNumber();
  const confirmCode = useConfirmPhoneCode();
  const registerProfile = useRegisterProfile();

  const phoneE164 = toE164(draft.countryCode, draft.phone);
  // Show the user-friendly format from what they typed; E.164 only goes to Firebase.
  const phoneDisplay = draft.phone
    ? `${draft.countryCode} ${draft.phone}`
    : '+20 100 000 0000';

  const [otp, setOtp] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);
  // Guard against double-sending the initial SMS on hot reload / re-mount
  const didSendInitialRef = useRef(false);

  // Fire the phone link on mount — sends the SMS code to the user's number.
  useEffect(() => {
    if (didSendInitialRef.current) return;
    if (!phoneE164) {
      setFormError('No phone number found. Please go back and add one.');
      return;
    }
    didSendInitialRef.current = true;
    linkPhone.mutate(phoneE164, {
      onSuccess: (conf) => setConfirmation(conf),
      onError: (err) => setFormError(err.message),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!isTimerRunning) return;
    if (resendTimer <= 0) {
      setIsTimerRunning(false);
      return;
    }
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, resendTimer]);

  function handleBack() {
    router.back();
  }

  function handleResend() {
    if (resendTimer > 0) return;
    setOtp('');
    setFormError(null);
    setResendTimer(RESEND_SECONDS);
    setIsTimerRunning(true);
    linkPhone.mutate(phoneE164, {
      onSuccess: (conf) => setConfirmation(conf),
      onError: (err) => setFormError(err.message),
    });
  }

  function handleCompleteSetup() {
    if (otp.length < OTP_LENGTH || !termsAccepted || !confirmation) return;
    setFormError(null);

    confirmCode.mutate(
      {
        confirmation,
        code: otp,
        email: draft.email,
        password: draft.password,
      },
      {
        onSuccess: () => {
          patch({ termsAcceptedAt: Date.now() });

          const dobIso = dobToIso(draft.dob);
          if (!dobIso) {
            setFormError('Date of birth is invalid. Please go back and fix it.');
            return;
          }

          const localRole = draft.role ?? 'parent';
          // Mobile uses 'parent' / 'nanny'; backend enum is 'MOTHER' / 'NANNY'.
          const apiRole = localRole === 'parent' ? 'MOTHER' : 'NANNY';

          registerProfile.mutate(
            {
              firstName: draft.firstName,
              lastName: draft.lastName,
              email: draft.email,
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
                // Backend rejected the registration — Firebase user already
                // exists with linked phone, so the user can retry by tapping
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
          setOtp('');
        },
      },
    );
  }

  function handleOtpChange(value: string) {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setOtp(cleaned);
    if (formError) setFormError(null);
  }

  function formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const isSubmitting = confirmCode.isPending || registerProfile.isPending;
  const canSubmit =
    otp.length === OTP_LENGTH &&
    termsAccepted &&
    !!confirmation &&
    !isSubmitting;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Fixed header bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.brandText}>NannyMom</Text>
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
            <Text style={styles.stepLabel}>STEP 4 OF 4</Text>
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
            {'We sent a 6-digit code to '}
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
            autoFocus
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

          {/* Resend row */}
          <View style={styles.resendRow}>
            <Pressable
              onPress={handleResend}
              disabled={resendTimer > 0 || linkPhone.isPending}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.resendLink,
                  (resendTimer > 0 || linkPhone.isPending) && styles.resendLinkDisabled,
                ]}
              >
                {linkPhone.isPending ? 'Sending\u2026' : 'Resend code'}
              </Text>
            </Pressable>
            {resendTimer > 0 && (
              <Text style={styles.timerText}>in {formatTimer(resendTimer)}</Text>
            )}
          </View>

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
            confirmCode.isPending
              ? 'Verifying\u2026'
              : registerProfile.isPending
                ? 'Saving\u2026'
                : 'Complete setup'
          }
          onPress={handleCompleteSetup}
          disabled={!canSubmit}
        />
      </ScrollView>
    </View>
  );
}
