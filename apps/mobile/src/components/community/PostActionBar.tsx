import React from 'react';
import type { ReactNode } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typeScale } from '@mobile/theme';

type Props = {
  likeCount: number;
  commentCount: number;
  likedByMe?: boolean;
  onLikePress?: () => void;
  onCommentPress?: () => void;
  onSharePress?: () => void;
  /** A control pinned to the right end of the bar (an event's RSVP). */
  trailing?: ReactNode;
};

export default function PostActionBar({
  likeCount,
  commentCount,
  likedByMe = false,
  onLikePress,
  onCommentPress,
  onSharePress,
  trailing,
}: Props) {
  return (
    <View style={styles.row}>
      {/* A heart next to a bare number says nothing on its own — not to a
          screen reader, and not to Maestro, which reads Android's content-desc.
          The label also carries the *state*, which the icon otherwise conveys
          by colour alone. */}
      <Pressable
        style={styles.item}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={likedByMe ? 'Unlike post' : 'Like post'}
        onPress={onLikePress}
      >
        <Ionicons
          name={likedByMe ? 'heart' : 'heart-outline'}
          size={20}
          color={likedByMe ? colors.error : colors.textMuted}
        />
        <Text style={[styles.count, likedByMe && styles.countActive]}>{likeCount}</Text>
      </Pressable>
      <Pressable
        style={styles.item}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}
        onPress={onCommentPress}
      >
        <Ionicons name="chatbubble-outline" size={19} color={colors.textMuted} />
        <Text style={styles.count}>{commentCount}</Text>
      </Pressable>
      {onSharePress && (
        <Pressable
          style={styles.item}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Share post"
          onPress={onSharePress}
        >
          <Ionicons name="share-social-outline" size={19} color={colors.textMuted} />
        </Pressable>
      )}
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // 44pt tall so each action is a comfortable tap, not just its 17pt icon.
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.xs,
  },
  count: {
    ...typeScale.labelMd,
    color: colors.textMuted,
  },
  countActive: {
    color: colors.error,
  },
  trailing: {
    marginLeft: 'auto',
  },
});
