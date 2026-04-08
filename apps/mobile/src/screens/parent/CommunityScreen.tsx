import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomNav from '@mobile/components/BottomNav';

// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.
const IMG_AVATAR_SARAH = 'https://www.figma.com/api/mcp/asset/b7f91406-93dc-4d30-860a-dc6e88a9fc5a';
const IMG_AVATAR_ELENA = 'https://www.figma.com/api/mcp/asset/6ba72ba9-1c3f-4232-a5a2-33333bc60cbc';
const IMG_AVATAR_DAVID = 'https://www.figma.com/api/mcp/asset/d79b72d7-50fc-40da-9658-91cf8aa579f8';
const IMG_POST_ROOM = 'https://www.figma.com/api/mcp/asset/e5e2492a-ec18-4a84-b3ca-85fde8330bf9';
const IMG_USER_PROFILE = 'https://www.figma.com/api/mcp/asset/17cd0eca-d5d2-4d82-8b50-1e3a50ebc144';

// ASSUMPTION: Post data will come from GET /community/posts?feed=for-you.
// Using hardcoded mock data until the backend service is ready.

type Tab = 'For You' | 'Local Groups';

const TAGS = {
  post1: ['#SleepTraining', '#Motherhood'],
  post2: ['#NannyReview', '#LocalGroups'],
  post3: ['#Preschool', '#Education'],
} as const;

export default function CommunityScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('For You');

  return (
    <View style={styles.container}>
      {/* Scrollable content — padded top for header */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section: Trending Discussions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending Discussions</Text>
          <Pressable>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>

        {/* Featured Post */}
        <View style={styles.card}>
          <View style={styles.postAuthorRow}>
            <View style={styles.avatarContainer}>
              <Image source={{ uri: IMG_AVATAR_SARAH }} style={styles.avatar} />
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>Sarah Jenkins</Text>
              <Text style={styles.authorTime}>2 hours ago</Text>
            </View>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </View>

          <Text style={styles.postBody}>
            {`Does anyone have recommendations for gentle sleep training methods? My 8-month-old has hit a major regression and we're looking for a sanctuary of rest again! 😴`}
          </Text>

          <View style={styles.tagsRow}>
            {TAGS.post1.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          <View style={styles.actionsRow}>
            <Pressable style={styles.actionItem}>
              <Ionicons name="heart-outline" size={17} color="#747871" />
              <Text style={styles.actionCount}>24</Text>
            </Pressable>
            <Pressable style={styles.actionItem}>
              <Ionicons name="chatbubble-outline" size={17} color="#747871" />
              <Text style={styles.actionCount}>12</Text>
            </Pressable>
            <View style={styles.actionSpacer} />
            <Pressable>
              <Ionicons name="bookmark-outline" size={17} color="#747871" />
            </Pressable>
          </View>
        </View>

        {/* Feed Items */}
        <View style={styles.feedSection}>
          {/* Feed Item 2 */}
          <View style={styles.card}>
            <View style={styles.postAuthorRow}>
              <View style={styles.avatarContainer}>
                <Image source={{ uri: IMG_AVATAR_ELENA }} style={styles.avatar} />
              </View>
              <View style={styles.authorInfo}>
                <Text style={styles.authorName}>Elena Rodriguez</Text>
                <Text style={styles.authorTime}>4 hours ago</Text>
              </View>
            </View>

            <Text style={styles.postBody}>
              {`Just had a wonderful session with Nanny Claire from the platform. The "Curated Sanctuary" feeling is real—my house is calm and the kids are so happy! Highly recommend for weekend help.`}
            </Text>

            <View style={styles.postImageContainer}>
              <Image source={{ uri: IMG_POST_ROOM }} style={styles.postImage} resizeMode="cover" />
            </View>

            <View style={styles.tagsRow}>
              {TAGS.post2.map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>

            <View style={styles.actionsRow}>
              <Pressable style={styles.actionItem}>
                <Ionicons name="heart-outline" size={17} color="#747871" />
                <Text style={styles.actionCount}>56</Text>
              </Pressable>
              <Pressable style={styles.actionItem}>
                <Ionicons name="chatbubble-outline" size={17} color="#747871" />
                <Text style={styles.actionCount}>8</Text>
              </Pressable>
            </View>
          </View>

          {/* Feed Item 3 */}
          <View style={styles.card}>
            <View style={styles.postAuthorRow}>
              <View style={styles.avatarContainer}>
                <Image source={{ uri: IMG_AVATAR_DAVID }} style={styles.avatar} />
              </View>
              <View style={styles.authorInfo}>
                <Text style={styles.authorName}>David Chen</Text>
                <Text style={styles.authorTime}>Yesterday</Text>
              </View>
            </View>

            <Text style={styles.postBody}>
              {`Quick question for the local moms: which preschool in the West End has the best sensory-focused program? Looking for our 3-year-old.`}
            </Text>

            <View style={styles.tagsRow}>
              {TAGS.post3.map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>

            <View style={styles.actionsRow}>
              <Pressable style={styles.actionItem}>
                <Ionicons name="heart-outline" size={17} color="#747871" />
                <Text style={styles.actionCount}>12</Text>
              </Pressable>
              <Pressable style={styles.actionItem}>
                <Ionicons name="chatbubble-outline" size={17} color="#747871" />
                <Text style={styles.actionCount}>31</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Header — overlays scroll content */}
      <View style={styles.header} pointerEvents="box-none">
        <SafeAreaView>
          <View style={styles.headerInner}>
            <Pressable>
              <Ionicons name="menu-outline" size={22} color="#97a591" />
            </Pressable>
            <Text style={styles.headerTitle}>Community</Text>
            <View style={styles.headerAvatarBorder}>
              <Image source={{ uri: IMG_USER_PROFILE }} style={styles.headerAvatar} />
            </View>
          </View>

          <View style={styles.tabBar}>
            <Pressable
              style={styles.tabItem}
              onPress={() => setActiveTab('For You')}
            >
              <Text style={[styles.tabText, activeTab === 'For You' && styles.tabTextActive]}>
                For You
              </Text>
              {activeTab === 'For You' && <View style={styles.tabIndicator} />}
            </Pressable>
            <Pressable
              style={styles.tabItem}
              onPress={() => setActiveTab('Local Groups')}
            >
              <Text style={[styles.tabText, activeTab === 'Local Groups' && styles.tabTextActive]}>
                Local Groups
              </Text>
              {activeTab === 'Local Groups' && <View style={styles.tabIndicator} />}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>

      {/* FAB */}
      <Pressable style={styles.fab}>
        <Ionicons name="add" size={24} color="#fff" />
      </Pressable>

      <BottomNav activeTab="community" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 144,
    paddingBottom: 96,
    paddingHorizontal: 24,
    gap: 24,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(227, 213, 202, 0.92)',
    zIndex: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    letterSpacing: -0.45,
    color: '#97a591',
  },
  headerAvatarBorder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(151, 165, 145, 0.2)',
    overflow: 'hidden',
    padding: 2,
  },
  headerAvatar: {
    flex: 1,
    borderRadius: 14,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 32,
  },
  tabItem: {
    paddingBottom: 8,
    position: 'relative',
    alignItems: 'center',
  },
  tabText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#7a7a7a',
  },
  tabTextActive: {
    fontFamily: 'Manrope_700Bold',
    color: '#97a591',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 9999,
    backgroundColor: '#e3d5ca',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 24,
    letterSpacing: -0.6,
    color: '#1b1c1b',
  },
  seeAll: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#556251',
  },

  // Cards
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    gap: 12,
  },
  feedSection: {
    gap: 24,
  },

  // Author row
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#ebddd2',
  },
  avatar: {
    width: 40,
    height: 40,
  },
  authorInfo: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#1b1c1b',
    lineHeight: 18,
  },
  authorTime: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#747871',
    lineHeight: 18,
  },
  proBadge: {
    backgroundColor: '#c4a882',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  proBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Post content
  postBody: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#444842',
    lineHeight: 26,
  },
  postImageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: 165,
  },

  // Tags
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#e3d5ca',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tagText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#7a7a7a',
    lineHeight: 18,
  },

  // Actions
  divider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(240, 237, 235, 0.5)',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingTop: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#747871',
    lineHeight: 19.5,
  },
  actionSpacer: {
    flex: 1,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#556251',
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
