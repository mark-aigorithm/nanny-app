import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Button } from '@mobile/components/ui';
import { useSocialSignIn, type SocialSignInOutcome } from '@mobile/hooks/useSocialSignIn';
import { isMappedAuthError } from '@mobile/lib/authErrors';
import { isAppleSignInAvailable } from '@mobile/lib/socialAuth';
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
};

const SIGN_IN_FAILED = 'Sign-in failed. Please try again.';

/**
 * "Continue with Google" on both platforms, and Apple's own button on iOS when
 * the device supports it. What an outcome means is decided in useSocialSignIn;
 * this only turns it into a destination.
 */
export default function SocialAuthButtons({ context, role, disabled = false }: SocialAuthButtonsProps) {
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
        router.replace('/');
        break;
      case 'new-user':
        if (role) router.push({ pathname: '/(auth)/register-step-1', params: { role } });
        else router.push('/(auth)/role-selection');
        break;
      case 'needs-link':
        if (context === 'sign-up') router.dismissTo('/(auth)/sign-in');
        break;
      case 'cancelled':
        break;
    }
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
