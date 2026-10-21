import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, StyleSheet, View } from 'react-native';

import UpdateAvailableSheet from '@mobile/components/UpdateAvailableSheet';
import UpdateRequiredScreen from '@mobile/screens/UpdateRequiredScreen';
import { useAppVersionCheck } from '@mobile/hooks/useAppVersionCheck';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { colors } from '@mobile/theme';
import { useUpdateSheetStore } from '@mobile/store/updateSheetStore';

/**
 * How long the gate waits before presenting its Modal: other hosts close their
 * sheets in the same commit the update shows, and iOS drops a Modal presented
 * while another is still animating away.
 */
export const PRESENT_DELAY_MS = 350;

/**
 * Mount once in the root layout, beside OfflineGate. Asks the backend whether
 * this install is current, at launch and again every time the app is opened
 * from the background, and either covers the app (update required), offers a
 * dismissible prompt (update available) or stays out of the way. Fails open:
 * while loading, on any error, or without a store link it renders nothing.
 */
export default function UpdateGate() {
  const { data, refetch } = useAppVersionCheck();
  // "Later" hides the optional prompt until she next opens the app.
  const [dismissed, setDismissed] = useState(false);
  // The store link failed to open: both states then show it as text.
  const [openFailed, setOpenFailed] = useState(false);
  const reducedMotion = useReducedMotion();

  // Opening the app from the background re-asks the backend, however recently
  // it answered, and brings a dismissed optional prompt back.
  // iOS can pass through 'inactive' on the way back, so remember the background.
  const wentBackground = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') wentBackground.current = true;
      if (next !== 'active' || !wentBackground.current) return;
      wentBackground.current = false;
      setDismissed(false);
      void refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  const sheetVisible =
    !!data?.storeUrl && data.status === 'update_available' && !!data.latestVersion && !dismissed;
  const wantsModal = sheetVisible || (data?.status === 'update_required' && !!data.storeUrl);
  // Once presented it stays mounted, so a sheet -> blocker change is a re-render.
  const [presentable, setPresentable] = useState(false);
  useEffect(() => {
    if (!wantsModal) {
      setPresentable(false);
      return;
    }
    const timer = setTimeout(() => setPresentable(true), PRESENT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wantsModal]);
  // The survey and rating hosts wait on this, so their sheet never stacks on ours.
  const setSheetVisible = useUpdateSheetStore((s) => s.setVisible);
  useEffect(() => {
    setSheetVisible(sheetVisible);
  }, [sheetVisible, setSheetVisible]);
  useEffect(() => () => setSheetVisible(false), [setSheetVisible]);

  if (!data || data.status === 'ok' || !data.storeUrl || !presentable) return null;
  const storeUrl = data.storeUrl;
  const openStore = () => {
    setOpenFailed(false);
    Linking.openURL(storeUrl).catch(() => setOpenFailed(true));
  };
  const storeError = openFailed ? storeUrl : null;

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
          <UpdateRequiredScreen onUpdate={openStore} storeError={storeError} />
        </View>
      </Modal>
    );
  }

  if (!sheetVisible || !data.latestVersion) return null;
  const latestVersion = data.latestVersion;
  const later = () => setDismissed(true);

  return (
    <Modal
      visible
      transparent
      animationType={reducedMotion ? 'fade' : 'slide'}
      onRequestClose={later}
    >
      <UpdateAvailableSheet
        latestVersion={latestVersion}
        onUpdate={openStore}
        onLater={later}
        storeError={storeError}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The Modal is transparent (shared with the sheet), so the blocker paints its own opaque fill.
  requiredBackground: { flex: 1, backgroundColor: colors.background },
});
