import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CommentResponse } from '@nanny-app/shared';

import { formatAuthorName, formatTimeAgo } from '@mobile/lib/communityUtils';
import { resolveAvatarUri } from '@mobile/lib/imageUri';
import { colors, spacing, borderRadius, typeScale } from '@mobile/theme';

type Props = {
  comment: CommentResponse;
  onLikePress?: (commentId: string) => void;
  onReplyPress?: (commentId: string) => void;
};

function CommentItem({
  comment,
  onLikePress,
  onReplyPress,
  isReply = false,
}: Props & { isReply?: boolean }) {
  const avatarUri = resolveAvatarUri(
    formatAuthorName(comment.author),
    comment.author.avatarUrl,
  );

  return (
    <View style={[styles.commentCard, isReply && styles.replyCard]}>
      <View style={styles.authorRow}>
        <Image source={{ uri: avatarUri }} style={isReply ? styles.replyAvatar : styles.avatar} />
        <Text style={isReply ? styles.replyAuthorName : styles.authorName}>
          {formatAuthorName(comment.author)}
        </Text>
        <Text style={styles.time}>{formatTimeAgo(comment.createdAt)}</Text>
      </View>
      <Text style={isReply ? styles.replyBody : styles.body}>{comment.body}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => onLikePress?.(comment.id)}>
          <Ionicons
            name={comment.likedByMe ? 'heart' : 'heart-outline'}
            size={14}
            color={comment.likedByMe ? colors.error : colors.textMuted}
          />
          <Text style={styles.actionText}>{comment.likeCount}</Text>
        </Pressable>
        {!isReply && (
          <Pressable style={styles.action} onPress={() => onReplyPress?.(comment.id)}>
            <Text style={styles.actionText}>Reply</Text>
          </Pressable>
        )}
      </View>
      {!isReply && comment.replies.length > 0 && (
        <View style={styles.replies}>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onLikePress={onLikePress}
              isReply
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function CommentThread({ comment, onLikePress, onReplyPress }: Props) {
  return (
    <View>
      <CommentItem comment={comment} onLikePress={onLikePress} onReplyPress={onReplyPress} />
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  commentCard: {
    paddingVertical: spacing.sm,
  },
  replyCard: {
    marginTop: spacing.sm,
    paddingLeft: spacing.md,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
  },
  replyAvatar: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
  },
  authorName: {
    ...typeScale.bodySm,
    fontWeight: '600',
    color: colors.textDark,
  },
  replyAuthorName: {
    ...typeScale.caption,
    fontWeight: '600',
    color: colors.textDark,
  },
  time: {
    ...typeScale.caption,
    color: colors.textMuted,
    marginLeft: 'auto',
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  replyBody: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  actionText: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  replies: {
    marginTop: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
});
