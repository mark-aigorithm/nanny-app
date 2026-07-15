import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import BottomNav from '@mobile/components/BottomNav';
import ParentTabHeader from '@mobile/components/ParentTabHeader';
import ParentTabFab from '@mobile/components/ParentTabFab';
import PostCard from '@mobile/components/community/PostCard';
import {
  useCommunityPosts,
  useToggleEventRsvp,
  useTogglePostLike,
} from '@mobile/hooks/useCommunity';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { filterPillToType } from '@mobile/lib/communityUtils';
import type { CommunityFilterPill } from '@mobile/types';
import { colors } from '@mobile/theme';
import { styles } from './styles/community-screen.styles';

const FILTER_PILLS: CommunityFilterPill[] = ['Q&A', 'Marketplace', 'Events'];

export default function CommunityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [activeFilter, setActiveFilter] = useState<CommunityFilterPill>('Q&A');

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
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCommunityPosts(typeFilter);
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);
  const { gate } = useGuestGate();
  const toggleLike = useTogglePostLike();
  const toggleRsvp = useToggleEventRsvp();

  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  const openPostDetail = (postId: string) => {
    router.push({
      pathname: '/(parent)/post-detail',
      params: { postId, returnTo: 'community', filter: activeFilter },
    });
  };

  const openCreatePost = gate(() => {
    router.push({
      pathname: '/(parent)/create-post',
      params: { returnTo: 'community', filter: activeFilter },
    } as never);
  }, 'Create your free account to post in the community.');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <View style={styles.filterBar}>
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
        style={styles.list}
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          (isLoading || posts.length === 0) && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loadingIndicator} />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.taupe} />
              <Text style={styles.emptyText}>No {activeFilter} posts yet.</Text>
              <Pressable style={styles.emptyCta} onPress={openCreatePost}>
                <Text style={styles.emptyCtaText}>Create the first post</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
          ) : null
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            compact
            onPress={() => openPostDetail(item.id)}
            onLikePress={gate(
              () => toggleLike.mutate(item.id),
              'Create your free account to like posts.',
            )}
            onRsvpPress={gate(
              () => toggleRsvp.mutate(item.id),
              'Create your free account to RSVP to events.',
            )}
          />
        )}
      />

      <ParentTabHeader />

      <ParentTabFab onPress={openCreatePost} />

      <BottomNav activeTab="community" />
    </View>
  );
}
