import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CommunityPostResponse } from '@nanny-app/shared';

import PostActionBar from '@mobile/components/community/PostActionBar';
import PostTagChip from '@mobile/components/community/PostTagChip';
import {
  formatAuthorName,
  formatEventDate,
  formatPrice,
  formatTimeAgo,
} from '@mobile/lib/communityUtils';
import { colors, spacing, borderRadius, typeScale, shadows } from '@mobile/theme';

type Props = {
  post: CommunityPostResponse;
  onPress?: () => void;
  onLikePress?: () => void;
  onCommentPress?: () => void;
  onRsvpPress?: () => void;
  compact?: boolean;
};

export default function PostCard({
  post,
  onPress,
  onLikePress,
  onCommentPress,
  onRsvpPress,
  compact = false,
}: Props) {
  const avatarUri =
    post.author.avatarUrl ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(formatAuthorName(post.author))}`;

  const content = (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
        <View style={styles.authorInfo}>
          <Text style={styles.authorName}>{formatAuthorName(post.author)}</Text>
          <Text style={styles.authorTime}>{formatTimeAgo(post.createdAt)}</Text>
        </View>
        <PostTagChip type={post.type} />
      </View>

      {post.type === 'qa' && (
        <Text style={styles.body} numberOfLines={compact ? 3 : undefined}>
          {post.body}
        </Text>
      )}

      {post.type === 'marketplace' && (
        <>
          {post.imageUrls[0] ? (
            <View style={styles.imageWrap}>
              <Image source={{ uri: post.imageUrls[0] }} style={styles.image} resizeMode="cover" />
              <View style={styles.priceBadge}>
                <Text style={styles.priceBadgeText}>{formatPrice(post.price)}</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.title}>{post.title}</Text>
          {post.body ? (
            <Text style={styles.body} numberOfLines={compact ? 2 : undefined}>
              {post.body}
            </Text>
          ) : null}
        </>
      )}

      {post.type === 'event' && (
        <>
          <Text style={styles.title}>{post.title}</Text>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>{formatEventDate(post.eventStartsAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>{post.location}</Text>
          </View>
          {post.price !== null && (
            <Text style={styles.eventPrice}>{formatPrice(post.price)}</Text>
          )}
          <Text style={styles.attendeeCount}>{post.rsvpCount} going</Text>
          {!compact && (
            <Pressable
              style={[styles.rsvpButton, post.rsvpdByMe && styles.rsvpButtonActive]}
              onPress={onRsvpPress}
            >
              <Text style={[styles.rsvpText, post.rsvpdByMe && styles.rsvpTextActive]}>
                {post.rsvpdByMe ? 'Going' : 'RSVP'}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {post.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {post.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <PostActionBar
        likeCount={post.likeCount}
        commentCount={post.commentCount}
        likedByMe={post.likedByMe}
        onLikePress={onLikePress}
        onCommentPress={onCommentPress ?? onPress}
        showShare={post.type === 'qa'}
      />
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    ...typeScale.bodySm,
    fontWeight: '600',
    color: colors.textDark,
  },
  authorTime: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  title: {
    ...typeScale.headingSm,
    color: colors.textDark,
    marginBottom: spacing.xs,
  },
  imageWrap: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  image: {
    width: '100%',
    height: 180,
  },
  priceBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  priceBadgeText: {
    ...typeScale.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  detailText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  eventPrice: {
    ...typeScale.bodySm,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.xxs,
  },
  attendeeCount: {
    ...typeScale.caption,
    color: colors.textMuted,
    marginVertical: spacing.sm,
  },
  rsvpButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  rsvpButtonActive: {
    backgroundColor: colors.successLight,
  },
  rsvpText: {
    ...typeScale.bodySm,
    color: colors.white,
    fontWeight: '600',
  },
  rsvpTextActive: {
    color: colors.successDark,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  tag: {
    backgroundColor: colors.taupeLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  tagText: {
    ...typeScale.caption,
    color: colors.textTertiary,
  },
});
