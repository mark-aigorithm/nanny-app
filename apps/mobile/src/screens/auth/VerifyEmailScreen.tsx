import React, { useState } from 'react';
import { View, Text, ScrollView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
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
    if (!(await confirmCode(email, code))) return;
    // The submit hook already wrote the updated profile into the store, which
    // is what the root router reads; drop the cached /auth/me alongside it so
    // nothing refetches its way back to an unverified profile.
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    router.replace('/');
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
                onSuccess: () => router.replace('/(auth)/splash'),
              })
            }
            loading={signOut.isPending}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
