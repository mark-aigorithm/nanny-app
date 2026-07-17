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
import NotificationBellButton from '@mobile/components/NotificationBellButton';
import PostCard from '@mobile/components/community/PostCard';
import { SearchBar } from '@mobile/components/ui';
import {
  useCommunityPosts,
  useToggleEventRsvp,
  useTogglePostLike,
} from '@mobile/hooks/useCommunity';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { filterPillToType, filterPostsBySearch } from '@mobile/lib/communityUtils';
import type { CommunityFilterPill } from '@mobile/types';
import { colors } from '@mobile/theme';
import { styles } from './styles/community-feed-screen.styles';

const FILTER_PILLS: CommunityFilterPill[] = ['All posts', 'Q&A', 'Marketplace', 'Events'];

export default function CommunityFeedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const initialFilter = (params.filter as CommunityFilterPill) ?? 'All posts';
  const [activeFilter, setActiveFilter] = useState<CommunityFilterPill>(initialFilter);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
  const visiblePosts = useMemo(
    () => filterPostsBySearch(posts, searchQuery),
    [posts, searchQuery],
  );

  const closeSearch = () => {
    setIsSearchActive(false);
    setSearchQuery('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {isSearchActive ? (
          <View style={styles.searchRow}>
            <SearchBar
              style={styles.searchBar}
              size="compact"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search posts, authors, tags..."
              showClearButton
              onClear={() => setSearchQuery('')}
              autoFocus
            />
            <Pressable onPress={closeSearch} hitSlop={8} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Community</Text>
            <View style={styles.headerRight}>
              <View style={styles.onlinePill}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Live feed</Text>
              </View>
              <Pressable
                style={styles.headerIcon}
                onPress={() => setIsSearchActive(true)}
                accessibilityLabel="Search community posts"
                accessibilityRole="button"
              >
                <Ionicons name="search" size={20} color={colors.textDark} />
              </Pressable>
              <NotificationBellButton
                iconSize={20}
                iconColor={colors.textDark}
                style={styles.headerIcon}
              />
            </View>
          </View>
        )}

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
        data={visiblePosts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.scrollContent,
          (isLoading || visiblePosts.length === 0) && styles.scrollContentEmpty,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
            <Text style={styles.filterPillTextInactive}>
              {searchQuery.trim()
                ? 'No posts match your search.'
                : 'No posts in this category yet.'}
            </Text>
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

      <Pressable
        style={styles.fab}
        onPress={gate(
          () =>
            router.push({
              pathname: '/(parent)/create-post',
              params: {
                returnTo: 'community-feed',
                ...(activeFilter !== 'All posts' ? { filter: activeFilter } : {}),
              },
            } as never),
          'Create your free account to post in the community.',
        )}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>

      <BottomNav activeTab="community" />
    </View>
  );
}
