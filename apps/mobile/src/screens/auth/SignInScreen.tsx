import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { APP_NAME, OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import { Button, Divider, IconCircle, OtpCodeInput, ScreenContainer } from '@mobile/components/ui';
import AuthIconButton from '@mobile/components/AuthIconButton';
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
 * The signed-out landing and front door. The phone door is the one full-size
 * button; Google/Apple and the email door sit under it as a row of logo
 * tiles, "Create an account" is a line at the foot, and "Skip for now"
 * (guest browsing) sits top right. Forgot password lives on the email door —
 * the only door with a password.
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
  const [phoneFocused, setPhoneFocused] = useState(false);
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
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.blobTopRight} />
        <View style={styles.blobLeft} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <IconCircle icon="heart-outline" size="md" iconColor={colors.primaryDark} />
              <Text style={styles.brandName}>{APP_NAME}</Text>
            </View>
            {/* A pending connection means she has an account to finish signing
                in to — browsing as a guest would quietly drop it. */}
            {!isCodePhase && !pending && (
              <Pressable onPress={continueAsGuest} hitSlop={12} accessibilityRole="button">
                <Text style={styles.skipLink}>Skip for now</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.header}>
            <Text style={styles.headline}>
              {isCodePhase ? 'Check your messages' : 'Welcome back'}
            </Text>
            {isCodePhase ? (
              <Text style={styles.subtitle}>
                {`We sent a ${OTP_LENGTH}-digit code to `}
                <Text style={styles.subtitleStrong}>{`${countryCode} ${phone}`}</Text>
                {'. '}
                {/* Sign-in is the stack root, so there is no back button to
                    escape a mistyped number — this link is the only way out
                    of the code phase and back to the phone field. */}
                <Text
                  style={[styles.inlineLink, confirmSignIn.isPending && styles.linkDisabled]}
                  onPress={confirmSignIn.isPending ? undefined : useDifferentNumber}
                  accessibilityRole="button"
                  accessibilityLabel="Change number"
                >
                  Change
                </Text>
              </Text>
            ) : (
              <Text style={styles.subtitle}>
                Enter your phone number and we&apos;ll text you a sign-in code.
              </Text>
            )}
          </View>

          {pending && (
            <View style={styles.linkBanner}>
              <Text style={styles.linkBannerText}>
                {`You already have an account. Sign in to it once to connect ${SOCIAL_PROVIDER_LABEL[pending.provider]}.`}
              </Text>
              <Pressable onPress={clearPending} hitSlop={8}>
                <Text style={styles.linkBannerDismiss}>Not now</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.form}>
            {!isCodePhase ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Phone number</Text>
                <View
                  style={[
                    styles.phoneRow,
                    phoneFocused && styles.phoneRowFocused,
                    phoneError !== null && styles.phoneRowError,
                  ]}
                >
                  <View style={styles.countryCode}>
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
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                    placeholder="100 000 0000"
                    placeholderTextColor={colors.textPlaceholder}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    accessibilityLabel="Phone number"
                  />
                </View>
                {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
              </View>
            ) : (
              <OtpCodeInput
                testID="signIn.code"
                value={code}
                onChange={(val) => {
                  setCode(val);
                  if (formError) setFormError(null);
                }}
                disabled={confirmSignIn.isPending}
              />
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
                    : 'Continue'
              }
              onPress={isCodePhase ? handleSignIn : () => sendCode()}
              variant="primary"
              fullWidth
              disabled={isCodePhase ? confirmSignIn.isPending : sendOtp.isPending}
            />

            {isCodePhase && (
              <View style={styles.resendRow}>
                <Text style={styles.resendText}>
                  {sendOtp.isPending ? 'Sending code…' : "Didn't get it?"}
                </Text>
                <Pressable onPress={() => sendCode(true)} disabled={resendDisabled} hitSlop={8}>
                  <Text style={[styles.resendLink, resendDisabled && styles.linkDisabled]}>
                    {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {!isCodePhase && (
            <>
              <View style={styles.socialSection}>
                <Divider label="or continue with" />
                <SocialAuthButtons context="sign-in" layout="icons">
                  <AuthIconButton
                    icon="mail-outline"
                    label="Sign in with email"
                    onPress={() => router.push('/(auth)/sign-in-email')}
                  />
                </SocialAuthButtons>
              </View>

              {/* The whole line is the target, not just the bold words. */}
              <Pressable
                style={styles.signUpRow}
                onPress={() => router.push('/(auth)/role-selection')}
                accessibilityRole="button"
                accessibilityLabel="Create an account"
              >
                <Text style={styles.signUpText}>
                  {`New to ${APP_NAME}? `}
                  <Text style={styles.signUpLink}>Create an account</Text>
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
