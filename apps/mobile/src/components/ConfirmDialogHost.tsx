import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, Pressable, Animated, Easing } from 'react-native';

import { Button } from '@mobile/components/ui';
import { useConfirmDialogStore } from '@mobile/store/confirmDialogStore';
import { styles } from './styles/confirm-dialog-host.styles';

/**
 * Renders the app's confirmation dialog. Mounted once in the root layout;
 * everything else drives it through `confirmDialog()`.
 *
 * The dialog is a Modal, and on iOS a Modal can only be presented by the view
 * controller on top. A screen that opens its own Modal (the care-log sheet)
 * and raises a dialog from inside it therefore mounts a second host — `nested`
 * — *inside* that Modal: iOS presents the dialog from the sheet, and the root
 * host yields while the nested one is mounted. Without this the presentation
 * is refused and the app is left unresponsive under an invisible dialog.
 */
export default function ConfirmDialogHost({ nested = false }: { nested?: boolean }) {
  const dialog = useConfirmDialogStore((s) => s.dialog);
  const dismiss = useConfirmDialogStore((s) => s.dismiss);
  const nestedHosts = useConfirmDialogStore((s) => s.nestedHosts);
  const registerNestedHost = useConfirmDialogStore((s) => s.registerNestedHost);
  const unregisterNestedHost = useConfirmDialogStore((s) => s.unregisterNestedHost);

  useEffect(() => {
    if (!nested) return;
    registerNestedHost();
    return unregisterNestedHost;
  }, [nested, registerNestedHost, unregisterNestedHost]);

  const yieldsToNested = !nested && nestedHosts > 0;

  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!dialog || yieldsToNested) {
      enter.setValue(0);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [dialog, enter, yieldsToNested]);

  if (!dialog || yieldsToNested) return null;

  const handleCancel = () => {
    dialog.onCancel?.();
    dismiss();
  };

  // Close first: callbacks usually navigate, and leaving the modal mounted
  // through a route change strands it over the next screen.
  const runAndClose = (action?: () => void) => {
    dismiss();
    action?.();
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={handleCancel}>
      {/* Tapping outside cancels — the same as the cancel button, never the
          confirm, so a stray tap can't trigger a destructive action. */}
      <Pressable style={styles.overlay} onPress={handleCancel}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: enter,
              transform: [
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        >
          {/* Swallow taps on the card itself so they don't reach the overlay. */}
          <Pressable onPress={() => undefined}>
            <Text style={styles.title}>{dialog.title}</Text>
            {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}

            <View style={styles.actions}>
              {dialog.choices
                ? dialog.choices.map((choice) => (
                    <Button
                      key={choice.label}
                      title={choice.label}
                      variant="secondary"
                      onPress={() => runAndClose(choice.onPress)}
                    />
                  ))
                : (
                    <Button
                      title={dialog.confirmLabel ?? 'Confirm'}
                      variant={dialog.destructive ? 'destructive' : 'primary'}
                      onPress={() => runAndClose(dialog.onConfirm)}
                    />
                  )}
              {!dialog.hideCancel && (
                <Button
                  title={dialog.cancelLabel ?? 'Cancel'}
                  variant="text"
                  onPress={handleCancel}
                />
              )}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
