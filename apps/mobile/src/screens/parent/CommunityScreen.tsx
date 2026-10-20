import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, RefreshControl, FlatList } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ParentTabFab from '@mobile/components/ParentTabFab';
import PostCard from '@mobile/components/community/PostCard';
import { POST_TYPE_ICONS } from '@mobile/components/community/PostTagChip';
import {
  FadeInView,
  PressableScale,
  ScreenContainer,
  SearchBar,
  StackHeader,
} from '@mobile/components/ui';
import {
  useCommunityPosts,
  useToggleEventRsvp,
  useTogglePostLike,
} from '@mobile/hooks/useCommunity';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { useFloatingNavClearance } from '@mobile/hooks/useBottomInset';
import { filterPillToType, filterPostsBySearch } from '@mobile/lib/communityUtils';
import type { CommunityFilterPill } from '@mobile/types';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/community-screen.styles';

const FILTERS: {
  key: CommunityFilterPill;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** The extended FAB's label, and what an empty filter invites her to do. */
  createLabel: string;
  emptyTitle: string;
  emptyBody: string;
}[] = [
  {
    key: 'All posts',
    label: 'All',
    icon: 'apps-outline',
    createLabel: 'New post',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'Ask a question, sell something or host a meetup — be the first.',
  },
  {
    key: 'Q&A',
    label: 'Q&A',
    icon: POST_TYPE_ICONS.qa,
    createLabel: 'Ask',
    emptyTitle: 'No questions yet',
    emptyBody: 'Ask other parents about sleep, feeding, schools — anything.',
  },
  {
    key: 'Marketplace',
    label: 'Marketplace',
    icon: POST_TYPE_ICONS.marketplace,
    createLabel: 'Sell',
    emptyTitle: 'No listings yet',
    emptyBody: 'Outgrown a stroller or a stack of clothes? List it here.',
  },
  {
    key: 'Events',
    label: 'Events',
    icon: POST_TYPE_ICONS.event,
    createLabel: 'Host',
    emptyTitle: 'No upcoming events',
    emptyBody: 'Plan a playdate or a coffee morning and invite other parents.',
  },
];

const DEFAULT_FILTER: CommunityFilterPill = 'All posts';

function isFilter(value: string | undefined): value is CommunityFilterPill {
  return FILTERS.some((f) => f.key === value);
}

/**
 * The community: every post type in one feed, narrowed by a filter. The filter
 * lives in the route (`?filter=Events`), so a link from Services always opens
 * the filter it names — even when the screen is still mounted on another one.
 */
export default function CommunityScreen() {
  const navClearance = useFloatingNavClearance();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const activeFilter = isFilter(params.filter) ? params.filter : DEFAULT_FILTER;
  const filter = FILTERS.find((f) => f.key === activeFilter) ?? FILTERS[0]!;
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Four filters don't all fit a narrow phone, so the selected one is scrolled
  // into view — opening Events from Services must show Events lit, not offscreen.
  const filterScrollRef = useRef<ScrollView>(null);
  const [pillOffsets, setPillOffsets] = useState<Partial<Record<CommunityFilterPill, number>>>({});
  const activeOffset = pillOffsets[activeFilter];
  useEffect(() => {
    if (activeOffset === undefined) return;
    filterScrollRef.current?.scrollTo({ x: Math.max(0, activeOffset - spacing['2xl']), animated: true });
  }, [activeOffset]);

  const typeFilter = useMemo(() => filterPillToType(activeFilter), [activeFilter]);
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCommunityPosts(typeFilter);
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);
  const { gate } = useGuestGate();
  const toggleLike = useTogglePostLike();
  const toggleRsvp = useToggleEventRsvp();

  const posts = useMemo(() => data?.pages.flatMap((page) => page.posts) ?? [], [data]);
  const visiblePosts = useMemo(
    () => filterPostsBySearch(posts, searchQuery),
    [posts, searchQuery],
  );

  const selectFilter = (key: CommunityFilterPill) => router.setParams({ filter: key });

  const closeSearch = () => {
    setIsSearchActive(false);
    setSearchQuery('');
  };

  const openPostDetail = (postId: number) => {
    router.push({ pathname: '/(parent)/post-detail', params: { postId: String(postId) } });
  };

  // Opens the composer on the type she is browsing, so "Sell" starts a listing.
  const openCreatePost = gate(() => {
    router.push({
      pathname: '/(parent)/create-post',
      params: typeFilter ? { type: typeFilter } : {},
    } as never);
  }, 'Create your free account to post in the community.');

  const openMyPosts = gate(
    () => router.push('/(parent)/my-posts' as never),
    'Create your free account to post in the community.',
  );

  const searching = searchQuery.trim().length > 0;

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title="Community"
        rightElement={
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.headerButton, isSearchActive && styles.headerButtonActive]}
              onPress={() => (isSearchActive ? closeSearch() : setIsSearchActive(true))}
              accessibilityRole="button"
              accessibilityLabel={isSearchActive ? 'Close search' : 'Search community posts'}
            >
              <Ionicons
                name={isSearchActive ? 'close' : 'search'}
                size={20}
                color={colors.textPrimary}
              />
            </Pressable>
          </View>
        }
      />

      {/* In the layout, not floating over it: the feed starts below the
          filters at any text size, so nothing hides a post's first line. */}
      <View style={styles.toolbar}>
        {isSearchActive ? (
          <SearchBar
            style={styles.searchBar}
            size="compact"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search posts, people, tags"
            showClearButton
            onClear={() => setSearchQuery('')}
            autoFocus
          />
        ) : (
          <ScrollView
            ref={filterScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((f) => {
              const isActive = f.key === activeFilter;
              return (
                <PressableScale
                  key={f.key}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  haptic="select"
                  onLayout={(e) => {
                    const x = e.nativeEvent.layout.x;
                    setPillOffsets((prev) => (prev[f.key] === x ? prev : { ...prev, [f.key]: x }));
                  }}
                  onPress={() => selectFilter(f.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Ionicons
                    name={f.icon}
                    size={16}
                    color={isActive ? colors.white : colors.textTertiary}
                  />
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                    {f.label}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        )}
      </View>

      <FlatList
        style={styles.list}
        data={visiblePosts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: navClearance + spacing['4xl'] + spacing['2xl'] },
          visiblePosts.length === 0 && styles.listContentEmpty,
        ]}
        ItemSeparatorComponent={ListGap}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primaryDark}
            colors={[colors.primaryDark]}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          // Every post is reviewed before it goes live, so an author needs
          // somewhere to track hers — and to fix a rejected one.
          <PressableScale
            style={styles.myPostsRow}
            onPress={openMyPosts}
            accessibilityRole="button"
          >
            <View style={styles.myPostsIcon}>
              <Ionicons name="person-outline" size={18} color={colors.primaryDark} />
            </View>
            <View style={styles.myPostsText}>
              <Text style={styles.myPostsTitle}>My posts</Text>
              <Text style={styles.myPostsSubtitle}>Track what’s under review or live</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </PressableScale>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primaryDark} style={styles.loadingIndicator} />
          ) : isError ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.textPlaceholder} />
              <Text style={styles.emptyTitle}>Couldn’t load posts</Text>
              <Pressable style={styles.emptyCta} onPress={() => refetch()}>
                <Text style={styles.emptyCtaText}>Try again</Text>
              </Pressable>
            </View>
          ) : searching ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={40} color={colors.textPlaceholder} />
              <Text style={styles.emptyTitle}>No posts match “{searchQuery.trim()}”</Text>
              <Text style={styles.emptyBody}>Try another word, or a different filter.</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name={filter.icon} size={28} color={colors.primaryDark} />
              </View>
              <Text style={styles.emptyTitle}>{filter.emptyTitle}</Text>
              <Text style={styles.emptyBody}>{filter.emptyBody}</Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color={colors.primaryDark} style={styles.footerLoader} />
          ) : null
        }
        renderItem={({ item, index }) => (
          <FadeInView index={index}>
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
          </FadeInView>
        )}
      />

      <ParentTabFab
        onPress={openCreatePost}
        icon="add"
        label={filter.createLabel}
        accessibilityLabel="Create post"
      />
    </ScreenContainer>
  );
}

function ListGap() {
  return <View style={styles.listGap} />;
}
