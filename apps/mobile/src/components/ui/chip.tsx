import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './text';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamily, borderRadius, spacing } from '@mobile/theme';
import PressableScale from './pressable-scale';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
  size?: 'sm' | 'md';
  activeColor?: string;
  inactiveColor?: string;
  style?: StyleProp<ViewStyle>;
}

export default function Chip({
  label,
  active = false,
  onPress,
  dismissible = false,
  onDismiss,
  size = 'md',
  activeColor = colors.primaryAction,
  inactiveColor = colors.taupe,
  style,
}: ChipProps) {
  const minHeight = size === 'md' ? 36 : 30;
  const fontSize = size === 'md' ? 14 : 12;

  return (
    <PressableScale
      onPress={onPress}
      haptic={onPress ? 'select' : undefined}
      style={[
        styles.base,
        {
          minHeight,
          backgroundColor: active ? activeColor : inactiveColor,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            fontSize,
            color: active ? colors.onPrimaryAction : colors.textPrimary,
          },
        ]}
      >
        {label}
      </Text>
      {dismissible && (
        <Pressable onPress={onDismiss ?? onPress} hitSlop={4}>
          <Ionicons
            name="close"
            size={14}
            color={active ? colors.white : colors.textMuted}
            style={{ marginLeft: spacing.xs }}
          />
        </Pressable>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    // Shrinks (and its label wraps) rather than running out of a narrow row.
    flexShrink: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    flexShrink: 1,
  },
});
