import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomNav from '@mobile/components/BottomNav';
import { colors } from '@mobile/theme';
import type { PostTag, Post, AdvicePost, MarketplacePost, EventPost } from '@mobile/types';
import { MOCK_POSTS } from '@mobile/mocks';
import { styles } from './styles/community-feed-screen.styles';

// ─── Screen-specific filter config ───────────────────────────────────────────

type FilterPill = 'All posts' | 'Q&A' | 'Marketplace' | 'Events';

const FILTER_PILLS: FilterPill[] = ['All posts', 'Q&A', 'Marketplace', 'Events'];

// ─── Tag style config ─────────────────────────────────────────────────────────

const TAG_STYLES: Record<PostTag, { bg: string; text: string }> = {
  'General advice': { bg: colors.taupe, text: colors.primary },
  Marketplace: { bg: colors.tintYellow, text: colors.goldWarm },
  Event: { bg: colors.successLight, text: colors.successDark },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommunityFeedScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterPill>('All posts');

  const renderAdvicePost = (post: AdvicePost) => (
    <View key={post.id} style={styles.card}>
      {renderAuthorRow(post)}
      <Text style={styles.postBody} numberOfLines={2}>
        {post.body}
      </Text>
      <Pressable>
        <Text style={styles.readMore}>Read more</Text>
      </Pressable>
      {renderActionBar(post)}
    </View>
  );

  const renderMarketplacePost = (post: MarketplacePost) => (
    <View key={post.id} style={styles.card}>
      {renderAuthorRow(post)}
      <View style={styles.marketplaceImageContainer}>
        <Image
          source={{ uri: post.image }}
          style={styles.marketplaceImage}
          resizeMode="cover"
        />
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>{post.price}</Text>
        </View>
      </View>
      <Text style={styles.marketplaceTitle}>{post.title}</Text>
      {renderActionBar(post)}
    </View>
  );

  const renderEventPost = (post: EventPost) => (
    <View key={post.id} style={[styles.card, styles.eventCard]}>
      {renderAuthorRow(post)}
      <Text style={styles.eventTitle}>{post.title}</Text>
      <View style={styles.eventDetailRow}>
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        <Text style={styles.eventDetailText}>{post.date}</Text>
      </View>
      <View style={styles.eventDetailRow}>
        <Ionicons name="location-outline" size={16} color={colors.textMuted} />
        <Text style={styles.eventDetailText}>{post.location}</Text>
      </View>
      <View style={styles.attendeesRow}>
        <View style={styles.stackedAvatars}>
          {post.attendeeAvatars.map((uri, index) => (
            <Image
              key={index}
              source={{ uri }}
              style={[
                styles.attendeeAvatar,
                { marginLeft: index === 0 ? 0 : -12 },
              ]}
            />
          ))}
        </View>
        <Text style={styles.attendeeCount}>+{post.attendeeCount} going</Text>
      </View>
      <Pressable style={styles.rsvpButton}>
        <Text style={styles.rsvpButtonText}>RSVP</Text>
      </Pressable>
    </View>
  );

  const renderAuthorRow = (post: Post) => (
    <View style={styles.authorRow}>
      <Image source={{ uri: post.author.avatar }} style={styles.avatar} />
      <View style={styles.authorInfo}>
        <Text style={styles.authorName}>{post.author.name}</Text>
        <Text style={styles.authorTime}>{post.author.timeAgo}</Text>
      </View>
      <View
        style={[
          styles.tagPill,
          { backgroundColor: TAG_STYLES[post.tag].bg },
        ]}
      >
        <Text
          style={[
            styles.tagPillText,
            { color: TAG_STYLES[post.tag].text },
          ]}
        >
          {post.tag}
        </Text>
      </View>
    </View>
  );

  const renderActionBar = (post: Post) => (
    <View style={styles.actionBar}>
      <Pressable style={styles.actionItem}>
        <Ionicons name="heart-outline" size={17} color={colors.textMuted} />
        <Text style={styles.actionCount}>{post.likes}</Text>
      </Pressable>
      <Pressable style={styles.actionItem}>
        <Ionicons name="chatbubble-outline" size={17} color={colors.textMuted} />
        <Text style={styles.actionCount}>{post.comments}</Text>
      </Pressable>
      {post.type === 'advice' && (
        <Pressable style={styles.actionItem}>
          <Ionicons name="share-social-outline" size={17} color={colors.textMuted} />
          <Text style={styles.actionCount}>Share</Text>
        </Pressable>
      )}
    </View>
  );

  const renderPost = (post: Post) => {
    switch (post.type) {
      case 'advice':
        return renderAdvicePost(post);
      case 'marketplace':
        return renderMarketplacePost(post);
      case 'event':
        return renderEventPost(post);
    }
  };

  return (
    <View style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Community</Text>
          <View style={styles.headerRight}>
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>42 moms online</Text>
            </View>
            <Pressable style={styles.headerIcon}>
              <Ionicons name="search" size={20} color={colors.textDark} />
            </Pressable>
            <Pressable style={styles.headerIcon}>
              <Ionicons name="notifications-outline" size={20} color={colors.textDark} />
            </Pressable>
          </View>
        </View>

        {/* Filter Pills */}
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
                    isActive
                      ? styles.filterPillTextActive
                      : styles.filterPillTextInactive,
                  ]}
                >
                  {pill}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {MOCK_POSTS.map(renderPost)}
      </ScrollView>

      {/* FAB */}
      <Pressable style={styles.fab}>
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>

      <BottomNav activeTab="community" />
    </View>
  );
}

