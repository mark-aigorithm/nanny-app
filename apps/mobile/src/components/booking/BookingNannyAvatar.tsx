import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { BookingResponse } from '@nanny-app/shared';

import { nannyInitials } from '@mobile/lib/bookingDetail';
import { colors, borderRadius, typeScale } from '@mobile/theme';

interface Props {
  nanny: NonNullable<BookingResponse['nanny']>;
  size?: number;
  /** Fill behind the initials when she has no photo. */
  fallbackColor?: string;
  initialsColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** The nanny's photo, or her initials when she hasn't added one. */
export function BookingNannyAvatar({
  nanny,
  size = 52,
  fallbackColor = colors.primaryMuted,
  initialsColor = colors.primaryDark,
  style,
}: Props) {
  const shape = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.wrap, shape, { backgroundColor: fallbackColor }, style]}>
      {nanny.avatarUrl ? (
        <Image
          source={{ uri: nanny.avatarUrl }}
          style={shape}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.initials, { color: initialsColor, fontSize: size * 0.34 }]}>
          {nannyInitials(nanny)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: borderRadius.full,
  },
  initials: {
    ...typeScale.labelLg,
  },
});
