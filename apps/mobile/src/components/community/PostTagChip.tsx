import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CommunityPostType } from '@nanny-app/shared';

import { colors, spacing, borderRadius, typeScale } from '@mobile/theme';
import { getPostTypeLabel } from '@mobile/lib/communityUtils';

const TAG_STYLES: Record<
  CommunityPostType,
  { bg: string; text: string }
> = {
  qa: { bg: colors.taupe, text: colors.primary },
  marketplace: { bg: colors.tintYellow, text: colors.goldWarm },
  event: { bg: colors.successLight, text: colors.successDark },
};

type Props = {
  type: CommunityPostType;
  label?: string;
};

export default function PostTagChip({ type, label }: Props) {
  const palette = TAG_STYLES[type];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.text }]}>
        {label ?? getPostTypeLabel(type)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  text: {
    ...typeScale.caption,
    fontWeight: '600',
  },
});
