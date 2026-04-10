import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@mobile/theme';

type IconCircleSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<IconCircleSize, { container: number; icon: number }> = {
  sm: { container: 32, icon: 16 },
  md: { container: 40, icon: 20 },
  lg: { container: 56, icon: 28 },
  xl: { container: 72, icon: 32 },
};

interface IconCircleProps {
  icon: keyof typeof Ionicons.glyphMap;
  size?: IconCircleSize;
  backgroundColor?: string;
  iconColor?: string;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}

export default function IconCircle({
  icon,
  size = 'md',
  backgroundColor = colors.primaryMuted,
  iconColor = colors.primary,
  iconSize,
  style,
}: IconCircleProps) {
  const dims = SIZE_MAP[size];

  return (
    <View
      style={[
        styles.base,
        {
          width: dims.container,
          height: dims.container,
          borderRadius: dims.container / 2,
          backgroundColor,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize ?? dims.icon} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
