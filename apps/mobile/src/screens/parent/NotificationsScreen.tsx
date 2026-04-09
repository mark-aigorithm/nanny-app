import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

// ASSUMPTION: Notification data will come from GET /notifications.
// TODO: Replace with useNotifications() React Query hook
// Using hardcoded mock data until the backend service is ready.

type NotificationType = 'booking' | 'activity' | 'social' | 'promo' | 'review';

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  time: string;
  read: boolean;
};

// ASSUMPTION: Notification list will be paginated via cursor-based pagination from the API.
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'booking',
    title: 'Booking confirmed',
    subtitle: 'Elena Martinez \u00b7 Sat Apr 12 \u00b7 9AM\u20135PM',
    time: '2m ago',
    read: false,
  },
  {
    id: '2',
    type: 'activity',
    title: 'Liam had lunch',
    subtitle: 'Sarah gave Liam a bottle at 12:30 PM',
    time: '15m ago',
    read: false,
  },
  {
    id: '3',
    type: 'social',
    title: 'Jessica replied to your post',
    subtitle: '"That\u2019s a great tip! We do the same with our nanny..."',
    time: '1h ago',
    read: true,
  },
  {
    id: '4',
    type: 'promo',
    title: 'Weekend Special',
    subtitle: 'Get 15% off your next weekend booking. Limited time offer!',
    time: '3h ago',
    read: true,
  },
  {
    id: '5',
    type: 'review',
    title: 'Share your feedback',
    subtitle: 'How was your experience with Elena? Leave a review.',
    time: '5h ago',
    read: true,
  },
];

const FILTER_PILLS = ['All', 'Updates', 'Activity', 'Messages'] as const;
type FilterPill = (typeof FILTER_PILLS)[number];

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.

// ASSUMPTION: "Mark all read" will call PATCH /notifications/mark-all-read once backend is ready.

function getIconForType(type: NotificationType): { name: string; bgColor: string } {
  switch (type) {
    case 'booking':
      return { name: 'calendar', bgColor: '#97a591' };
    case 'activity':
      return { name: 'nutrition', bgColor: '#f5dec8' };
    case 'social':
      return { name: 'chatbubble', bgColor: '#e3d5ca' };
    case 'promo':
      return { name: 'pricetag', bgColor: '#f0edeb' };
    case 'review':
      return { name: 'star', bgColor: '#f0edeb' };
  }
}

function getIconColor(type: NotificationType): string {
  switch (type) {
    case 'booking':
      return '#ffffff';
    case 'activity':
      return '#8b6914';
    case 'social':
      return '#675d54';
    case 'promo':
      return '#675d54';
    case 'review':
      return '#675d54';
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterPill>('All');

  // ASSUMPTION: Notifications will be grouped by date from the API response.
  const todayNotifications = MOCK_NOTIFICATIONS.filter((_, i) => i < 3);
  const yesterdayNotifications = MOCK_NOTIFICATIONS.filter((_, i) => i >= 3);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={16} color="#2e2e2e" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity activeOpacity={0.7}>
          <Text style={styles.markAllRead}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pillsContent}
        >
          {FILTER_PILLS.map((pill) => (
            <TouchableOpacity
              key={pill}
              style={[
                styles.pill,
                activeFilter === pill ? styles.pillActive : styles.pillInactive,
              ]}
              onPress={() => setActiveFilter(pill)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.pillText,
                  activeFilter === pill ? styles.pillTextActive : styles.pillTextInactive,
                ]}
              >
                {pill}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Today section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Today</Text>
          <View style={styles.cardGroup}>
            {todayNotifications.map((notification) => (
              <NotificationCard key={notification.id} notification={notification} />
            ))}
          </View>
        </View>

        {/* Yesterday section */}
        <View style={[styles.section, styles.yesterdaySection]}>
          <Text style={styles.sectionHeading}>Yesterday</Text>
          <View style={styles.cardGroup}>
            {yesterdayNotifications.map((notification) => (
              <NotificationCard key={notification.id} notification={notification} />
            ))}
          </View>
        </View>
      </ScrollView>

      <BottomNav activeTab="home" />
    </View>
  );
}

// ─── NotificationCard ────────────────────────────────────────────────────────

function NotificationCard({ notification }: { notification: Notification }) {
  const icon = getIconForType(notification.type);
  const iconColor = getIconColor(notification.type);
  const isUnread = !notification.read;

  return (
    <View
      style={[
        styles.card,
        isUnread ? styles.cardUnread : styles.cardRead,
      ]}
    >
      {/* Icon circle */}
      <View style={[styles.iconCircle, { backgroundColor: icon.bgColor }]}>
        <Ionicons name={icon.name as any} size={18} color={iconColor} />
      </View>

      {/* Text content */}
      <View style={styles.cardTextWrap}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.cardTime}>{notification.time}</Text>
        </View>
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {notification.subtitle}
        </Text>
      </View>
    </View>
  );
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = 64;
const BOTTOM_NAV_HEIGHT = 80;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: HEADER_HEIGHT,
    paddingHorizontal: 24,
    paddingTop: STATUS_BAR_HEIGHT,
    backgroundColor: '#fdfaf8',
    zIndex: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    color: '#2e2e2e',
    letterSpacing: -0.5,
  },
  markAllRead: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#97a591',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: BOTTOM_NAV_HEIGHT + 24,
    gap: 24,
  },

  // Filter pills
  pillsScroll: {
    paddingTop: 16,
  },
  pillsContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  pill: {
    height: 36,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: '#97a591',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pillInactive: {
    backgroundColor: '#e3d5ca',
  },
  pillText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
  },
  pillTextActive: {
    color: '#ffffff',
  },
  pillTextInactive: {
    color: '#675d54',
  },

  // Section
  section: {
    paddingHorizontal: 24,
    gap: 12,
  },
  yesterdaySection: {
    opacity: 0.7,
  },
  sectionHeading: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    color: '#2e2e2e',
  },
  cardGroup: {
    gap: 12,
  },

  // Notification card
  card: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    alignItems: 'flex-start',
    gap: 12,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#97a591',
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 16,
  },
  cardRead: {
    padding: 16,
  },

  // Icon circle
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  // Card text
  cardTextWrap: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    color: '#2e2e2e',
    flex: 1,
  },
  cardTime: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 12,
    color: '#7a7a7a',
  },
  cardSubtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
    color: '#7a7a7a',
  },
});
