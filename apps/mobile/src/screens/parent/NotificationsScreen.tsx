import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { IconCircle } from '@mobile/components/ui';
import type { NotificationType, AppNotification } from '@mobile/types';
import { MOCK_NOTIFICATIONS } from '@mobile/mocks';
import { colors } from '@mobile/theme';
import { styles } from './styles/notifications-screen.styles';

const FILTER_PILLS = ['All', 'Updates', 'Activity', 'Messages'] as const;
type FilterPill = (typeof FILTER_PILLS)[number];

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.

// ASSUMPTION: "Mark all read" will call PATCH /notifications/mark-all-read once backend is ready.

function getIconForType(type: NotificationType): { name: keyof typeof Ionicons.glyphMap; bgColor: string } {
  switch (type) {
    case 'booking':
      return { name: 'calendar', bgColor: colors.primary };
    case 'activity':
      return { name: 'nutrition', bgColor: colors.warmLight };
    case 'social':
      return { name: 'chatbubble', bgColor: colors.taupe };
    case 'promo':
      return { name: 'pricetag', bgColor: colors.surfaceMuted };
    case 'review':
      return { name: 'star', bgColor: colors.surfaceMuted };
  }
}

function getIconColor(type: NotificationType): string {
  switch (type) {
    case 'booking':
      return colors.white;
    case 'activity':
      return colors.tintAmber;
    case 'social':
      return colors.textTertiary;
    case 'promo':
      return colors.textTertiary;
    case 'review':
      return colors.textTertiary;
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={16} color={colors.textDark} />
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

function NotificationCard({ notification }: { notification: AppNotification }) {
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
      <IconCircle
        icon={icon.name}
        size="md"
        backgroundColor={icon.bgColor}
        iconColor={iconColor}
        iconSize={18}
        style={styles.iconCircle}
      />

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

