import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import { Button, OtpCodeInput } from '@mobile/components/ui';
import { useSendPhoneOtp, useConfirmPhoneSignIn } from '@mobile/hooks/useAuth';
import { validatePhone, toE164 } from '@mobile/lib/validation';
import type { PhoneConfirmation } from '@mobile/lib/firebase';
import { styles } from './styles/sign-in-screen.styles';

export default function SignInScreen() {
  const router = useRouter();
  const [countryCode] = useState('+20');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const sendOtp = useSendPhoneOtp();
  const confirmSignIn = useConfirmPhoneSignIn();

  const phoneE164 = toE164(countryCode, phone);
  const isCodePhase = confirmation !== null;

  const sendCode = useCallback(
    (forceResend?: boolean) => {
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

  useEffect(() => {
    if (!isCodePhase || secondsLeft <= 0) return undefined;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [isCodePhase, secondsLeft]);

  function handleSignIn() {
    if (!confirmation) return;
    setFormError(null);
    if (code.length !== OTP_LENGTH) {
      setFormError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    confirmSignIn.mutate(
      { confirmation, code },
      {
        onSuccess: () => router.replace('/'),
        onError: (err) => {
          // A dead number sends her back to the phone field, not the code box.
          // The message belongs under that field only — a form banner would
          // just repeat it once she's looking at the phone phase again.
          if (err.field === 'phone') {
            setConfirmation(null);
            setCode('');
            setPhoneError(err.message);
          } else {
            setFormError(err.message);
          }
        },
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
        <View style={styles.blobTopLeft} />
        <View style={styles.blobBottomRight} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headline}>Welcome back</Text>
            <Text style={styles.subtitle}>
              {isCodePhase
                ? `Enter the ${OTP_LENGTH}-digit code we sent to ${countryCode} ${phone}.`
                : 'Sign in to continue your childcare journey.'}
            </Text>
          </View>

          {!isCodePhase ? (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>{countryCode}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                  </View>
                  <TextInput
                    testID="signIn.phone"
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
            </View>
          ) : (
            <View style={styles.form}>
              <OtpCodeInput
                testID="signIn.code"
                value={code}
                onChange={(val) => {
                  setCode(val);
                  if (formError) setFormError(null);
                }}
                disabled={confirmSignIn.isPending}
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
          )}

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          <Button
            title={
              isCodePhase
                ? confirmSignIn.isPending
                  ? 'Signing in…'
                  : 'Sign in'
                : sendOtp.isPending
                  ? 'Sending…'
                  : 'Send code'
            }
            onPress={isCodePhase ? handleSignIn : () => sendCode()}
            variant="primary"
            fullWidth
            disabled={isCodePhase ? confirmSignIn.isPending : sendOtp.isPending}
          />

          <Pressable
            style={styles.altDoorRow}
            onPress={() => router.push('/(auth)/sign-in-email')}
            hitSlop={8}
          >
            <Text style={styles.altDoorLink}>Sign in with email and password instead</Text>
          </Pressable>

          <Pressable style={styles.footerRow} onPress={() => router.push('/(auth)/role-selection')}>
            <Text style={styles.footerLabel}>Don&apos;t have an account? </Text>
            <Text style={styles.footerLink}>Sign up</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
