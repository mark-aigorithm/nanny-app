import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { CommunityPostResponse } from '@nanny-app/shared';

import { Button, Card, ScreenContainer, StackHeader } from '@mobile/components/ui';
import { useMyPosts } from '@mobile/hooks/useCommunity';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import {
  feedFilterForType,
  formatEventDate,
  formatPrice,
  formatTimeAgo,
  getPostTypeLabel,
} from '@mobile/lib/communityUtils';
import { resolveImageUri } from '@mobile/lib/imageUri';
import { colors } from '@mobile/theme';
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
      <Pressable style={styles.postHeader} onPress={onOpen}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="image-outline" size={20} color={colors.textPlaceholder} />
          </View>
        )}
        <View style={styles.postBody}>
          <Text style={styles.typeLabel}>{getPostTypeLabel(post.type)}</Text>
          <Text style={styles.postTitle} numberOfLines={1}>
            {post.title ?? post.body}
          </Text>
          {detail && <Text style={styles.postDetail}>{detail}</Text>}
          <Text style={styles.postTime}>{formatTimeAgo(post.createdAt)}</Text>
        </View>
      </Pressable>

      <View style={[styles.chip, meta.chipStyle]}>
        <Ionicons name={meta.icon} size={14} color={meta.color} />
        <Text style={[styles.chipText, meta.textStyle]}>{meta.label}</Text>
      </View>

      {post.moderationStatus === 'rejected' && post.rejectionReason && (
        <Text style={styles.reason}>{post.rejectionReason}</Text>
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
  const router = useRouter();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMyPosts();
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);

  const posts = useMemo(() => data?.pages.flatMap((page) => page.posts) ?? [], [data]);

  const openEdit = (postId: number) =>
    router.push({
      pathname: '/(parent)/create-post',
      params: { postId: String(postId), returnTo: 'my-posts' },
    } as never);

  const openDetail = (post: CommunityPostResponse) =>
    router.push({
      pathname: '/(parent)/post-detail',
      params: {
        postId: String(post.id),
        returnTo: 'community',
        filter: feedFilterForType(post.type),
      },
    } as never);

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title="My posts"
        subtitle="New and edited posts are reviewed before they go live."
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {isError && (
          <Text style={styles.errorText}>Couldn’t load your posts. Pull to refresh.</Text>
        )}

        {!isLoading && !isError && posts.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="albums-outline" size={26} color={colors.textPlaceholder} />
            <Text style={styles.emptyTitle}>Nothing posted yet</Text>
            <Text style={styles.emptyBody}>
              Ask a question, host an event or sell something and it will show up here while
              it’s reviewed.
            </Text>
          </Card>
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
