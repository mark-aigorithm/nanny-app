import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { APP_NAME, OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import { Button, Divider, OtpCodeInput } from '@mobile/components/ui';
import SocialAuthButtons from '@mobile/components/SocialAuthButtons';
import { useSendSignInCode, useConfirmPhoneSignIn } from '@mobile/hooks/useAuth';
import { linkPendingCredential } from '@mobile/lib/pendingLink';
import { SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { validatePhone, toE164, fromE164 } from '@mobile/lib/validation';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useGuestStore } from '@mobile/store/guestStore';
import type { PhoneConfirmation } from '@mobile/lib/firebase';
import { styles } from './styles/sign-in-screen.styles';

/**
 * The signed-out landing and front door. The phone door signs in by SMS code;
 * Google/Apple, the email door, Forgot password, Sign up and "Continue as
 * guest" sit under it.
 *
 * Two phases, gated on whether Firebase has handed back a confirmation for the
 * SMS: the phone field, then the code (which hides everything below the CTA).
 * A Google/Apple collision parks a credential in `pendingLinkStore`; while one
 * is waiting, a banner says so, the number typed during that sign-up is
 * prefilled, guest browsing is hidden, and the next sign-in links it.
 */
export default function SignInScreen() {
  const router = useRouter();
  const pending = usePendingLinkStore((s) => s.pending);
  const clearPending = usePendingLinkStore((s) => s.clear);
  const [countryCode] = useState('+20');
  // A collision during a Google/Apple sign-up brings the number typed there.
  const [phone, setPhone] = useState(() => fromE164(countryCode, pending?.phoneHint ?? null));

  // Sign-up is pushed on top of this screen, so a collision found there comes
  // back to it already mounted — the initializer above has run. Carry the
  // number she typed across when the connection is parked.
  const phoneHint = pending?.phoneHint ?? null;
  useEffect(() => {
    if (phoneHint) setPhone(fromE164(countryCode, phoneHint));
  }, [phoneHint, countryCode]);

  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const sendOtp = useSendSignInCode();
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
      { confirmation, code, phone: phoneE164 },
      {
        // Signed in or an unfinished sign-up — either way the SMS proved the
        // account is hers, so a Google/Apple collision that brought her here
        // links onto it. The root gate then routes, resuming a leftover.
        onSuccess: async () => {
          await linkPendingCredential();
          router.replace('/');
        },
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

  // Sign-in is the stack root now, so there is no back gesture out of the
  // code phase — this is what returns her to the phone field, with the
  // number she typed still there, so a mistyped digit doesn't trap her.
  function useDifferentNumber() {
    setConfirmation(null);
    setCode('');
    setFormError(null);
    setSecondsLeft(RESEND_SECONDS);
  }

  function continueAsGuest() {
    useGuestStore.getState().enterGuestMode();
    // A guest who reached sign-in from RegisterPromptModal (pushed over
    // `(parent)`) pops back to the screen she was on; a cold start has nothing
    // to pop, so it lands on Home.
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(parent)/(tabs)/home');
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
            <Text style={styles.headline}>{`Welcome to ${APP_NAME}`}</Text>
            <Text style={styles.subtitle}>
              {isCodePhase
                ? `Enter the ${OTP_LENGTH}-digit code we sent to ${countryCode} ${phone}.`
                : 'Sign in to continue your childcare journey.'}
            </Text>
          </View>

          {pending && (
            <View style={styles.linkBanner}>
              <Text style={styles.linkBannerText}>
                {`You already have an account. Sign in with your phone once to connect ${SOCIAL_PROVIDER_LABEL[pending.provider]}.`}
              </Text>
              <Pressable onPress={clearPending} hitSlop={8}>
                <Text style={styles.linkBannerDismiss}>Not now</Text>
              </Pressable>
            </View>
          )}

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

              {/* Sign-in is the stack root, so there is no back button to
                  escape a mistyped number — this link is the only way out
                  of the code phase and back to the phone field. */}
              <Pressable
                style={styles.useDifferentNumberRow}
                onPress={useDifferentNumber}
                disabled={confirmSignIn.isPending}
                hitSlop={8}
              >
                <Text
                  style={[styles.resendLink, confirmSignIn.isPending && styles.resendLinkDisabled]}
                >
                  Use a different number
                </Text>
              </Pressable>
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

          {!isCodePhase && (
            <>
              <View style={styles.socialSection}>
                <Divider label="or" />
                <SocialAuthButtons context="sign-in" />
                <Button
                  title="Sign in with email"
                  icon="mail-outline"
                  onPress={() => router.push('/(auth)/sign-in-email')}
                  variant="outline"
                  fullWidth
                />
              </View>

              <Pressable
                style={styles.forgotRow}
                onPress={() => router.push('/(auth)/forgot-password')}
                hitSlop={8}
              >
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>

              <View style={styles.signUpSection}>
                <Divider label={`New to ${APP_NAME}?`} />
                <Button
                  title="Sign up"
                  onPress={() => router.push('/(auth)/role-selection')}
                  variant="outline"
                  fullWidth
                />
              </View>

              {/* A pending connection means she has an account to finish signing
                  in to — browsing as a guest would quietly drop it. */}
              {!pending && (
                <Pressable style={styles.guestRow} onPress={continueAsGuest} hitSlop={8}>
                  <Text style={styles.guestLink}>Continue as guest</Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
