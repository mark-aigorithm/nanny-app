import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import UpdateAvailableSheet from '@mobile/components/UpdateAvailableSheet';
import UpdateRequiredScreen from '@mobile/screens/UpdateRequiredScreen';
import { useAppVersionCheck } from '@mobile/hooks/useAppVersionCheck';
import { readDismissedUpdate, writeDismissedUpdate } from '@mobile/lib/dismissedUpdate';
import { colors } from '@mobile/theme';

/**
 * Mount once in the root layout, beside OfflineGate. Asks the backend whether
 * this install is current and either covers the app (update required), offers
 * a dismissible prompt (update available) or stays out of the way. Fails open:
 * while loading, on any error, or without a store link it renders nothing.
 */
export default function UpdateGate() {
  const { data } = useAppVersionCheck();
  // undefined until storage has been read, so the sheet never flashes for a dismissed version.
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void readDismissedUpdate().then(setDismissed);
  }, []);

  if (!data || data.status === 'ok' || !data.storeUrl) return null;
  const storeUrl = data.storeUrl;
  const openStore = () => void Linking.openURL(storeUrl);

  if (data.status === 'update_required') {
    return (
      <View style={styles.overlay}>
        <UpdateRequiredScreen releaseNotes={data.releaseNotes} onUpdate={openStore} />
      </View>
    );
  }

  if (dismissed === undefined || !data.latestVersion || dismissed === data.latestVersion) return null;
  const latestVersion = data.latestVersion;

  return (
    <UpdateAvailableSheet
      latestVersion={latestVersion}
      releaseNotes={data.releaseNotes}
      onUpdate={openStore}
      onLater={() => {
        setDismissed(latestVersion);
        void writeDismissedUpdate(latestVersion);
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    // Above the router stack and root-mounted hosts; OfflineGate (mounted after) still wins when offline.
    zIndex: 1000,
    elevation: 1000,
  },
});
