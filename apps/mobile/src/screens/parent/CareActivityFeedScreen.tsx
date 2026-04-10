import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import BottomNav from '@mobile/components/BottomNav';
import type { ActivityItem } from '@mobile/types';
import { TODAY_ACTIVITIES, YESTERDAY_ACTIVITIES } from '@mobile/mocks';
import { styles } from './styles/care-activity-feed-screen.styles';

// ASSUMPTION: Filter categories will come from GET /care-activities/categories.
// Using hardcoded mock data until the backend service is ready.
const FILTER_PILLS = ['All', 'Health', 'Play', 'Meals', 'Sleep'] as const;
type FilterPill = (typeof FILTER_PILLS)[number];

export default function CareActivityFeedScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterPill>('All');

  return (
    <View style={styles.container}>
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
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Liam's care feed</Text>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/* ── Fixed: FAB ── */}
      <Pressable style={styles.fab}>
        <Ionicons name="add" size={24} color={colors.white} />
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
        <Ionicons name={activity.icon} size={22} color={colors.textSecondary} />
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

