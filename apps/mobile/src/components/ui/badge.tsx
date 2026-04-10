import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';

import { colors, fontFamily } from '@mobile/theme';

interface BadgeProps {
  count?: number;
  size?: 'sm' | 'md';
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export default function Badge({
  count,
  size = 'md',
  color = colors.error,
  style,
}: BadgeProps) {
  const isDot = count === undefined;
  const dim = isDot ? (size === 'sm' ? 8 : 10) : size === 'sm' ? 16 : 20;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: color,
          width: isDot ? dim : undefined,
          minWidth: dim,
          height: dim,
          borderRadius: dim / 2,
          paddingHorizontal: isDot ? 0 : 4,
        },
        style,
      ]}
    >
      {!isDot && count != null && count > 0 && (
        <Text style={[styles.text, size === 'sm' ? styles.textSm : undefined]}>
          {count > 99 ? '99+' : count}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.white,
  },
  textSm: {
    fontSize: 9,
  },
});
