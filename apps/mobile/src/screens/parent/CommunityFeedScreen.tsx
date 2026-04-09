import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56;
const BOTTOM_NAV_HEIGHT = 80;

// ─── Placeholder images ───────────────────────────────────────────────────────
// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.

const IMG_AVATAR_JESSICA = 'https://www.figma.com/api/mcp/asset/b7f91406-93dc-4d30-860a-dc6e88a9fc5a';
const IMG_AVATAR_MARIA = 'https://www.figma.com/api/mcp/asset/6ba72ba9-1c3f-4232-a5a2-33333bc60cbc';
const IMG_AVATAR_SOPHIE = 'https://www.figma.com/api/mcp/asset/d79b72d7-50fc-40da-9658-91cf8aa579f8';
const IMG_MARKETPLACE_ITEM = 'https://www.figma.com/api/mcp/asset/e5e2492a-ec18-4a84-b3ca-85fde8330bf9';

// Attendee avatars for event posts
const IMG_ATTENDEE_1 = 'https://www.figma.com/api/mcp/asset/b7f91406-93dc-4d30-860a-dc6e88a9fc5a';
const IMG_ATTENDEE_2 = 'https://www.figma.com/api/mcp/asset/6ba72ba9-1c3f-4232-a5a2-33333bc60cbc';
const IMG_ATTENDEE_3 = 'https://www.figma.com/api/mcp/asset/d79b72d7-50fc-40da-9658-91cf8aa579f8';

// ─── Mock data interfaces ─────────────────────────────────────────────────────

type FilterPill = 'All posts' | 'Q&A' | 'Marketplace' | 'Events';

type PostTag = 'General advice' | 'Marketplace' | 'Event';

interface PostAuthor {
  name: string;
  avatar: string;
  timeAgo: string;
}

interface BasePost {
  id: string;
  author: PostAuthor;
  tag: PostTag;
  likes: number;
  comments: number;
}

interface AdvicePost extends BasePost {
  type: 'advice';
  body: string;
}

interface MarketplacePost extends BasePost {
  type: 'marketplace';
  title: string;
  image: string;
  price: string;
}

interface EventPost extends BasePost {
  type: 'event';
  title: string;
  date: string;
  location: string;
  attendeeAvatars: string[];
  attendeeCount: number;
}

type Post = AdvicePost | MarketplacePost | EventPost;

// ─── Mock data ────────────────────────────────────────────────────────────────
// ASSUMPTION: Post data will come from GET /community/feed.
// Using hardcoded mock data until the backend service is ready.

const FILTER_PILLS: FilterPill[] = ['All posts', 'Q&A', 'Marketplace', 'Events'];

const POSTS: Post[] = [
  {
    id: '1',
    type: 'advice',
    author: {
      name: 'Jessica K.',
      avatar: IMG_AVATAR_JESSICA,
      timeAgo: '2h ago',
    },
    tag: 'General advice',
    body: 'Does anyone have a recommendation for a paediatric dentist in Park Slope?',
    likes: 24,
    comments: 8,
  },
  {
    id: '2',
    type: 'marketplace',
    author: {
      name: 'Maria T.',
      avatar: IMG_AVATAR_MARIA,
      timeAgo: '5h ago',
    },
    tag: 'Marketplace',
    title: 'UppaBaby Vista V2 - Gently used',
    image: IMG_MARKETPLACE_ITEM,
    price: '$320',
    likes: 6,
    comments: 3,
  },
  {
    id: '3',
    type: 'event',
    author: {
      name: 'Sophie L.',
      avatar: IMG_AVATAR_SOPHIE,
      timeAgo: 'Just now',
    },
    tag: 'Event',
    title: 'Saturday Storytime @ Prospect Park',
    date: 'Saturday, Apr 19 \u2022 10:30 AM',
    location: 'Prospect Park, Brooklyn',
    attendeeAvatars: [IMG_ATTENDEE_1, IMG_ATTENDEE_2, IMG_ATTENDEE_3],
    attendeeCount: 14,
    likes: 0,
    comments: 0,
  },
];

// ─── Tag style config ─────────────────────────────────────────────────────────

const TAG_STYLES: Record<PostTag, { bg: string; text: string }> = {
  'General advice': { bg: '#e3d5ca', text: '#97a591' },
  Marketplace: { bg: '#f5eac8', text: '#8c7230' },
  Event: { bg: '#d4e8d4', text: '#3d6b3d' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommunityFeedScreen() {
  const router = useRouter();
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
        <Ionicons name="calendar-outline" size={16} color="#747871" />
        <Text style={styles.eventDetailText}>{post.date}</Text>
      </View>
      <View style={styles.eventDetailRow}>
        <Ionicons name="location-outline" size={16} color="#747871" />
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
        <Ionicons name="heart-outline" size={17} color="#747871" />
        <Text style={styles.actionCount}>{post.likes}</Text>
      </Pressable>
      <Pressable style={styles.actionItem}>
        <Ionicons name="chatbubble-outline" size={17} color="#747871" />
        <Text style={styles.actionCount}>{post.comments}</Text>
      </Pressable>
      {post.type === 'advice' && (
        <Pressable style={styles.actionItem}>
          <Ionicons name="share-social-outline" size={17} color="#747871" />
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
              <Ionicons name="search" size={20} color="#2e2e2e" />
            </Pressable>
            <Pressable style={styles.headerIcon}>
              <Ionicons name="notifications-outline" size={20} color="#2e2e2e" />
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
        {POSTS.map(renderPost)}
      </ScrollView>

      {/* FAB */}
      <Pressable style={styles.fab}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <BottomNav activeTab="community" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },

  // Header
  header: {
    backgroundColor: '#fcf9f7',
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0edeb',
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    color: '#2e2e2e',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3d5ca',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6a9b6a',
  },
  onlineText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#675d54',
  },
  headerIcon: {
    padding: 4,
  },

  // Filter pills
  filterRow: {
    paddingHorizontal: 24,
    gap: 8,
  },
  filterPill: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterPillActive: {
    backgroundColor: '#97a591',
  },
  filterPillInactive: {
    backgroundColor: '#e3d5ca',
  },
  filterPillText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  filterPillTextInactive: {
    color: '#675d54',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: BOTTOM_NAV_HEIGHT + 24,
    gap: 16,
  },

  // Card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 12,
  },
  eventCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#d4e8d4',
  },

  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ebddd2',
  },
  authorInfo: {
    flex: 1,
    gap: 1,
  },
  authorName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#2e2e2e',
    lineHeight: 18,
  },
  authorTime: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#747871',
    lineHeight: 16,
  },
  tagPill: {
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagPillText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },

  // Post body (advice)
  postBody: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#2e2e2e',
    lineHeight: 22,
  },
  readMore: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#97a591',
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0edeb',
    paddingTop: 12,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCount: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#747871',
  },

  // Marketplace post
  marketplaceImageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  marketplaceImage: {
    width: '100%',
    height: 161,
  },
  priceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#c4a882',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  priceBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#ffffff',
  },
  marketplaceTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
    color: '#2e2e2e',
    lineHeight: 20,
  },

  // Event post
  eventTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    color: '#2e2e2e',
    lineHeight: 24,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventDetailText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#747871',
    lineHeight: 18,
  },
  attendeesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  stackedAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#ebddd2',
  },
  attendeeCount: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#747871',
  },
  rsvpButton: {
    backgroundColor: '#97a591',
    borderRadius: 9999,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  rsvpButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#ffffff',
    letterSpacing: 0.5,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 24,
    bottom: BOTTOM_NAV_HEIGHT + 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#97a591',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 5,
  },
});
