import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { OTP_LENGTH } from '@mobile/constants';
import { Button, OtpCodeInput, TextInputField } from '@mobile/components/ui';
import { useEmailGateStore } from '@mobile/store/emailGateStore';
import { useVerifiedEmailSubmit } from '@mobile/hooks/useVerifiedEmailSubmit';
import { validateEmail } from '@mobile/lib/validation';
import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  typeScale,
} from '@mobile/theme';

/**
 * Mother-facing email capture prompt, shown when a mother without a verified
 * address taps a gated action (Book care). Mounted once in the parent layout;
 * opened via `useEmailGateStore` (through `useEmailGate`). Dismissable — she
 * can back out and keep browsing, she just can't book until she confirms.
 *
 * Two panes: the address, then the code we mail her. She signs in with her
 * phone number and always will — this address is only how we reach her, so it
 * asks for nothing else.
 */
export default function EmailVerifyModal() {
  const visible = useEmailGateStore((s) => s.visible);
  const closeEmailGate = useEmailGateStore((s) => s.closeEmailGate);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const { requestCode, confirmCode, isSending, isConfirming, error, setError } =
    useVerifiedEmailSubmit();

  // Reset each time the modal opens, so a dismissed half-finished attempt
  // doesn't reappear with a stale code in the boxes.
  useEffect(() => {
    if (visible) {
      setStep('email');
      setEmail('');
      setCode('');
      setError(null);
    }
  }, [visible, setError]);

  if (!visible) return null;

  const handleSendCode = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (await requestCode(email)) setStep('code');
  };

  const handleConfirm = async () => {
    if (await confirmCode(email, code)) closeEmailGate();
  };

  const isBusy = isSending || isConfirming;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeEmailGate}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeEmailGate} />

        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-outline" size={28} color={colors.primary} />
          </View>

          <Text style={styles.title}>
            {step === 'email' ? 'Confirm your email' : 'Check your email'}
          </Text>
          <Text style={styles.message}>
            {step === 'email'
              ? 'We send your booking receipts here, so we need an address you can read. You’ll keep signing in with your phone number.'
              : `We sent a ${OTP_LENGTH}-digit code to ${email}.`}
          </Text>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 'email' ? (
              <TextInputField
                testID="emailGate.email"
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
                testID="emailGate.code"
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

          <View style={styles.actions}>
            {step === 'email' ? (
              <Button
                title={isSending ? 'Sending…' : 'Send code'}
                onPress={() => void handleSendCode()}
                variant="primary"
                disabled={isBusy}
              />
            ) : (
              <Button
                title={isConfirming ? 'Confirming…' : 'Confirm'}
                onPress={() => void handleConfirm()}
                variant="primary"
                disabled={isBusy || code.length !== OTP_LENGTH}
              />
            )}
            <Button
              title="Maybe later"
              onPress={closeEmailGate}
              variant="text"
              disabled={isBusy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    backgroundColor: colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '86%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    marginBottom: spacing.xs,
  },
  title: {
    ...typeScale.headingSm,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  body: {
    width: '100%',
    marginTop: spacing.md,
  },
  bodyContent: {
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },
  error: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
