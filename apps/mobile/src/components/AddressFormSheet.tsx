import React from 'react';
import {
  View,
  Pressable,
  Modal,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { KeyboardAvoidingView } from '@mobile/components/ui';
import { Ionicons } from '@expo/vector-icons';
import type { Address, AddressInput } from '@nanny-app/shared';

import { colors, spacing } from '@mobile/theme';
import AddressForm from '@mobile/components/AddressForm';
import { styles } from './styles/address-form-sheet.styles';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Edit mode when given; otherwise the sheet adds a new address. */
  initial?: Address;
  onSubmit: (input: AddressInput) => void;
  submitting?: boolean;
  error?: string | null;
  hideDefaultToggle?: boolean;
};

/**
 * AddressForm in a page sheet — the one chrome the address book, the booking
 * picker's "Add new" and the account screen all open. Keyboard-aware so the
 * landmark field at the bottom stays reachable.
 */
export default function AddressFormSheet({
  visible,
  onClose,
  initial,
  onSubmit,
  submitting,
  error,
  hideDefaultToggle,
}: Props) {
  const bottomPadding = useBottomBarPadding(spacing['4xl']);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>{initial ? 'Edit address' : 'Add address'}</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Remount per address so a stale draft never leaks between edits. */}
          <AddressForm
            key={initial?.id ?? 'new'}
            initial={initial}
            onSubmit={onSubmit}
            submitting={submitting}
            error={error}
            hideDefaultToggle={hideDefaultToggle}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
