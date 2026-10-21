import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@mobile/components/ui/text';

import { Button } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { UPDATE_IN_STORE_LABEL, storeLinkFallback } from '@mobile/lib/storeLabels';
import {
  STATUS_BAR_HEIGHT,
  borderRadius,
  colors,
  screenPadding,
  shadows,
  spacing,
  typeScale,
} from '@mobile/theme';

interface UpdateAvailableSheetProps {
  latestVersion: string;
  onUpdate: () => void;
  onLater: () => void;
  /** The store URL, when opening it failed; shown as text so she can still update. */
  storeError?: string | null;
}

/**
 * Dismissible "update available" prompt for an optional release: backdrop and
 * sheet only. UpdateGate hosts it in its single Modal. The sheet fits the
 * window below the status bar; its text scrolls and the actions stay pinned.
 */
export default function UpdateAvailableSheet({
  latestVersion,
  onUpdate,
  onLater,
  storeError = null,
}: UpdateAvailableSheetProps) {
  const bottomPadding = useBottomBarPadding(spacing['3xl']);
  const { height } = useWindowDimensions();

  return (
    <View style={styles.backdrop}>
      <View
        style={[styles.sheet, { maxHeight: height - STATUS_BAR_HEIGHT, paddingBottom: bottomPadding }]}
      >
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text accessibilityRole="header" style={styles.headline}>
            A new version is available
          </Text>
          <Text style={styles.body}>Version {latestVersion} is ready in the store.</Text>
          {storeError ? (
            <Text selectable accessibilityLiveRegion="polite" style={styles.storeError}>
              {storeLinkFallback(storeError)}
            </Text>
          ) : null}
        </ScrollView>
        <View style={styles.actions}>
          <Button title={UPDATE_IN_STORE_LABEL} onPress={onUpdate} />
          <Button title="Later" variant="text" onPress={onLater} />
        </View>
      </View>
    </View>
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
    ...shadows.lg,
  },
  scroll: { flexGrow: 0 },
  headline: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  storeError: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});
