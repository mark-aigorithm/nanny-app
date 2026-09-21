import React from 'react';
import { StyleSheet, View } from 'react-native';

import OfflineScreen from '@mobile/screens/OfflineScreen';
import { useNetworkStatus } from '@mobile/hooks/useNetworkStatus';
import { queryClient } from '@mobile/lib/queryClient';
import { colors } from '@mobile/theme';

/**
 * Mount once in the root layout. Covers the whole app with OfflineScreen
 * while the device has no connection and gets out of the way the moment it
 * returns. It is an overlay, not a route: navigation state is untouched, so
 * "back online" simply reveals the screen the user was already on.
 *
 * Reconnects the OS notices by itself are handled by React Query's
 * onlineManager (`refetchOnReconnect`); the explicit refetch here is for
 * "Try again", which also has to revive queries that already exhausted their
 * retries before the device knew it was offline.
 */
export default function OfflineGate() {
  const { isOffline, recheck } = useNetworkStatus();

  const handleRetry = async () => {
    const stillOffline = await recheck();
    if (!stillOffline) await queryClient.refetchQueries({ type: 'active' });
  };

  if (!isOffline) return null;

  return (
    <View style={styles.overlay}>
      <OfflineScreen onRetry={handleRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    // Above the router stack and the root-mounted hosts on both platforms.
    zIndex: 1000,
    elevation: 1000,
  },
});
