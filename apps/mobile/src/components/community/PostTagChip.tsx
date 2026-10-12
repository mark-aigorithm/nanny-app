import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import type { CommunityPostType } from '@nanny-app/shared';

import { colors, spacing, borderRadius, typeScale } from '@mobile/theme';
import { getPostTypeLabel } from '@mobile/lib/communityUtils';

/** One icon per post type, shared by the type chip and the feed's filter. */
export const POST_TYPE_ICONS: Record<CommunityPostType, keyof typeof Ionicons.glyphMap> = {
  qa: 'help-circle-outline',
  marketplace: 'pricetag-outline',
  event: 'calendar-outline',
};

// Dark text on a light tint of the same hue — the old sage-on-taupe "Q&A" was
// too faint to read.
const TAG_STYLES: Record<CommunityPostType, { bg: string; text: string }> = {
  qa: { bg: colors.primaryMuted, text: colors.primaryDark },
  marketplace: { bg: colors.tintYellow, text: colors.tintAmber },
  event: { bg: colors.successLight, text: colors.successText },
};

type Props = {
  type: CommunityPostType;
  label?: string;
};

export default function PostTagChip({ type, label }: Props) {
  const palette = TAG_STYLES[type];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Ionicons name={POST_TYPE_ICONS[type]} size={12} color={palette.text} />
      <Text style={[styles.text, { color: palette.text }]} numberOfLines={1}>
        {label ?? getPostTypeLabel(type)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  text: {
    ...typeScale.captionBold,
  },
});
