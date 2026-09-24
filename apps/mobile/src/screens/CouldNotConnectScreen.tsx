import React from 'react';
import { View, Text } from 'react-native';

import { COULD_NOT_CONNECT } from '@mobile/lib/authErrors';
import { colors } from '@mobile/theme';
import { Button, IconCircle, ScreenContainer } from '@mobile/components/ui';
import { styles } from './styles/could-not-connect-screen.styles';

interface CouldNotConnectScreenProps {
  onRetry: () => void;
  onSignOut: () => void;
  isSigningOut: boolean;
}

/**
 * The app root's answer when `/auth/me` fails for any reason but "no account":
 * nothing is known about the account, so she stays signed in and chooses —
 * try again, or sign out.
 */
export default function CouldNotConnectScreen({ onRetry, onSignOut, isSigningOut }: CouldNotConnectScreenProps) {
  return (
    <ScreenContainer useSafeArea={false}>
      <View style={styles.content}>
        <IconCircle
          icon="cloud-offline-outline"
          size="xl"
          backgroundColor={colors.warmSubtle}
          iconColor={colors.primaryDark}
          style={styles.iconCircle}
        />
        <Text style={styles.headline}>Couldn't connect</Text>
        <Text style={styles.body}>{COULD_NOT_CONNECT}</Text>
      </View>

      <View style={styles.footer}>
        <Button title="Retry" onPress={onRetry} disabled={isSigningOut} />
        <Button title="Sign out" variant="outline" onPress={onSignOut} disabled={isSigningOut} loading={isSigningOut} />
      </View>
    </ScreenContainer>
  );
}
