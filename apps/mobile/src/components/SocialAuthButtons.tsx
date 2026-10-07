import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Button } from '@mobile/components/ui';
import AuthIconButton from '@mobile/components/AuthIconButton';
import { useSocialSignIn, type SocialSignInOutcome } from '@mobile/hooks/useSocialSignIn';
import { isMappedAuthError } from '@mobile/lib/authErrors';
import { firstStep } from '@mobile/lib/registrationSteps';
import { isAppleSignInAvailable } from '@mobile/lib/socialAuth';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { borderRadius } from '@mobile/theme';
import type { Role, SocialProvider } from '@mobile/types';
import { styles } from './styles/social-auth-buttons.styles';

type SocialAuthButtonsProps = {
  /**
   * Where the buttons sit. On sign-up a collision moves to the sign-in screen;
   * on sign-in the user is already there, and its banner appears by itself.
   */
  context: 'sign-in' | 'sign-up';
  /** The role picked on "Create your account"; absent on sign-in. */
  role?: Role;
  /** Set by "Create your account" until a role is picked. */
  disabled?: boolean;
  /**
   * `stacked` (default): full-width labelled buttons. `icons`: one row of
   * logo tiles, for the sign-in screen, which keeps the phone door as its
   * only full-size button.
   */
  layout?: 'stacked' | 'icons';
  /** Extra tiles appended to the `icons` row (the sign-in screen's email door). */
  children?: ReactNode;
};

const SIGN_IN_FAILED = 'Sign-in failed. Please try again.';

/**
 * "Continue with Google" on both platforms, and Apple on iOS when the device
 * supports it — Apple's own button when stacked, an Apple-logo tile in the
 * icon row. What an outcome means is decided in useSocialSignIn;
 * this only turns it into a destination.
 */
export default function SocialAuthButtons({
  context,
  role,
  disabled = false,
  layout = 'stacked',
  children,
}: SocialAuthButtonsProps) {
  const router = useRouter();
  const socialSignIn = useSocialSignIn();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void isAppleSignInAvailable().then((available) => {
      if (alive) setAppleAvailable(available);
    });
    return () => {
      alive = false;
    };
  }, []);

  const busy = disabled || socialSignIn.isPending;

  async function start(provider: SocialProvider) {
    if (busy) return;
    setError(null);
    // Awaited, not handed to mutate()'s callbacks: React Query drops those once
    // this component unmounts, and on "Create your account" it does — seeding
    // the social draft flips that screen into its signed-in mode, which hides
    // these buttons before the outcome arrives, and she would be left there.
    let outcome: SocialSignInOutcome;
    try {
      outcome = await socialSignIn.mutateAsync({ provider, role });
    } catch (err) {
      setError(isMappedAuthError(err) ? err.message : SIGN_IN_FAILED);
      return;
    }
    switch (outcome) {
      case 'signed-in':
        // On sign-up she meant to make an account and got signed in to the
        // one she already has — say so rather than jump silently.
        if (context === 'sign-up') {
          noticeDialog({
            title: 'You already have an account',
            message: 'We signed you in.',
            onDismiss: () => router.replace('/'),
          });
        } else {
          router.replace('/');
        }
        break;
      case 'new-user':
        // useSocialSignIn has seeded the draft (with the role, when picked).
        if (role) router.push(firstStep(useRegistrationDraftStore.getState()));
        else router.push('/(auth)/role-selection');
        break;
      case 'needs-link':
        if (context === 'sign-up') router.dismissTo('/(auth)/sign-in');
        break;
      case 'cancelled':
        break;
    }
  }

  if (layout === 'icons') {
    return (
      <View style={styles.container}>
        <View style={styles.iconRow}>
          <AuthIconButton
            icon="logo-google"
            label="Continue with Google"
            onPress={() => void start('google')}
            disabled={busy}
          />
          {appleAvailable && (
            <AuthIconButton
              icon="logo-apple"
              label="Continue with Apple"
              onPress={() => void start('apple')}
              disabled={busy}
            />
          )}
          {children}
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Button
        title="Continue with Google"
        icon="logo-google"
        variant="outline"
        fullWidth
        onPress={() => void start('google')}
        disabled={busy}
      />
      {/* Apple's own button has no disabled look, so while disabled it would
          seem tappable and do nothing — say what's missing instead. */}
      {appleAvailable &&
        (disabled ? (
          <Text style={styles.hint}>Choose mother or nanny first to continue with Apple.</Text>
        ) : (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={borderRadius['2xl']}
            style={styles.appleButton}
            onPress={() => void start('apple')}
          />
        ))}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
