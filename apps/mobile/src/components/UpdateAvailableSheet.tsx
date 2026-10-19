import React from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@mobile/components/ui/text';

import { Button } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { borderRadius, colors, screenPadding, shadows, spacing, typeScale } from '@mobile/theme';

interface UpdateAvailableSheetProps {
  latestVersion: string;
  releaseNotes: string | null;
  onUpdate: () => void;
  onLater: () => void;
}

/** Dismissible "update available" prompt for an optional release. */
export default function UpdateAvailableSheet({
  latestVersion,
  releaseNotes,
  onUpdate,
  onLater,
}: UpdateAvailableSheetProps) {
  const bottomPadding = useBottomBarPadding(spacing['3xl']);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: bottomPadding }]}>
          <Text style={styles.headline}>A new version is available</Text>
          <Text style={styles.body}>Version {latestVersion} is ready in the store.</Text>
          {releaseNotes ? (
            <ScrollView style={styles.notesScroll}>
              <Text style={styles.notes}>{releaseNotes}</Text>
            </ScrollView>
          ) : null}
          <View style={styles.actions}>
            <Button title="Update" onPress={onUpdate} />
            <Button title="Later" variant="text" onPress={onLater} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingTop: spacing['2xl'],
    paddingHorizontal: screenPadding,
    maxHeight: '90%',
    ...shadows.lg,
  },
  headline: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  notesScroll: {
    maxHeight: 160,
    marginTop: spacing.md,
  },
  notes: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});
