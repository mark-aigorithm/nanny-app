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
import { useMyListings } from '@mobile/hooks/useCommunity';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { formatPrice, formatTimeAgo } from '@mobile/lib/communityUtils';
import { resolveImageUri } from '@mobile/lib/imageUri';
import { colors } from '@mobile/theme';
import { styles } from './styles/my-listings-screen.styles';

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

function ListingRow({
  post,
  onEdit,
  onOpen,
}: {
  post: CommunityPostResponse;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const meta = statusMeta(post);
  const imageUri = post.imageUrls
    .map(resolveImageUri)
    .find((url): url is string => Boolean(url));

  return (
    <Card style={styles.listingCard}>
      <Pressable style={styles.listingHeader} onPress={onOpen}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="image-outline" size={20} color={colors.textPlaceholder} />
          </View>
        )}
        <View style={styles.listingBody}>
          <Text style={styles.listingTitle} numberOfLines={1}>
            {post.title}
          </Text>
          <Text style={styles.listingPrice}>{formatPrice(post.price)}</Text>
          <Text style={styles.listingTime}>{formatTimeAgo(post.createdAt)}</Text>
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
          title={post.moderationStatus === 'rejected' ? 'Edit & resubmit' : 'Edit listing'}
        />
      )}
    </Card>
  );
}

/**
 * The seller's own marketplace listings. Everything she has posted lives here
 * with its review state — this is where a rejected listing shows the admin's
 * reason and gets edited and resubmitted.
 */
export default function MyListingsScreen() {
  const router = useRouter();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMyListings();
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);

  const listings = useMemo(() => data?.pages.flatMap((page) => page.posts) ?? [], [data]);

  const openEdit = (postId: number) =>
    router.push({
      pathname: '/(parent)/create-post',
      params: { postId: String(postId), returnTo: 'my-listings' },
    } as never);

  const openDetail = (postId: number) =>
    router.push({
      pathname: '/(parent)/post-detail',
      params: { postId: String(postId), returnTo: 'community', filter: 'Marketplace' },
    } as never);

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title="My listings"
        subtitle="New and edited listings are reviewed before they go live."
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
          <Text style={styles.errorText}>Couldn’t load your listings. Pull to refresh.</Text>
        )}

        {!isLoading && !isError && listings.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="pricetags-outline" size={26} color={colors.textPlaceholder} />
            <Text style={styles.emptyTitle}>Nothing listed yet</Text>
            <Text style={styles.emptyBody}>
              Sell something in the marketplace and it will show up here while it’s reviewed.
            </Text>
          </Card>
        )}

        {listings.map((post) => (
          <ListingRow
            key={post.id}
            post={post}
            onEdit={() => openEdit(post.id)}
            onOpen={() => openDetail(post.id)}
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
