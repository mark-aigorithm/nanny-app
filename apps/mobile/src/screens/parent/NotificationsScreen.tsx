import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import type { NotificationResponse } from '@nanny-app/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import BottomNav from '@mobile/components/BottomNav';
import { IconCircle } from '@mobile/components/ui';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@mobile/hooks/useNotifications';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { formatTimeAgo } from '@mobile/lib/communityUtils';
import { navigateToBookingDetail } from '@mobile/lib/notificationNavigation';
import {
  groupNotificationsByDate,
  getNotificationIcon,
  type NotificationFilter,
} from '@mobile/lib/notificationUtils';
import { colors } from '@mobile/theme';
import { styles } from './styles/notifications-screen.styles';

const FILTER_OPTIONS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotifications(filter);
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);
  const { data: unreadData } = useUnreadNotificationCount();
  const markAllRead = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();

  const notifications = useMemo(
    () => data?.pages.flatMap((page) => page.notifications) ?? [],
    [data],
  );

  const sections = useMemo(() => groupNotificationsByDate(notifications), [notifications]);

  const unreadCount = unreadData?.unreadCount ?? 0;
  const showMarkAllRead = unreadCount > 0 && !markAllRead.isPending;

  const handleNotificationPress = async (notification: NotificationResponse) => {
    if (!notification.isRead) {
      await markRead.mutateAsync(notification.id);
    }
    if (
      notification.type === 'marketplace_message' &&
      notification.referenceType === 'conversation' &&
      notification.referenceId
    ) {
      router.push({
        pathname: '/(parent)/chat/messaging',
        params: { conversationId: notification.referenceId },
      });
      return;
    }
    if (notification.referenceType === 'booking' && notification.referenceId) {
      navigateToBookingDetail(router, notification.referenceId, {
        focusCareLog: notification.type === 'care_log_entry',
      });
      return;
    }
    if (
      notification.type === 'nanny_checkin' ||
      notification.type === 'booking_completed'
    ) {
      router.push('/(parent)/bookings' as never);
    }
  };

  const emptyMessage =
    filter === 'unread'
      ? 'You have no unread notifications.'
      : 'No notifications yet. Messages about marketplace listings will appear here.';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={16} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {showMarkAllRead ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <Text style={styles.markAllRead}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pillsContent}
        >
          {FILTER_OPTIONS.map((option) => {
            const isActive = filter === option.key;
            const countLabel =
              option.key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : '';
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}
                onPress={() => setFilter(option.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.pillText,
                    isActive ? styles.pillTextActive : styles.pillTextInactive,
                  ]}
                >
                  {option.label}
                  {countLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : isError ? (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>Could not load notifications.</Text>
            <Pressable style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <IconCircle
              icon="notifications-outline"
              size="xl"
              backgroundColor={colors.taupe}
              iconColor={colors.textMuted}
            />
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        ) : (
          <>
            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.title}</Text>
                <View style={styles.cardGroup}>
                  {section.items.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onPress={() => handleNotificationPress(notification)}
                    />
                  ))}
                </View>
              </View>
            ))}
            {hasNextPage && (
              <Pressable
                style={styles.loadMoreButton}
                onPress={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                <Text style={styles.loadMoreText}>
                  {isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      <BottomNav activeTab="home" />
    </View>
  );
}

function NotificationCard({
  notification,
  onPress,
}: {
  notification: NotificationResponse;
  onPress: () => void;
}) {
  const isUnread = !notification.isRead;
  const icon = getNotificationIcon(notification.type);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.card, isUnread ? styles.cardUnread : styles.cardRead]}
    >
      <IconCircle
        icon={icon.name}
        size="md"
        backgroundColor={icon.backgroundColor}
        iconColor={icon.iconColor}
        iconSize={18}
        style={styles.iconCircle}
      />
      <View style={styles.cardTextWrap}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, isUnread && styles.cardTitleUnread]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.cardTime}>{formatTimeAgo(notification.createdAt)}</Text>
        </View>
        <Text style={[styles.cardSubtitle, isUnread && styles.cardSubtitleUnread]} numberOfLines={2}>
          {notification.body}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
