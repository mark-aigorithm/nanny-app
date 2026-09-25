import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import { Button, OtpCodeInput } from '@mobile/components/ui';
import RegistrationHeader from '@mobile/components/RegistrationHeader';
import { auth } from '@mobile/lib/firebase';
import type { FirebaseUser, PhoneConfirmation } from '@mobile/lib/firebase';
import {
  useCheckAvailability,
  useConfirmRegistrationPhone,
  useLinkPhoneToCurrentUser,
  useSendPhoneLinkCode,
  useSendPhoneOtp,
  useSignOut,
  type PhoneLinkChallenge,
} from '@mobile/hooks/useAuth';
import { getApiErrorMessage } from '@mobile/lib/api';
import type { MappedAuthError } from '@mobile/lib/authErrors';
import { abandonSocialSignUpForLink } from '@mobile/lib/pendingLink';
import { nextStep, stepInfo } from '@mobile/lib/registrationSteps';
import { toE164, validatePhone } from '@mobile/lib/validation';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-phone-screen.styles';

const PHONE_TAKEN_MESSAGE = 'This number already has an account.';

// An Android instant verification can be linked only once (see
// useLinkPhoneToCurrentUser), so after a failed link the only way on is a
// fresh SMS.
const INSTANT_VERIFICATION_SPENT_MESSAGE =
  "We couldn't confirm your number. Tap Resend code to get a code by SMS.";

/**
 * What the code is checked against. `sign-in` signs in *as* the number (a
 * new phone sign-up); `link` puts the number *onto* the account already
 * signed in (Google/Apple, or a resumed sign-up that holds more than a phone).
 */
type Challenge =
  | { kind: 'sign-in'; confirmation: PhoneConfirmation }
  | { kind: 'link'; link: PhoneLinkChallenge };

type Phase = 'number' | 'code' | 'verified';

/** Signed in as this sign-up's own account, and it holds more than a phone. */
function linkTarget(user: FirebaseUser | null, signUpUid: string | null): boolean {
  return (
    user !== null &&
    signUpUid !== null &&
    user.uid === signUpUid &&
    user.providerData.some((p) => p.providerId !== 'phone')
  );
}

/**
 * Step 1 of every wizard: prove the phone number, before anything else is
 * typed — a wrong or taken number is found on the first screen, not the last.
 *
 * 1. The number is checked with `/auth/availability` first. A taken number
 *    sends no SMS: the phone wizard says so and offers Sign in; a Google/Apple
 *    sign-up is collision B (the new account is dropped and she signs in with
 *    the number, and Google/Apple is linked once she does).
 * 2. Then the code. A new phone sign-up signs in as the number
 *    (`useConfirmRegistrationPhone`), so every later step runs signed in —
 *    photos upload on the screen that collects them. An account already
 *    signed in (Google/Apple, or a resume) has the number linked onto it.
 *
 * Non-obvious states:
 * - Coming back to this screen with the number already on the account shows
 *   it as verified; "Change number" starts over.
 * - Android can verify the number instantly (no code to type); that
 *   verification can be spent only once, so a failed link asks for an SMS.
 * - Confirming into an account that has no row but holds more than a phone is
 *   a stalled sign-up: the root gate resumes it.
 */
export default function RegistrationPhoneScreen() {
  const router = useRouter();
  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const step = stepInfo('phone', draft);
  const isSocial = draft.authProvider !== 'phone';
  const phoneE164 = toE164(draft.countryCode, draft.phone);

  const checkAvailability = useCheckAvailability();
  const sendOtp = useSendPhoneOtp();
  const sendLinkCode = useSendPhoneLinkCode();
  const confirmPhone = useConfirmRegistrationPhone();
  const linkPhone = useLinkPhoneToCurrentUser();
  const signOut = useSignOut();

  const alreadyVerified =
    draft.accountPhone !== null &&
    draft.accountPhone === phoneE164 &&
    auth().currentUser?.uid === draft.signUpUid;

  const [phase, setPhase] = useState<Phase>(alreadyVerified ? 'verified' : 'number');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The number belongs to an account: "Sign in" is the way on.
  const [numberTaken, setNumberTaken] = useState(false);
  // The signed-in account is no longer this sign-up's: "Start again".
  const [sessionEnded, setSessionEnded] = useState(false);
  // Collision B signs out or deletes this sign-up's account; nothing may run
  // against it from then until the move to sign-in.
  const [isHandingOff, setIsHandingOff] = useState(false);

  // Android verified the number without an SMS at all: there is no code to type.
  const instantlyVerified =
    challenge?.kind === 'link' && challenge.link.autoVerified && !challenge.link.code;

  useEffect(() => {
    if (phase !== 'code' || secondsLeft <= 0) return undefined;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, secondsLeft]);

  function goNext() {
    const next = nextStep('phone', useRegistrationDraftStore.getState());
    if (next) router.push(next);
  }

  function clearErrors() {
    setPhoneError(null);
    setFormError(null);
    setNumberTaken(false);
  }

  // Collision B: the number belongs to an account that already exists. Drop
  // the Google/Apple account this sign-up created, keep its credential, and
  // send her to sign in with the number she typed.
  async function handOffToSignIn() {
    setIsHandingOff(true);
    await abandonSocialSignUpForLink(phoneE164);
    router.dismissTo('/(auth)/sign-in');
  }

  function showSendError(err: MappedAuthError) {
    if (err.field === 'phone') setPhoneError(err.message);
    else setFormError(err.message);
  }

  function send(forceResend: boolean) {
    const onChallenge = (next: Challenge) => {
      setChallenge(next);
      setPhase('code');
      setSecondsLeft(RESEND_SECONDS);
    };
    if (linkTarget(auth().currentUser, draft.signUpUid)) {
      sendLinkCode.mutate(
        { phone: phoneE164, forceResend },
        {
          onSuccess: (link) => {
            // Android read the SMS itself — fill the boxes in for her.
            setCode(link.code ?? '');
            onChallenge({ kind: 'link', link });
          },
          onError: showSendError,
        },
      );
    } else {
      sendOtp.mutate(
        { phone: phoneE164, forceResend },
        {
          onSuccess: (confirmation) => onChallenge({ kind: 'sign-in', confirmation }),
          onError: showSendError,
        },
      );
    }
  }

  async function handleSendCode() {
    clearErrors();
    const invalid = validatePhone(draft.phone);
    if (invalid) {
      setPhoneError(invalid);
      return;
    }
    // Asked before the SMS, which costs money and would sign in as the
    // number. Fail closed: the SMS needs the same connection anyway.
    let phoneTaken: boolean;
    try {
      ({ phoneTaken } = await checkAvailability.mutateAsync({ phone: phoneE164 }));
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not check your number. Please try again.'));
      return;
    }
    if (phoneTaken) {
      if (isSocial) await handOffToSignIn();
      else setNumberTaken(true);
      return;
    }
    send(false);
  }

  function handleFailure(error: MappedAuthError) {
    if (error.code === 'account-exists') {
      // Signed out already: the number is an existing account's.
      backToNumber();
      setNumberTaken(true);
      return;
    }
    if (error.code === 'session-mismatch') {
      setSessionEnded(true);
      setFormError(error.message);
      return;
    }
    if (error.code === 'auth/credential-already-in-use') {
      if (isSocial) {
        void handOffToSignIn();
      } else {
        backToNumber();
        setNumberTaken(true);
      }
      return;
    }
    if (instantlyVerified) {
      // The native side has already spent that verification; linking with it
      // again would always fail, and there is no code box to fall back on.
      setChallenge(null);
      setSecondsLeft(0);
      setFormError(INSTANT_VERIFICATION_SPENT_MESSAGE);
      return;
    }
    setFormError(error.message);
  }

  async function handleVerify() {
    if (!challenge) {
      setFormError("We haven't sent your code yet. Tap Resend code to try again.");
      return;
    }
    if (!instantlyVerified && code.length !== OTP_LENGTH) {
      setFormError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    setFormError(null);
    try {
      if (challenge.kind === 'sign-in') {
        const outcome = await confirmPhone.mutateAsync({
          confirmation: challenge.confirmation,
          code,
          phone: phoneE164,
        });
        if (outcome === 'leftover') {
          // A sign-up that stalled on this number: the root gate resumes it.
          router.replace('/');
          return;
        }
      } else {
        await linkPhone.mutateAsync({
          challenge: challenge.link,
          code,
          phone: phoneE164,
          signUpUid: draft.signUpUid,
        });
        patch({ accountPhone: phoneE164 });
      }
    } catch (error) {
      handleFailure(error as MappedAuthError);
      return;
    }
    setPhase('verified');
    goNext();
  }

  function backToNumber() {
    setPhase('number');
    setChallenge(null);
    setCode('');
    setFormError(null);
  }

  function handleSignIn() {
    router.dismissTo('/(auth)/sign-in');
  }

  function handleStartAgain() {
    signOut.mutate(undefined, { onSettled: () => router.dismissTo('/(auth)/sign-in') });
  }

  const isSending = checkAvailability.isPending || sendOtp.isPending || sendLinkCode.isPending;
  const isVerifying = confirmPhone.isPending || linkPhone.isPending;
  const busy = isSending || isVerifying || isHandingOff;
  const resendDisabled = secondsLeft > 0 || busy;
  const phoneDisplay = `${draft.countryCode} ${draft.phone}`;

  let primary: { title: string; onPress: () => void; disabled: boolean };
  if (phase === 'number') {
    primary = {
      title: isSending ? 'Sending…' : 'Send code',
      onPress: () => void handleSendCode(),
      disabled: busy || sessionEnded,
    };
  } else if (phase === 'code') {
    primary = {
      title: isVerifying ? 'Verifying…' : 'Verify',
      onPress: () => void handleVerify(),
      disabled:
        busy ||
        sessionEnded ||
        challenge === null ||
        (!instantlyVerified && code.length !== OTP_LENGTH),
    };
  } else {
    primary = { title: 'Continue', onPress: goNext, disabled: false };
  }

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
            <Text style={styles.headline}>
              {phase === 'code' ? 'Enter your code' : "What's your number?"}
            </Text>
            <Text style={styles.subtitle}>
              {phase === 'code' ? (
                instantlyVerified ? (
                  'Your number was verified automatically.'
                ) : (
                  <>
                    {`Enter the ${OTP_LENGTH}-digit code we sent to `}
                    <Text style={styles.phoneHighlight}>{phoneDisplay}</Text>
                  </>
                )
              ) : (
                "We'll text you a code to check it's yours. It's also how you'll sign in."
              )}
            </Text>
          </View>

          {phase === 'number' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>{draft.countryCode}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </View>
                {/* The placeholder is an Egyptian mobile with the leading 0
                    dropped — the country-code box already carries the +20. */}
                <TextInput
                  testID="registerPhone.phone"
                  style={[styles.phoneInput, (phoneError !== null || numberTaken) && styles.phoneInputError]}
                  value={draft.phone}
                  onChangeText={(val) => {
                    patch({ phone: val });
                    clearErrors();
                  }}
                  placeholder="100 000 0000"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  editable={!busy}
                />
              </View>
              {phoneError && <Text style={styles.fieldErrorText}>{phoneError}</Text>}
            </View>
          )}

          {numberTaken && (
            <View style={styles.takenCard}>
              <Text style={styles.takenText}>{PHONE_TAKEN_MESSAGE}</Text>
              <Button title="Sign in" variant="outline" onPress={handleSignIn} />
            </View>
          )}

          {phase === 'code' && (
            <View style={styles.codeGroup}>
              {!instantlyVerified && (
                <OtpCodeInput
                  testID="registerPhone.code"
                  value={code}
                  onChange={(next) => {
                    setCode(next);
                    if (formError) setFormError(null);
                  }}
                  disabled={isVerifying}
                />
              )}
              <View style={styles.resendRow}>
                <Text style={styles.timerText}>
                  {isSending ? 'Sending code…' : "Didn't get a code?"}
                </Text>
                <Pressable onPress={() => send(true)} disabled={resendDisabled} hitSlop={8}>
                  <Text style={[styles.link, resendDisabled && styles.linkDisabled]}>
                    {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
              <Pressable onPress={backToNumber} disabled={isVerifying} hitSlop={8}>
                <Text style={[styles.link, isVerifying && styles.linkDisabled]}>Change number</Text>
              </Pressable>
            </View>
          )}

          {phase === 'verified' && (
            <View style={styles.codeGroup}>
              <View style={styles.verifiedRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.verifiedText}>{`${phoneDisplay} is verified.`}</Text>
              </View>
              <Pressable onPress={backToNumber} hitSlop={8}>
                <Text style={styles.link}>Change number</Text>
              </Pressable>
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
          <Button title={primary.title} onPress={primary.onPress} disabled={primary.disabled} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
