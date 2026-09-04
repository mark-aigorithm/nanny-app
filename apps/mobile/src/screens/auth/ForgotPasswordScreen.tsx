import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import { Button, TextInputField } from '@mobile/components/ui';
import OtpCodeInput from '@mobile/components/ui/otp-code-input';
import {
  useSendPhoneOtp,
  useConfirmPhoneAndResetPassword,
} from '@mobile/hooks/useAuth';
import { validatePhone, toE164 } from '@mobile/lib/validation';
import type { PhoneConfirmation } from '@mobile/lib/firebase';
import { styles } from './styles/forgot-password-screen.styles';

// Sign-in is by phone, so recovery is too: text a code, verify it (which signs
// the user in), then set a new password on the account. One screen, two phases
// gated on whether Firebase has handed back a confirmation for the SMS yet.
export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [countryCode] = useState('+20');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Firebase's handle on the SMS it sent; its presence is what advances the
  // screen from the phone-entry phase to the verify-and-reset phase.
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const sendOtp = useSendPhoneOtp();
  const resetPassword = useConfirmPhoneAndResetPassword();

  const phoneE164 = toE164(countryCode, phone);
  const isVerifyPhase = confirmation !== null;

  const requirements = [
    { key: 'length', label: 'At least 8 characters', met: password.length >= 8 },
    { key: 'uppercase', label: 'Contains an uppercase letter', met: /[A-Z]/.test(password) },
    { key: 'number', label: 'Contains a number', met: /\d/.test(password) },
    {
      key: 'match',
      label: 'Passwords match',
      met: password.length > 0 && password === confirmPassword,
    },
  ];
  const passwordValid = requirements.every((r) => r.met);

  const sendCode = useCallback(
    (forceResend: boolean) => {
      setFormError(null);
      setPhoneError(null);
      const phoneValidation = validatePhone(phone);
      if (phoneValidation) {
        setPhoneError(phoneValidation);
        return;
      }
      sendOtp.mutate(
        { phone: phoneE164, forceResend },
        {
          onSuccess: (result) => {
            setConfirmation(result);
            setSecondsLeft(RESEND_SECONDS);
          },
          onError: (err) => {
            if (err.field === 'phone') setPhoneError(err.message);
            else setFormError(err.message);
          },
        },
      );
    },
    // `sendOtp` is a fresh object each render; the mutation itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phone, phoneE164],
  );

  // Resend cooldown, only while verifying.
  useEffect(() => {
    if (!isVerifyPhase || secondsLeft <= 0) return undefined;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [isVerifyPhase, secondsLeft]);

  function handleBack() {
    // Back steps out of the verify phase first, then off the screen.
    if (isVerifyPhase) {
      setConfirmation(null);
      setOtp('');
      setFormError(null);
      return;
    }
    router.push('/(auth)/sign-in');
  }

  function handleReset() {
    if (!confirmation) return;
    setFormError(null);
    if (otp.length !== OTP_LENGTH) {
      setFormError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    if (!passwordValid) {
      setFormError('Please choose a password that meets all the requirements.');
      return;
    }
    resetPassword.mutate(
      { confirmation, code: otp, newPassword: password },
      {
        // The code confirm signed them in and the password is updated — send
        // them through the root gate, which routes by profile + role.
        onSuccess: () => router.replace('/'),
        onError: (err) => setFormError(err.message),
      },
    );
  }

  const resendDisabled = secondsLeft > 0 || sendOtp.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Header */}
        <View style={styles.headerBar}>
          <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Headline */}
          <View style={styles.headlineGroup}>
            <Text style={styles.headline}>Reset your password</Text>
            {isVerifyPhase ? (
              <Text style={styles.subtitle}>
                {`Enter the ${OTP_LENGTH}-digit code we sent to `}
                <Text style={styles.phoneHighlight}>{`${countryCode} ${phone}`}</Text>
                {' and choose a new password.'}
              </Text>
            ) : (
              <Text style={styles.subtitle}>
                Enter your phone number and we{'’'}ll text you a code to reset
                your password.
              </Text>
            )}
          </View>

          {!isVerifyPhase ? (
            /* ── Phase 1: phone ── */
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>{countryCode}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </View>
                <TextInput
                  testID="forgotPassword.phone"
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={(val: string) => {
                    setPhone(val);
                    if (phoneError) setPhoneError(null);
                    if (formError) setFormError(null);
                  }}
                  placeholder="100 000 0000"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
              {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
            </View>
          ) : (
            /* ── Phase 2: verify + new password ── */
            <View style={styles.form}>
              <View style={styles.otpSection}>
                <OtpCodeInput
                  testID="forgotPassword.code"
                  value={otp}
                  onChange={(val) => {
                    setOtp(val);
                    if (formError) setFormError(null);
                  }}
                  disabled={resetPassword.isPending}
                />
                <View style={styles.resendRow}>
                  <Text style={styles.timerText}>
                    {sendOtp.isPending ? 'Sending code…' : "Didn't get a code?"}
                  </Text>
                  <Pressable onPress={() => sendCode(true)} disabled={resendDisabled} hitSlop={8}>
                    <Text style={[styles.resendLink, resendDisabled && styles.resendLinkDisabled]}>
                      {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <TextInputField
                label="New password"
                value={password}
                onChangeText={(val: string) => {
                  setPassword(val);
                  if (formError) setFormError(null);
                }}
                placeholder="Enter a new password"
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

          {/* Form-level error */}
          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          {/* CTA */}
          <Button
            title={
              isVerifyPhase
                ? resetPassword.isPending
                  ? 'Resetting…'
                  : 'Reset password'
                : sendOtp.isPending
                  ? 'Sending…'
                  : 'Send code'
            }
            onPress={isVerifyPhase ? handleReset : () => sendCode(false)}
            variant="primary"
            fullWidth
            disabled={
              isVerifyPhase
                ? resetPassword.isPending || otp.length !== OTP_LENGTH || !passwordValid
                : sendOtp.isPending
            }
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
