import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamily, borderRadius, spacing } from '@mobile/theme';

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
  activeColor = colors.primary,
  inactiveColor = colors.taupe,
  style,
}: ChipProps) {
  const height = size === 'md' ? 36 : 30;
  const fontSize = size === 'md' ? 14 : 12;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        {
          height,
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
            color: active ? colors.white : colors.textPrimary,
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
  },
  label: {
    fontFamily: fontFamily.semiBold,
  },
});
