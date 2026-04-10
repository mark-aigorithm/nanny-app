import React from 'react';
import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';

import { colors, borderRadius as br, shadows, spacing } from '@mobile/theme';

interface CardProps {
  children: ReactNode;
  shadow?: 'sm' | 'md' | 'lg';
  padding?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export default function Card({
  children,
  shadow = 'sm',
  padding = spacing.lg,
  radius = br.xl,
  style,
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        shadows[shadow],
        { padding, borderRadius: radius },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
  },
});
