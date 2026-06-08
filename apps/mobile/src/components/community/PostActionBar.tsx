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
      <Pressable style={styles.item} onPress={onLikePress}>
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
