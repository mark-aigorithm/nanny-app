import React from 'react';
import { StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors, screenPadding, shadows, spacing, borderRadius, typeScale } from '@mobile/theme';
import { useFloatingNavClearance } from '@mobile/hooks/useBottomInset';
import PressableScale from '@mobile/components/ui/pressable-scale';
import { Text } from '@mobile/components/ui/text';

interface ParentTabFabProps {
  onPress?: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconSize?: number;
  /**
   * Text beside the icon (an extended FAB). A bare plus over a busy feed
   * doesn't say what it makes; the label does.
   */
  label?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * What this particular plus sign creates. Without it an icon-only button
   * announces nothing to a screen reader — and it is what Maestro matches on,
   * since Android exposes it as the content-desc.
   */
  accessibilityLabel?: string;
}

/** Floats above the parent tab bar, clear of it at any text size. */
export default function ParentTabFab({
  onPress,
  icon = 'add',
  iconSize = 22,
  label,
  style,
  accessibilityLabel,
}: ParentTabFabProps) {
  const navClearance = useFloatingNavClearance();
  return (
    <PressableScale
      style={[
        styles.fab,
        label ? styles.fabExtended : styles.fabRound,
        { bottom: navClearance + spacing.md },
        style,
      ]}
      haptic="tap"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Ionicons name={icon} size={iconSize} color={colors.white} />
      {label ? (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: screenPadding,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    ...shadows.lg,
  },
  fabRound: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  fabExtended: {
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 52,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xl,
    borderRadius: borderRadius.full,
  },
  label: {
    ...typeScale.labelLg,
    color: colors.white,
  },
});
