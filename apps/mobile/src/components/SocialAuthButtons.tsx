import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Button } from '@mobile/components/ui';
import { useSocialSignIn } from '@mobile/hooks/useSocialSignIn';
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
  disabled?: boolean;
};

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

  function start(provider: SocialProvider) {
    if (busy) return;
    setError(null);
    socialSignIn.mutate(
      { provider, role },
      {
        onSuccess: (outcome) => {
          switch (outcome) {
            case 'signed-in':
              router.replace('/');
              break;
            case 'new-user':
              if (role) router.push({ pathname: '/(auth)/register-step-1', params: { role } });
              else router.push('/(auth)/role-selection');
              break;
            case 'needs-link':
              if (context === 'sign-up') router.push('/(auth)/sign-in');
              break;
            case 'cancelled':
              break;
          }
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <View style={styles.container}>
      <Button
        title="Continue with Google"
        icon="logo-google"
        variant="outline"
        fullWidth
        onPress={() => start('google')}
        disabled={busy}
      />
      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={borderRadius['2xl']}
          style={styles.appleButton}
          onPress={() => start('apple')}
        />
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
