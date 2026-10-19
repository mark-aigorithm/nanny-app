import React, { useEffect, useState } from 'react';
import { Linking, Modal, StyleSheet, View } from 'react-native';

import UpdateAvailableSheet from '@mobile/components/UpdateAvailableSheet';
import UpdateRequiredScreen from '@mobile/screens/UpdateRequiredScreen';
import { useAppVersionCheck } from '@mobile/hooks/useAppVersionCheck';
import { colors } from '@mobile/theme';
import { readDismissedUpdate, writeDismissedUpdate } from '@mobile/lib/dismissedUpdate';
import { useUpdateSheetStore } from '@mobile/store/updateSheetStore';

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

  const sheetVisible =
    !!data?.storeUrl &&
    data.status === 'update_available' &&
    dismissed !== undefined &&
    !!data.latestVersion &&
    dismissed !== data.latestVersion;
  // The survey and rating hosts wait on this, so their sheet never stacks on ours.
  const setSheetVisible = useUpdateSheetStore((s) => s.setVisible);
  useEffect(() => {
    setSheetVisible(sheetVisible);
  }, [sheetVisible, setSheetVisible]);
  useEffect(() => () => setSheetVisible(false), [setSheetVisible]);

  if (!data || data.status === 'ok' || !data.storeUrl) return null;
  const storeUrl = data.storeUrl;
  const openStore = () => void Linking.openURL(storeUrl);

  // One Modal for both states, so a sheet -> blocker change is a re-render, not
  // a dismiss-then-present (iOS can drop a Modal presented mid-dismissal). A
  // Modal rather than an overlay View: Modals open in their own native window,
  // so only another Modal could cover a View. Rating/shift hosts check
  // useIsUpdateRequired and render nothing meanwhile.
  if (data.status === 'update_required') {
    return (
      <Modal
        visible
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => undefined}
      >
        <View style={styles.requiredBackground}>
          <UpdateRequiredScreen releaseNotes={data.releaseNotes} onUpdate={openStore} />
        </View>
      </Modal>
    );
  }

  if (!sheetVisible || !data.latestVersion) return null;
  const latestVersion = data.latestVersion;
  const later = () => {
    setDismissed(latestVersion);
    void writeDismissedUpdate(latestVersion);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={later}>
      <UpdateAvailableSheet
        latestVersion={latestVersion}
        releaseNotes={data.releaseNotes}
        onUpdate={openStore}
        onLater={later}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The Modal is transparent (shared with the sheet), so the blocker paints its own opaque fill.
  requiredBackground: { flex: 1, backgroundColor: colors.background },
});
