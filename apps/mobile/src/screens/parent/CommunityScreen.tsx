import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import BottomNav from '@mobile/components/BottomNav';
import PostCard from '@mobile/components/community/PostCard';
import {
  useCommunityPostsByType,
  useTrendingPosts,
  useToggleEventRsvp,
  useTogglePostLike,
} from '@mobile/hooks/useCommunity';
import { IMG_USER_PROFILE_COMMUNITY } from '@mobile/mocks/images';
import type { CommunityTab } from '@mobile/types';
import { colors } from '@mobile/theme';
import { styles } from './styles/community-screen.styles';

export default function CommunityScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CommunityTab>('For You');
  const { data: posts = [], isLoading, refetch, isRefetching } = useTrendingPosts(3);
  const {
    data: events = [],
    isLoading: eventsLoading,
    refetch: refetchEvents,
  } = useCommunityPostsByType('event', 3);
  const toggleLike = useTogglePostLike();
  const toggleRsvp = useToggleEventRsvp();

  const openPostDetail = (postId: string) => {
    router.push({
      pathname: '/(parent)/post-detail',
      params: { postId, returnTo: 'community' },
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
              refetchEvents();
            }}
          />
        }
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending Discussions</Text>
          <Pressable onPress={() => router.push('/(parent)/community-feed')}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : posts.length === 0 ? (
          <Text style={styles.postBody}>No posts yet. Be the first to share!</Text>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              compact
              onPress={() => openPostDetail(post.id)}
              onLikePress={() => toggleLike.mutate(post.id)}
            />
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Events & Meetups</Text>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(parent)/community-feed',
                params: { filter: 'Events' },
              } as never)
            }
          >
            <Text style={styles.seeAll}>Browse events</Text>
          </Pressable>
        </View>

        {eventsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : events.length === 0 ? (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/(parent)/community-feed',
                params: { filter: 'Events' },
              } as never)
            }
          >
            <Text style={styles.postBody}>
              No upcoming events yet. Browse the feed or create one!
            </Text>
          </Pressable>
        ) : (
          events.map((event) => (
            <PostCard
              key={event.id}
              post={event}
              compact
              onPress={() => openPostDetail(event.id)}
              onLikePress={() => toggleLike.mutate(event.id)}
              onRsvpPress={() => toggleRsvp.mutate(event.id)}
            />
          ))
        )}
      </ScrollView>

      <View style={styles.header} pointerEvents="box-none">
        <SafeAreaView>
          <View style={styles.headerInner}>
            <Pressable onPress={() => router.push('/(parent)/mother-profile' as never)}>
              <Ionicons name="menu-outline" size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>Community</Text>
            <Pressable onPress={() => router.push('/(parent)/mother-profile' as never)}>
              <View style={styles.headerAvatarBorder}>
                <Image source={{ uri: IMG_USER_PROFILE_COMMUNITY }} style={styles.headerAvatar} />
              </View>
            </Pressable>
          </View>

          <View style={styles.tabBar}>
            <Pressable style={styles.tabItem} onPress={() => setActiveTab('For You')}>
              <Text style={[styles.tabText, activeTab === 'For You' && styles.tabTextActive]}>
                For You
              </Text>
              {activeTab === 'For You' && <View style={styles.tabIndicator} />}
            </Pressable>
            <Pressable style={styles.tabItem} onPress={() => setActiveTab('Local Groups')}>
              <Text style={[styles.tabText, activeTab === 'Local Groups' && styles.tabTextActive]}>
                Local Groups
              </Text>
              {activeTab === 'Local Groups' && <View style={styles.tabIndicator} />}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>

      <Pressable
        style={styles.fab}
        onPress={() =>
          router.push({
            pathname: '/(parent)/create-post',
            params: { returnTo: 'community' },
          } as never)
        }
      >
        <Ionicons name="add" size={24} color={colors.white} />
      </Pressable>

      <BottomNav activeTab="community" />
    </View>
  );
}
