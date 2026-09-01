import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import { OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import { Button, OtpCodeInput } from '@mobile/components/ui';
import { useSendEmailOtp, useVerifyEmailOtp } from '@mobile/hooks/useAuth';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { getApiErrorMessage } from '@mobile/lib/api';
import { styles } from './styles/registration-nanny-email-screen.styles';

/**
 * Step 2 of the nanny wizard: prove the address entered on step 1 is hers.
 *
 * The code is sent as soon as the screen opens, so the common path is "read
 * the email, type six digits, continue". A correct code buys a short-lived
 * token, which is parked in the draft and spent by POST /auth/register at the
 * end of the wizard — that is what makes her account start out verified.
 *
 * Verifying here rather than at the end is deliberate: a typo'd address is
 * caught before she uploads an ID and fills in her professional details.
 */
export default function RegistrationNannyEmailScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const email = useRegistrationDraftStore((s) => s.email);
  const patch = useRegistrationDraftStore((s) => s.patch);

  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyEmailOtp();

  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  // Strict Mode and Fast Refresh both re-run effects; without this the user
  // gets two codes and the second invalidates the first they already typed.
  const hasSentRef = useRef(false);

  const send = useCallback(async () => {
    setFormError(null);
    try {
      await sendOtp.mutateAsync(email);
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not send the code. Please try again.'));
    }
    // `sendOtp` is a new object each render; depending on it would resend on
    // every keystroke. The mutation itself is stable in behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    if (hasSentRef.current) return;
    hasSentRef.current = true;
    void send();
  }, [send]);

  // Resend countdown.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function handleBack() {
    router.back();
  }

  async function handleContinue() {
    if (code.length !== OTP_LENGTH) {
      setFormError(`Enter the ${OTP_LENGTH}-digit code we emailed you.`);
      return;
    }
    setFormError(null);
    try {
      const { verificationToken } = await verifyOtp.mutateAsync({ email, code });
      patch({ emailVerificationToken: verificationToken });
      router.push({ pathname: '/(auth)/register-create-password', params: { role } });
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not check that code. Please try again.'));
    }
  }

  const isBusy = sendOtp.isPending || verifyOtp.isPending;
  const canResend = secondsLeft <= 0 && !isBusy;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Fixed header bar */}
        <View style={styles.headerBar}>
          <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Create account</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarTrack}>
          <View style={styles.progressBarFill} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepLabel}>STEP 2 OF 6 — VERIFY EMAIL</Text>

          <View style={styles.headlineGroup}>
            <Text style={styles.headline}>Check your email</Text>
            <Text style={styles.subtitle}>
              {'We sent a 6-digit code to '}
              <Text style={styles.emailHighlight}>{email}</Text>
            </Text>
          </View>

          <OtpCodeInput
            testID="nannyEmail.code"
            value={code}
            onChange={(next) => {
              setCode(next);
              if (formError) setFormError(null);
            }}
            disabled={isBusy}
          />

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn&apos;t get it?</Text>
            <Pressable onPress={() => void send()} disabled={!canResend} hitSlop={8}>
              <Text style={[styles.resendLink, !canResend && styles.resendLinkDisabled]}>
                {canResend ? 'Send a new code' : `Resend in ${secondsLeft}s`}
              </Text>
            </Pressable>
          </View>

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Button
            title={verifyOtp.isPending ? 'Checking…' : 'Continue'}
            onPress={() => void handleContinue()}
            disabled={code.length !== OTP_LENGTH || isBusy}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
