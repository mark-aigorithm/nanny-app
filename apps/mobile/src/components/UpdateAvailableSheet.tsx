import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@mobile/components/ui/text';

import { Button, SlideUpSheet } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { UPDATE_IN_STORE_LABEL, storeLinkFallback } from '@mobile/lib/storeLabels';
import {
  STATUS_BAR_HEIGHT,
  colors,
  screenPadding,
  spacing,
  typeScale,
} from '@mobile/theme';

interface UpdateAvailableSheetProps {
  latestVersion: string;
  onUpdate: () => void;
  onLater: () => void;
  /** The store URL, when opening it failed; shown as text so she can still update. */
  storeError?: string | null;
  /** Plays the slide-down exit, then calls `onClosed`. */
  closing?: boolean;
  onClosed?: () => void;
}

/**
 * Dismissible "update available" prompt for an optional release: backdrop and
 * sheet only. UpdateGate hosts it in its single Modal. The backdrop fades and
 * the sheet slides; a tap on the backdrop is "Later". The sheet fits the
 * window below the status bar; its text scrolls and the actions stay pinned.
 */
export default function UpdateAvailableSheet({
  latestVersion,
  onUpdate,
  onLater,
  storeError = null,
  closing = false,
  onClosed,
}: UpdateAvailableSheetProps) {
  const bottomPadding = useBottomBarPadding(spacing['3xl']);
  const { height } = useWindowDimensions();

  return (
    <SlideUpSheet
      closing={closing}
      onClosed={onClosed}
      onBackdropPress={onLater}
      backdropLabel="Later"
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
    </SlideUpSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: spacing['2xl'],
    paddingHorizontal: screenPadding,
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
