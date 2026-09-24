import React, { useState } from 'react';
import { View, Text, ScrollView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { APP_NAME, OTP_LENGTH } from '@mobile/constants';
import { Button, OtpCodeInput, TextInputField } from '@mobile/components/ui';
import { useSignOut } from '@mobile/hooks/useAuth';
import { useVerifiedEmailSubmit } from '@mobile/hooks/useVerifiedEmailSubmit';
import { validateEmail } from '@mobile/lib/validation';
import { colors } from '@mobile/theme';
import { styles } from './styles/verify-email-screen.styles';

/**
 * Forced email verification for an account that has no proven address —
 * i.e. one created before registration started proving it, which carries the
 * phone-derived placeholder in `users.email`. The root router sends those
 * accounts here instead of the app; the only ways out are confirming an
 * address or signing out. Non-dismissable by design, and the counterpart of
 * `UploadIdScreen` for the other thing an old account can be missing.
 *
 * Two panes, same as the wizard's step 2: the address, then the code we mail
 * it. Sign-in is unaffected — it stays the phone number.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const signOut = useSignOut();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const { requestCode, confirmCode, isSending, isConfirming, error, setError } =
    useVerifiedEmailSubmit();

  const isBusy = isSending || isConfirming;

  const handleSendCode = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (await requestCode(email)) setStep('code');
  };

  const handleConfirm = async () => {
    // The hook owns spending the code, and — when the backend's swap revoked
    // this session — re-establishing one; this screen only needs to know
    // where that leaves her. `null` means the code/token was rejected and
    // `error` is already set, so stay put.
    const outcome = await confirmCode(email, code);
    if (!outcome) return;
    router.replace(outcome === 'home' ? '/' : '/(auth)/sign-in');
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.headerBar}>
          <Text style={styles.brandText}>{APP_NAME}</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepLabel}>CONFIRM YOUR EMAIL</Text>
          <Text style={styles.title}>
            {step === 'email' ? 'Add your email' : 'Check your email'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'email'
              ? 'We send receipts and account updates here, so we need an address you can read. You’ll keep signing in with your phone number.'
              : `We sent a ${OTP_LENGTH}-digit code to ${email}.`}
          </Text>

          {step === 'email' ? (
            <TextInputField
              testID="verifyEmail.email"
              label="Email"
              value={email}
              onChangeText={(val: string) => {
                setEmail(val);
                if (error) setError(null);
              }}
              placeholder="you@example.com"
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
            />
          ) : (
            <OtpCodeInput
              testID="verifyEmail.code"
              value={code}
              onChange={(next) => {
                setCode(next);
                if (error) setError(null);
              }}
              disabled={isBusy}
            />
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          {step === 'email' ? (
            <Button
              title={isSending ? 'Sending…' : 'Send code'}
              onPress={() => void handleSendCode()}
              disabled={isBusy}
            />
          ) : (
            <Button
              title={isConfirming ? 'Confirming…' : 'Confirm'}
              onPress={() => void handleConfirm()}
              disabled={isBusy || code.length !== OTP_LENGTH}
            />
          )}
          <Button
            title="Sign out"
            variant="outline"
            onPress={() =>
              signOut.mutate(undefined, {
                onSuccess: () => router.replace('/(auth)/sign-in'),
              })
            }
            loading={signOut.isPending}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
