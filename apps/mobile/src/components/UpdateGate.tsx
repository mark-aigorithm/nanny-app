import React, { useEffect, useState } from 'react';
import { Linking, Modal } from 'react-native';

import UpdateAvailableSheet from '@mobile/components/UpdateAvailableSheet';
import UpdateRequiredScreen from '@mobile/screens/UpdateRequiredScreen';
import { useAppVersionCheck } from '@mobile/hooks/useAppVersionCheck';
import { readDismissedUpdate, writeDismissedUpdate } from '@mobile/lib/dismissedUpdate';

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
      // A Modal, not an overlay View: Modals open in their own native window, so
      // only another Modal could cover a View. Rating/shift hosts check
      // useIsUpdateRequired and render nothing meanwhile.
      <Modal
        visible
        transparent={false}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => undefined}
      >
        <UpdateRequiredScreen releaseNotes={data.releaseNotes} onUpdate={openStore} />
      </Modal>
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
