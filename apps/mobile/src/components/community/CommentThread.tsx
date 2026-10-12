import React from 'react';
import { View, Pressable, Image, StyleSheet } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import type { CommentResponse } from '@nanny-app/shared';

import { formatAuthorName, formatTimeAgo } from '@mobile/lib/communityUtils';
import { resolveAvatarUri } from '@mobile/lib/imageUri';
import { textDirectionStyle } from '@mobile/lib/textDirection';
import { colors, spacing, borderRadius, typeScale } from '@mobile/theme';

type Props = {
  comment: CommentResponse;
  onLikePress?: (commentId: number) => void;
  /** Gets the comment and its author's name, for the composer's "Replying to". */
  onReplyPress?: (commentId: number, authorName: string) => void;
};

function CommentItem({
  comment,
  onLikePress,
  onReplyPress,
  isReply = false,
}: Props & { isReply?: boolean }) {
  const authorName = formatAuthorName(comment.author);
  const avatarUri = resolveAvatarUri(authorName, comment.author.avatarUrl);

  return (
    <View style={styles.comment}>
      <Image source={{ uri: avatarUri }} style={isReply ? styles.replyAvatar : styles.avatar} />
      <View style={styles.main}>
        <View style={styles.bubble}>
          <View style={styles.authorRow}>
            <Text style={styles.authorName} numberOfLines={1}>
              {authorName}
            </Text>
            <Text style={styles.time}>{formatTimeAgo(comment.createdAt)}</Text>
          </View>
          <Text style={[styles.body, textDirectionStyle(comment.body)]}>{comment.body}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={styles.action}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={comment.likedByMe ? 'Unlike comment' : 'Like comment'}
            onPress={() => onLikePress?.(comment.id)}
          >
            <Ionicons
              name={comment.likedByMe ? 'heart' : 'heart-outline'}
              size={15}
              color={comment.likedByMe ? colors.error : colors.textMuted}
            />
            {comment.likeCount > 0 && (
              <Text style={[styles.actionText, comment.likedByMe && styles.actionTextLiked]}>
                {comment.likeCount}
              </Text>
            )}
          </Pressable>
          {!isReply && onReplyPress && (
            <Pressable
              style={styles.action}
              hitSlop={4}
              accessibilityRole="button"
              onPress={() => onReplyPress(comment.id, authorName)}
            >
              <Text style={styles.actionText}>Reply</Text>
            </Pressable>
          )}
        </View>
        {!isReply && comment.replies.length > 0 && (
          <View style={styles.replies}>
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} onLikePress={onLikePress} isReply />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function CommentThread({ comment, onLikePress, onReplyPress }: Props) {
  return <CommentItem comment={comment} onLikePress={onLikePress} onReplyPress={onReplyPress} />;
}

const styles = StyleSheet.create({
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  replyAvatar: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderTopLeftRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xxs,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  authorName: {
    ...typeScale.labelSm,
    color: colors.textDark,
    flexShrink: 1,
  },
  time: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  // 36pt rows with hitSlop: comfortable to hit without spacing comments apart.
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: spacing.xs,
  },
  actionText: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  actionTextLiked: {
    color: colors.error,
  },
  replies: {
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
});
