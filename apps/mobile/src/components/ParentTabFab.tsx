import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors, screenPadding, shadows, PARENT_TAB_FAB_BOTTOM } from '@mobile/theme';

interface ParentTabFabProps {
  onPress?: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * What this particular plus sign creates. The button is icon-only, so
   * without it a screen reader announces nothing at all — and it is what
   * Maestro matches on, since Android exposes it as the content-desc.
   */
  accessibilityLabel?: string;
}

export default function ParentTabFab({
  onPress,
  icon = 'add',
  iconSize = 22,
  style,
  accessibilityLabel,
}: ParentTabFabProps) {
  return (
    <TouchableOpacity
      style={[styles.fab, style]}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={iconSize} color={colors.white} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: PARENT_TAB_FAB_BOTTOM,
    right: screenPadding,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    ...shadows.lg,
  },
});
