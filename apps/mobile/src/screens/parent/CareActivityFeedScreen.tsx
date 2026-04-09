import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

// ASSUMPTION: Thumbnail sourced from Figma CDN — expires in 7 days.
// Replace with S3/CDN URL or bundled asset before production.
const IMG_MILK_BOTTLE =
  'https://www.figma.com/api/mcp/asset/4aa21093-e5c2-4482-a69d-b0c8f3ead002';

// ASSUMPTION: Filter categories will come from GET /care-activities/categories.
// Using hardcoded mock data until the backend service is ready.
const FILTER_PILLS = ['All', 'Health', 'Play', 'Meals', 'Sleep'] as const;
type FilterPill = (typeof FILTER_PILLS)[number];

// ASSUMPTION: Activity data will come from GET /children/:childId/activities.
// Using hardcoded mock data until the backend service is ready.
type ActivityItem = {
  id: string;
  type: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  time: string;
  description: string;
  thumbnail?: string;
  unread?: boolean;
};

const TODAY_ACTIVITIES: ActivityItem[] = [
  {
    id: '1',
    type: 'Feeding',
    icon: 'restaurant-outline',
    iconBg: '#f5dec8',
    time: '1:30 PM',
    description: 'Elena fed Liam 6oz. He finished the whole bottle.',
    thumbnail: IMG_MILK_BOTTLE,
    unread: true,
  },
  {
    id: '2',
    type: 'Nap',
    icon: 'moon-outline',
    iconBg: '#ddd6ec',
    time: '12:15 PM',
    description: 'Liam fell asleep in his crib. He was very calm today.',
  },
  {
    id: '3',
    type: 'Diaper change',
    icon: 'leaf-outline',
    iconBg: '#d4e8d4',
    time: '11:45 AM',
    description: 'Wet diaper changed. No redness observed.',
  },
];

const YESTERDAY_ACTIVITIES: ActivityItem[] = [
  {
    id: '4',
    type: 'Play time',
    icon: 'game-controller-outline',
    iconBg: '#f0edeb',
    time: '3:00 PM',
    description: 'Liam enjoyed building blocks and stacking cups for 30 minutes.',
  },
];

export default function CareActivityFeedScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterPill>('All');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Scrollable main content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}
        >
          {FILTER_PILLS.map((pill) => (
            <Pressable
              key={pill}
              style={[
                styles.pill,
                activeFilter === pill ? styles.pillActive : styles.pillInactive,
              ]}
              onPress={() => setActiveFilter(pill)}
            >
              <Text
                style={[
                  styles.pillText,
                  activeFilter === pill ? styles.pillTextActive : styles.pillTextInactive,
                ]}
              >
                {pill}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Today section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionDate}>TODAY, APR 12</Text>
            <Pressable>
              <Text style={styles.markAllRead}>Mark all as read</Text>
            </Pressable>
          </View>
          <View style={styles.activityList}>
            {TODAY_ACTIVITIES.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </View>
        </View>

        {/* Yesterday section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionDate, styles.sectionDateFaded]}>
              YESTERDAY APR 11
            </Text>
          </View>
          <View style={styles.activityList}>
            {YESTERDAY_ACTIVITIES.map((activity) => (
              <View key={activity.id} style={styles.yesterdayCardWrap}>
                <ActivityCard activity={activity} />
                <View style={styles.yesterdayOverlay} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Fixed: Header ── */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1b1c1b" />
          </Pressable>
          <Text style={styles.headerTitle}>Liam's care feed</Text>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color="#1b1c1b" />
          </Pressable>
        </View>
      </View>

      {/* ── Fixed: FAB ── */}
      <Pressable style={styles.fab}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </Pressable>

      <BottomNav activeTab="home" />
    </View>
  );
}

// ─── ActivityCard ────────────────────────────────────────────────────────────

function ActivityCard({ activity }: { activity: ActivityItem }) {
  return (
    <View style={styles.card}>
      {activity.unread && <View style={styles.unreadDot} />}
      <View style={[styles.iconCircle, { backgroundColor: activity.iconBg }]}>
        <Ionicons name={activity.icon} size={22} color="#444842" />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardType}>{activity.type}</Text>
        <Text style={styles.cardTime}>{activity.time}</Text>
        <Text style={styles.cardDescription}>{activity.description}</Text>
      </View>
      {activity.thumbnail && (
        <Image
          source={{ uri: activity.thumbnail }}
          style={styles.cardThumbnail}
          resizeMode="cover"
        />
      )}
    </View>
  );
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 64;
const BOTTOM_NAV_HEIGHT = 80;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 16,
    paddingBottom: BOTTOM_NAV_HEIGHT + 40,
    paddingHorizontal: 24,
    gap: 32,
  },

  // Filter pills
  filtersScroll: {
    marginHorizontal: -24,
  },
  filtersContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
  },
  pillActive: {
    backgroundColor: '#97a591',
  },
  pillInactive: {
    backgroundColor: '#e3d5ca',
  },
  pillText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
  pillTextActive: {
    color: '#ffffff',
  },
  pillTextInactive: {
    color: '#6b6158',
  },

  // Section
  section: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionDate: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.65,
    color: '#7a7a7a',
    textTransform: 'uppercase',
  },
  sectionDateFaded: {
    opacity: 0.6,
  },
  markAllRead: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 13,
    color: '#97a591',
  },

  // Activity list
  activityList: {
    gap: 24,
  },

  // Activity card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  unreadDot: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#97a591',
    zIndex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  cardType: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 22,
    color: '#1b1c1b',
  },
  cardTime: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
    color: '#747871',
  },
  cardDescription: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: '#444842',
    marginTop: 4,
  },
  cardThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#f0edeb',
  },

  // Yesterday overlay
  yesterdayCardWrap: {
    position: 'relative',
  },
  yesterdayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 16,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253, 250, 248, 0.92)',
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: STATUS_BAR_HEIGHT + 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    color: '#1b1c1b',
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 96,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#97a591',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
});
