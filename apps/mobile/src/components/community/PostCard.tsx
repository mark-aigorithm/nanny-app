import React from 'react';
import { View, Image, Share, StyleSheet } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import type { CommunityPostResponse } from '@nanny-app/shared';

import PostActionBar from '@mobile/components/community/PostActionBar';
import PostTagChip from '@mobile/components/community/PostTagChip';
import PressableScale from '@mobile/components/ui/pressable-scale';
import {
  formatAuthorName,
  formatEventDate,
  formatPrice,
  formatTimeAgo,
  postShareMessage,
} from '@mobile/lib/communityUtils';
import { resolveAvatarUri, resolveImageUri } from '@mobile/lib/imageUri';
import { textDirectionStyle } from '@mobile/lib/textDirection';
import { colors, spacing, borderRadius, typeScale, shadows } from '@mobile/theme';

type Props = {
  post: CommunityPostResponse;
  onPress?: () => void;
  onLikePress?: () => void;
  onCommentPress?: () => void;
  onRsvpPress?: () => void;
  /** Feed card: long text is clipped and the whole card opens the post. */
  compact?: boolean;
};

/** Platform-authored listings are shown as the brand, never as the admin. */
const OFFICIAL_SELLER_NAME = 'NannyNow';

/** The calendar-page tile on an event: "OCT" over "14". */
function EventDateTile({ iso }: { iso: string | null }) {
  if (!iso) return null;
  const date = new Date(iso);
  return (
    <View style={styles.dateTile}>
      <Text style={styles.dateTileMonth}>
        {date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
      </Text>
      <Text style={styles.dateTileDay}>{date.getDate()}</Text>
    </View>
  );
}

export default function PostCard({
  post,
  onPress,
  onLikePress,
  onCommentPress,
  onRsvpPress,
  compact = false,
}: Props) {
  const authorName = post.isOfficial ? OFFICIAL_SELLER_NAME : formatAuthorName(post.author);
  const avatarUri = resolveAvatarUri(authorName, post.author.avatarUrl);
  const primaryImageUri = post.imageUrls
    .map(resolveImageUri)
    .find((url): url is string => Boolean(url));
  const isFull =
    post.type === 'event' &&
    post.maxAttendees !== null &&
    post.rsvpCount >= post.maxAttendees &&
    !post.rsvpdByMe;

  const sharePost = () => {
    Share.share({ message: postShareMessage(post) }).catch(() => undefined);
  };

  const rsvpButton =
    post.type === 'event' && onRsvpPress ? (
      <PressableScale
        style={[
          styles.rsvpButton,
          post.rsvpdByMe && styles.rsvpButtonActive,
          isFull && styles.rsvpButtonFull,
        ]}
        haptic="tap"
        disabled={isFull}
        onPress={onRsvpPress}
        accessibilityRole="button"
      >
        {post.rsvpdByMe && (
          <Ionicons name="checkmark" size={16} color={colors.successText} />
        )}
        <Text
          style={[
            styles.rsvpText,
            post.rsvpdByMe && styles.rsvpTextActive,
            isFull && styles.rsvpTextFull,
          ]}
        >
          {isFull ? 'Full' : post.rsvpdByMe ? 'Going' : 'RSVP'}
        </Text>
      </PressableScale>
    ) : null;

  const content = (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
        <View style={styles.authorInfo}>
          <View style={styles.authorNameRow}>
            <Text style={styles.authorName}>{authorName}</Text>
            {post.isOfficial && (
              <View style={styles.officialBadge}>
                <Ionicons name="shield-checkmark" size={12} color={colors.primaryDark} />
                <Text style={styles.officialBadgeText}>Official</Text>
              </View>
            )}
          </View>
          <Text style={styles.authorTime}>{formatTimeAgo(post.createdAt)}</Text>
        </View>
        <PostTagChip type={post.type} />
      </View>

      {/* Only the author is ever served a non-approved post, so this doubles as
          her private status line on her own listing. */}
      {post.moderationStatus !== 'approved' && (
        <View
          style={[
            styles.statusChip,
            post.moderationStatus === 'rejected' && styles.statusChipRejected,
          ]}
        >
          <Ionicons
            name={post.moderationStatus === 'rejected' ? 'alert-circle' : 'time-outline'}
            size={14}
            color={post.moderationStatus === 'rejected' ? colors.error : colors.textTertiary}
          />
          <Text
            style={[
              styles.statusChipText,
              post.moderationStatus === 'rejected' && styles.statusChipTextRejected,
            ]}
          >
            {post.moderationStatus === 'rejected' ? 'Needs changes' : 'Under review'}
          </Text>
        </View>
      )}

      {post.type === 'qa' && (
        <>
          {post.title ? (
            <Text style={[styles.title, textDirectionStyle(post.title)]}>{post.title}</Text>
          ) : null}
          <Text
            style={[styles.question, textDirectionStyle(post.body)]}
            numberOfLines={compact ? 4 : undefined}
          >
            {post.body}
          </Text>
        </>
      )}

      {post.type === 'marketplace' && (
        <>
          {primaryImageUri ? (
            <View style={styles.imageWrap}>
              <Image source={{ uri: primaryImageUri }} style={styles.image} resizeMode="cover" />
            </View>
          ) : null}
          <View style={styles.listingRow}>
            <Text style={[styles.title, styles.listingTitle, textDirectionStyle(post.title)]}>
              {post.title}
            </Text>
            <Text style={styles.price}>{formatPrice(post.price)}</Text>
          </View>
          {post.body ? (
            <Text
              style={[styles.body, textDirectionStyle(post.body)]}
              numberOfLines={compact ? 2 : undefined}
            >
              {post.body}
            </Text>
          ) : null}
        </>
      )}

      {post.type === 'event' && (
        <>
          {primaryImageUri && !compact ? (
            <View style={styles.imageWrap}>
              <Image source={{ uri: primaryImageUri }} style={styles.image} resizeMode="cover" />
            </View>
          ) : null}
          <View style={styles.eventRow}>
            <EventDateTile iso={post.eventStartsAt} />
            <View style={styles.eventInfo}>
              <Text style={[styles.title, textDirectionStyle(post.title)]}>{post.title}</Text>
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                <Text style={styles.detailText}>{formatEventDate(post.eventStartsAt)}</Text>
              </View>
              {post.location ? (
                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                  <Text style={styles.detailText}>{post.location}</Text>
                </View>
              ) : null}
              <View style={styles.detailRow}>
                <Ionicons name="people-outline" size={15} color={colors.textMuted} />
                <Text style={styles.detailText}>
                  {post.maxAttendees !== null
                    ? `${post.rsvpCount} going · ${post.maxAttendees} ${post.maxAttendees === 1 ? 'spot' : 'spots'}`
                    : `${post.rsvpCount} going`}
                  {post.price !== null ? ` · ${formatPrice(post.price)}` : ''}
                </Text>
              </View>
            </View>
          </View>
          {post.body && !compact ? (
            <Text style={[styles.body, textDirectionStyle(post.body)]}>{post.body}</Text>
          ) : null}
        </>
      )}

      {post.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {post.tags.map((tag) => (
            <Text key={tag} style={styles.tagText}>
              #{tag}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.divider} />

      <PostActionBar
        likeCount={post.likeCount}
        commentCount={post.commentCount}
        likedByMe={post.likedByMe}
        onLikePress={onLikePress}
        onCommentPress={onCommentPress ?? onPress}
        onSharePress={post.moderationStatus === 'approved' ? sharePost : undefined}
        trailing={rsvpButton}
      />
    </View>
  );

  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.98}>
        {content}
      </PressableScale>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    gap: spacing.md,
    ...shadows.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  authorInfo: {
    flex: 1,
    minWidth: 0,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  authorName: {
    ...typeScale.labelMd,
    color: colors.textDark,
    flexShrink: 1,
  },
  officialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  officialBadgeText: {
    ...typeScale.captionBold,
    color: colors.primaryDark,
  },
  authorTime: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxs,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  statusChipRejected: {
    backgroundColor: colors.errorLight,
  },
  statusChipText: {
    ...typeScale.captionBold,
    color: colors.textTertiary,
  },
  statusChipTextRejected: {
    color: colors.error,
  },
  title: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  question: {
    ...typeScale.bodyLg,
    color: colors.textPrimary,
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  imageWrap: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 10,
  },
  // Title and price share a row; the title wraps and the price never does.
  listingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  listingTitle: {
    flex: 1,
  },
  price: {
    ...typeScale.headingSm,
    color: colors.primaryDark,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  dateTile: {
    width: 52,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.successLight,
    alignItems: 'center',
  },
  dateTileMonth: {
    ...typeScale.captionBold,
    color: colors.successText,
  },
  dateTileDay: {
    ...typeScale.headingLg,
    color: colors.successText,
  },
  eventInfo: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    flexShrink: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
    rowGap: spacing.xxs,
  },
  tagText: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.warmBorder,
  },
  rsvpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: 36,
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
  },
  rsvpButtonActive: {
    backgroundColor: colors.successLight,
  },
  rsvpButtonFull: {
    backgroundColor: colors.neutralLight,
  },
  rsvpText: {
    ...typeScale.labelMd,
    color: colors.white,
  },
  rsvpTextActive: {
    color: colors.successText,
  },
  rsvpTextFull: {
    color: colors.textMuted,
  },
});
