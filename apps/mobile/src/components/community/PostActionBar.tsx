import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typeScale } from '@mobile/theme';

type Props = {
  likeCount: number;
  commentCount: number;
  likedByMe?: boolean;
  onLikePress?: () => void;
  onCommentPress?: () => void;
  showShare?: boolean;
};

export default function PostActionBar({
  likeCount,
  commentCount,
  likedByMe = false,
  onLikePress,
  onCommentPress,
  showShare = false,
}: Props) {
  return (
    <View style={styles.row}>
      {/* A heart next to a bare number says nothing on its own — not to a
          screen reader, and not to Maestro, which reads Android's content-desc.
          The label also carries the *state*, which the icon otherwise conveys
          by colour alone. */}
      <Pressable
        style={styles.item}
        accessibilityRole="button"
        accessibilityLabel={likedByMe ? 'Unlike post' : 'Like post'}
        onPress={onLikePress}
      >
        <Ionicons
          name={likedByMe ? 'heart' : 'heart-outline'}
          size={17}
          color={likedByMe ? colors.error : colors.textMuted}
        />
        <Text style={[styles.count, likedByMe && styles.countActive]}>{likeCount}</Text>
      </Pressable>
      <Pressable style={styles.item} onPress={onCommentPress}>
        <Ionicons name="chatbubble-outline" size={17} color={colors.textMuted} />
        <Text style={styles.count}>{commentCount}</Text>
      </Pressable>
      {showShare && (
        <Pressable style={styles.item}>
          <Ionicons name="share-social-outline" size={17} color={colors.textMuted} />
          <Text style={styles.count}>Share</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  count: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  countActive: {
    color: colors.error,
  },
});
