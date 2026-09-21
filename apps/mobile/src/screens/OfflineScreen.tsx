import React from 'react';
import { View, Text } from 'react-native';

import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { colors } from '@mobile/theme';
import { Button, IconCircle, ScreenContainer } from '@mobile/components/ui';
import { styles } from './styles/offline-screen.styles';

interface OfflineScreenProps {
  /** Re-checks connectivity; resolves once the check is done, whatever the outcome. */
  onRetry: () => Promise<void>;
}

/**
 * Full-screen "you're offline" state. OfflineGate renders it over the whole
 * app while the device has no connection and un-mounts it the moment the
 * network returns, so it has no navigation of its own — the user lands back
 * exactly where they were.
 */
export default function OfflineScreen({ onRetry }: OfflineScreenProps) {
  // Same "spinner for the whole user-initiated check" semantics as pull-to-refresh.
  const { isRefreshingByUser: isChecking, refreshByUser: retry } = useRefreshByUser(onRetry);

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
        <Text style={styles.headline}>You're offline</Text>
        <Text style={styles.body}>
          Check your Wi‑Fi or mobile data and we'll pick up right where you left off.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button title="Try again" onPress={() => void retry()} loading={isChecking} />
      </View>
    </ScreenContainer>
  );
}
