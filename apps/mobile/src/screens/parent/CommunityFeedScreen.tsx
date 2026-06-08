import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import BottomNav from '@mobile/components/BottomNav';
import PostCard from '@mobile/components/community/PostCard';
import {
  useCommunityPosts,
  useToggleEventRsvp,
  useTogglePostLike,
} from '@mobile/hooks/useCommunity';
import { filterPillToType } from '@mobile/lib/communityUtils';
import type { CommunityFilterPill } from '@mobile/types';
import { colors } from '@mobile/theme';
import { styles } from './styles/community-feed-screen.styles';

const FILTER_PILLS: CommunityFilterPill[] = ['All posts', 'Q&A', 'Marketplace', 'Events'];

export default function CommunityFeedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const initialFilter = (params.filter as CommunityFilterPill) ?? 'All posts';
  const [activeFilter, setActiveFilter] = useState<CommunityFilterPill>(initialFilter);

  useEffect(() => {
    if (params.filter && FILTER_PILLS.includes(params.filter as CommunityFilterPill)) {
      setActiveFilter(params.filter as CommunityFilterPill);
    }
  }, [params.filter]);

  const typeFilter = useMemo(() => filterPillToType(activeFilter), [activeFilter]);
  const {
    data,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCommunityPosts(typeFilter);
  const toggleLike = useTogglePostLike();
  const toggleRsvp = useToggleEventRsvp();

  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Community</Text>
          <View style={styles.headerRight}>
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Live feed</Text>
            </View>
            <Pressable style={styles.headerIcon}>
              <Ionicons name="search" size={20} color={colors.textDark} />
            </Pressable>
            <Pressable style={styles.headerIcon}>
              <Ionicons name="notifications-outline" size={20} color={colors.textDark} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_PILLS.map((pill) => {
            const isActive = pill === activeFilter;
            return (
              <Pressable
                key={pill}
                style={[
                  styles.filterPill,
                  isActive ? styles.filterPillActive : styles.filterPillInactive,
                ]}
                onPress={() => setActiveFilter(pill)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isActive ? styles.filterPillTextActive : styles.filterPillTextInactive,
                  ]}
                >
                  {pill}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        style={styles.scroll}
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.scrollContent,
          (isLoading || posts.length === 0) && styles.scrollContentEmpty,
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loadingIndicator} />
          ) : (
            <Text style={styles.filterPillTextInactive}>No posts in this category yet.</Text>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : null
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() =>
              router.push({
                pathname: '/(parent)/post-detail',
                params: {
                  postId: item.id,
                  returnTo: 'community-feed',
                  ...(activeFilter !== 'All posts' ? { filter: activeFilter } : {}),
                },
              })
            }
            onLikePress={() => toggleLike.mutate(item.id)}
            onRsvpPress={() => toggleRsvp.mutate(item.id)}
          />
        )}
      />

      <Pressable
        style={styles.fab}
        onPress={() =>
          router.push({
            pathname: '/(parent)/create-post',
            params: {
              returnTo: 'community-feed',
              ...(activeFilter !== 'All posts' ? { filter: activeFilter } : {}),
            },
          } as never)
        }
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>

      <BottomNav activeTab="community" />
    </View>
  );
}
