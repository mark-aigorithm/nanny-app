import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
} from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { CommunityPostResponse } from '@nanny-app/shared';

import { Button, Card, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useMyPosts } from '@mobile/hooks/useCommunity';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import {
  formatEventDate,
  formatPrice,
  formatTimeAgo,
  getPostTypeLabel,
} from '@mobile/lib/communityUtils';
import { resolveImageUri } from '@mobile/lib/imageUri';
import { textDirectionStyle } from '@mobile/lib/textDirection';
import { POST_TYPE_ICONS } from '@mobile/components/community/PostTagChip';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/my-posts-screen.styles';

type StatusMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  chipStyle: object;
  textStyle: object;
};

function statusMeta(post: CommunityPostResponse): StatusMeta {
  switch (post.moderationStatus) {
    case 'pending':
      return {
        label: 'Under review',
        icon: 'time-outline',
        color: colors.textTertiary,
        chipStyle: styles.chipPending,
        textStyle: styles.chipTextPending,
      };
    case 'rejected':
      return {
        label: 'Needs changes',
        icon: 'alert-circle',
        color: colors.error,
        chipStyle: styles.chipRejected,
        textStyle: styles.chipTextRejected,
      };
    default:
      return {
        label: 'Live',
        icon: 'checkmark-circle',
        color: colors.successDark,
        chipStyle: styles.chipLive,
        textStyle: styles.chipTextLive,
      };
  }
}

const SUMMARY: { status: CommunityPostResponse['moderationStatus']; label: string }[] = [
  { status: 'rejected', label: 'To fix' },
  { status: 'pending', label: 'In review' },
  { status: 'approved', label: 'Published' },
];

/** The one-line detail under the title: what the type is about. */
function detailLine(post: CommunityPostResponse): string | null {
  switch (post.type) {
    case 'marketplace':
      return formatPrice(post.price);
    case 'event':
      return [formatEventDate(post.eventStartsAt), post.location].filter(Boolean).join(' · ');
    default:
      return null;
  }
}

function editLabel(post: CommunityPostResponse): string {
  if (post.moderationStatus === 'rejected') return 'Edit & resubmit';
  return post.type === 'marketplace' ? 'Edit listing' : 'Edit post';
}

function PostRow({
  post,
  onEdit,
  onOpen,
}: {
  post: CommunityPostResponse;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const meta = statusMeta(post);
  const detail = detailLine(post);
  const imageUri = post.imageUrls
    .map(resolveImageUri)
    .find((url): url is string => Boolean(url));

  return (
    <Card style={styles.postCard}>
      <Pressable style={styles.postHeader} onPress={onOpen} accessibilityRole="button">
        {/* A photo when the post has one; otherwise its type, rather than an
            empty "no image" box that reads as a failed upload. */}
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name={POST_TYPE_ICONS[post.type]} size={24} color={colors.primaryDark} />
          </View>
        )}
        <View style={styles.postBody}>
          <View style={styles.metaRow}>
            <Text style={styles.typeLabel}>{getPostTypeLabel(post.type)}</Text>
            <Text style={styles.postTime}>{formatTimeAgo(post.createdAt)}</Text>
          </View>
          <Text
            style={[styles.postTitle, textDirectionStyle(post.title ?? post.body)]}
            numberOfLines={2}
          >
            {post.title ?? post.body}
          </Text>
          {detail && <Text style={styles.postDetail}>{detail}</Text>}
          <View style={[styles.chip, meta.chipStyle]}>
            <Ionicons name={meta.icon} size={14} color={meta.color} />
            <Text style={[styles.chipText, meta.textStyle]}>{meta.label}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textPlaceholder} />
      </Pressable>

      {post.moderationStatus === 'rejected' && post.rejectionReason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>Reviewer’s note</Text>
          <Text style={styles.reason}>{post.rejectionReason}</Text>
        </View>
      )}

      {post.moderationStatus !== 'approved' && (
        <Button
          variant={post.moderationStatus === 'rejected' ? 'primary' : 'outline'}
          onPress={onEdit}
          title={editLabel(post)}
        />
      )}
    </Card>
  );
}

/**
 * Everything the mother has posted — questions, events and listings — with
 * its review state. This is where a rejected post shows the admin's reason and
 * gets edited and resubmitted.
 */
export default function MyPostsScreen() {
  const bottomPadding = useBottomBarPadding(spacing['4xl']);
  const router = useRouter();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMyPosts();
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);

  const posts = useMemo(() => data?.pages.flatMap((page) => page.posts) ?? [], [data]);

  const openEdit = (postId: number) =>
    router.push({
      pathname: '/(parent)/create-post',
      params: { postId: String(postId) },
    } as never);

  const openDetail = (post: CommunityPostResponse) =>
    router.push({
      pathname: '/(parent)/post-detail',
      params: { postId: String(post.id) },
    } as never);

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title="My posts"
        subtitle="New and edited posts are reviewed before they go live."
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primaryDark}
          />
        }
      >
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primaryDark} />
          </View>
        )}

        {isError && (
          <Text style={styles.errorText}>Couldn’t load your posts. Pull to refresh.</Text>
        )}

        {!isLoading && !isError && posts.length === 0 && (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="create-outline" size={26} color={colors.primaryDark} />
            </View>
            <Text style={styles.emptyTitle}>Nothing posted yet</Text>
            <Text style={styles.emptyBody}>
              Ask a question, host an event or sell something and it will show up here while
              it’s reviewed.
            </Text>
            <Button
              title="Create a post"
              onPress={() => router.push('/(parent)/create-post' as never)}
              style={styles.emptyButton}
            />
          </Card>
        )}

        {/* What needs her attention first: anything sent back, then the queue.
            Counted from what's loaded, so only once every page is in. */}
        {posts.length > 0 && !hasNextPage && (
          <View style={styles.summaryRow}>
            {SUMMARY.map(({ status, label }) => {
              const count = posts.filter((p) => p.moderationStatus === status).length;
              return (
                <View key={status} style={styles.summaryTile}>
                  <Text style={styles.summaryCount}>{count}</Text>
                  <Text style={styles.summaryLabel}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {posts.map((post) => (
          <PostRow
            key={post.id}
            post={post}
            onEdit={() => openEdit(post.id)}
            onOpen={() => openDetail(post)}
          />
        ))}

        {hasNextPage && (
          <Pressable
            style={styles.loadMore}
            onPress={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            <Text style={styles.loadMoreText}>
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
