import React from 'react';
import { View, Pressable, Modal, ScrollView, StatusBar } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { KeyboardAvoidingView } from '@mobile/components/ui';
import { Ionicons } from '@expo/vector-icons';
import type { Child, ChildInput } from '@nanny-app/shared';

import { colors, spacing } from '@mobile/theme';
import ChildForm from '@mobile/components/ChildForm';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { styles } from './styles/address-form-sheet.styles';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Edit mode when given; otherwise the sheet adds a new child. */
  initial?: Child;
  onSubmit: (input: ChildInput) => void;
  submitting?: boolean;
  error?: string | null;
};

/**
 * ChildForm in a page sheet — the one chrome Profile → Children and the
 * booking picker's "Add a child" / "Edit" all open. Same frame as the address
 * sheet: a header that owns the status bar, and a keyboard-aware scroll so the
 * notes at the bottom and the Save button stay reachable with the keyboard up.
 */
export default function ChildFormSheet({
  visible,
  onClose,
  initial,
  onSubmit,
  submitting,
  error,
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
          <Text style={styles.title}>{initial ? 'Edit child' : 'Add a child'}</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Remount per child so a stale draft never leaks between edits. */}
          <ChildForm
            key={initial?.id ?? 'new'}
            initial={initial}
            onSubmit={onSubmit}
            submitting={submitting}
            error={error}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
