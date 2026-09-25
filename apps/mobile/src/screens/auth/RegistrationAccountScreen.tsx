import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS } from '@shared/email';
import { OTP_LENGTH } from '@mobile/constants';
import { Button, OtpCodeInput, TextInputField } from '@mobile/components/ui';
import RegistrationHeader from '@mobile/components/RegistrationHeader';
import {
  useLinkEmailPassword,
  useSendEmailOtp,
  useSignOut,
  useVerifyEmailOtp,
} from '@mobile/hooks/useAuth';
import { getApiErrorMessage } from '@mobile/lib/api';
import type { MappedAuthError } from '@mobile/lib/authErrors';
import { nextStep, stepInfo } from '@mobile/lib/registrationSteps';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-account-screen.styles';

type Requirement = { key: string; label: string; met: boolean };

function passwordRequirements(password: string, confirm: string): Requirement[] {
  return [
    { key: 'length', label: 'At least 8 characters', met: password.length >= 8 },
    { key: 'uppercase', label: 'Contains an uppercase letter', met: /[A-Z]/.test(password) },
    { key: 'number', label: 'Contains a number', met: /\d/.test(password) },
    { key: 'match', label: 'Passwords match', met: password.length > 0 && password === confirm },
  ];
}

/**
 * "Secure your account" (phone wizard only; Google/Apple proved the email
 * and gave the account a way in): prove the email typed on "About you", then
 * set the password — one screen, in that order.
 *
 * The code is sent as soon as the screen opens and checked as soon as six
 * digits are in. A correct code buys a short-lived token, parked in the draft
 * and spent by POST /auth/register at the end — that is what makes the
 * account start out verified. Only then do the password fields appear.
 *
 * Continue links the email/password onto the account "Your number" signed in
 * as (`useLinkEmailPassword`). The password lives in the draft, so Back and
 * forward again keeps it. A resumed account that already has a password for
 * this very address keeps it: "Your password is already set".
 */
export default function RegistrationAccountScreen() {
  const router = useRouter();
  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const step = stepInfo('account', draft);
  const email = draft.email.trim().toLowerCase();

  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyEmailOtp();
  const linkEmailPassword = useLinkEmailPassword();
  const signOut = useSignOut();

  const emailProved = draft.emailVerificationToken !== null && draft.verifiedEmail === email;
  // A resume whose account already has a password on this address, and no
  // new one typed over it.
  const keepsPassword = draft.passwordEmail === email && !draft.password;

  const [code, setCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(draft.password);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  // Counts down from the server's own cooldown: resend is gated by the API,
  // which returns 429 until it elapses.
  const [secondsLeft, setSecondsLeft] = useState(EMAIL_OTP_RESEND_COOLDOWN_SECONDS);

  // Strict Mode and Fast Refresh both re-run effects; without this the user
  // gets two codes and the second invalidates the first she already typed.
  const hasSentRef = useRef(false);

  const send = useCallback(async () => {
    setCodeError(null);
    try {
      await sendOtp.mutateAsync(email);
      setSecondsLeft(EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setCodeError(getApiErrorMessage(err, 'Could not send the code. Please try again.'));
    }
    // `sendOtp` is a new object each render; depending on it would resend on
    // every keystroke. The mutation itself is stable in behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    if (hasSentRef.current || emailProved) return;
    hasSentRef.current = true;
    void send();
  }, [send, emailProved]);

  useEffect(() => {
    if (emailProved || secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailProved, secondsLeft]);

  async function verify(fullCode: string) {
    setCodeError(null);
    try {
      const { verificationToken } = await verifyOtp.mutateAsync({ email, code: fullCode });
      patch({ emailVerificationToken: verificationToken, verifiedEmail: email });
    } catch (err) {
      setCodeError(getApiErrorMessage(err, 'Could not check that code. Please try again.'));
    }
  }

  function handleCodeChange(next: string) {
    setCode(next);
    if (codeError) setCodeError(null);
    if (next.length === OTP_LENGTH && !verifyOtp.isPending) void verify(next);
  }

  function handleLinkError(err: MappedAuthError) {
    if (err.code === 'session-mismatch' || err.code === 'account-exists') {
      // Either way this attempt is over; "Start again" goes to sign-in.
      setSessionEnded(true);
    }
    setFormError(err.message);
  }

  async function handleContinue() {
    setFormError(null);
    try {
      await linkEmailPassword.mutateAsync({
        email,
        password: keepsPassword ? '' : draft.password,
        emailVerificationToken: draft.emailVerificationToken,
        signUpUid: draft.signUpUid,
      });
    } catch (err) {
      handleLinkError(err as MappedAuthError);
      return;
    }
    const next = nextStep('account', useRegistrationDraftStore.getState());
    if (next) router.push(next);
  }

  function handleStartAgain() {
    signOut.mutate(undefined, { onSettled: () => router.dismissTo('/(auth)/sign-in') });
  }

  const requirements = passwordRequirements(draft.password, confirmPassword);
  const passwordReady = keepsPassword || requirements.every((r) => r.met);
  const canResend = secondsLeft <= 0 && !sendOtp.isPending && !verifyOtp.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
            <Text style={styles.headline}>Secure your account</Text>
            <Text style={styles.subtitle}>
              {emailProved ? (
                'Now choose a password. You can sign in with it or with your phone number.'
              ) : (
                <>
                  {`We sent a ${OTP_LENGTH}-digit code to `}
                  <Text style={styles.emailHighlight}>{email}</Text>
                </>
              )}
            </Text>
          </View>

          {emailProved ? (
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.verifiedText}>{`${email} is verified.`}</Text>
            </View>
          ) : (
            <View style={styles.codeGroup}>
              <OtpCodeInput
                testID="registerAccount.code"
                value={code}
                onChange={handleCodeChange}
                disabled={verifyOtp.isPending}
              />
              {verifyOtp.isPending && <Text style={styles.resendLabel}>Checking…</Text>}
              {codeError && <Text style={styles.fieldErrorText}>{codeError}</Text>}
              <View style={styles.resendRow}>
                <Text style={styles.resendLabel}>Didn&apos;t get it?</Text>
                <Pressable onPress={() => void send()} disabled={!canResend} hitSlop={8}>
                  <Text style={[styles.resendLink, !canResend && styles.resendLinkDisabled]}>
                    {canResend ? 'Send a new code' : `Resend in ${secondsLeft}s`}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {emailProved && keepsPassword && (
            <View style={styles.verifiedRow}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.success} />
              <Text style={styles.verifiedText}>Your password is already set.</Text>
            </View>
          )}

          {emailProved && !keepsPassword && (
            <View style={styles.form}>
              <TextInputField
                label="Password"
                value={draft.password}
                onChangeText={(val: string) => {
                  patch({ password: val });
                  if (formError) setFormError(null);
                }}
                placeholder="Enter a password"
                placeholderTextColor={colors.textPlaceholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
              />
              <TextInputField
                label="Confirm password"
                value={confirmPassword}
                onChangeText={(val: string) => {
                  setConfirmPassword(val);
                  if (formError) setFormError(null);
                }}
                placeholder="Re-enter your password"
                placeholderTextColor={colors.textPlaceholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
              />

              <View style={styles.requirementsCard}>
                <Text style={styles.requirementsTitle}>Your password must include:</Text>
                {requirements.map((req) => (
                  <View key={req.key} style={styles.requirementRow}>
                    <Ionicons
                      name={req.met ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={req.met ? colors.success : colors.textMuted}
                    />
                    <Text style={[styles.requirementText, req.met && styles.requirementTextMet]}>
                      {req.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
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
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={linkEmailPassword.isPending ? 'Saving…' : 'Continue'}
            onPress={() => void handleContinue()}
            disabled={!emailProved || !passwordReady || linkEmailPassword.isPending || sessionEnded}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
