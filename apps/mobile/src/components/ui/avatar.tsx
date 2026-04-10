import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';

import { colors, fontFamily } from '@mobile/theme';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 72,
};

interface AvatarProps {
  uri?: string;
  size?: AvatarSize;
  borderWidth?: number;
  borderColor?: string;
  fallbackInitial?: string;
  style?: StyleProp<ViewStyle>;
}

export default function Avatar({
  uri,
  size = 'md',
  borderWidth = 0,
  borderColor = colors.surfaceMuted,
  fallbackInitial,
  style,
}: AvatarProps) {
  const dim = SIZE_MAP[size];
  const fontSize = dim * 0.4;

  return (
    <View
      style={[
        styles.base,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          borderWidth,
          borderColor,
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: dim - borderWidth * 2, height: dim - borderWidth * 2, borderRadius: (dim - borderWidth * 2) / 2 }]}
        />
      ) : (
        <View style={[styles.fallback, { width: dim, height: dim, borderRadius: dim / 2 }]}>
          <Text style={[styles.initial, { fontSize }]}>
            {fallbackInitial ?? '?'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    backgroundColor: colors.taupe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },
});
