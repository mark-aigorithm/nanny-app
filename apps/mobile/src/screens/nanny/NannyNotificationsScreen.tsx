import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Text } from '@mobile/components/ui/text';
import type { NotificationResponse } from '@nanny-app/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { IconCircle, ScreenContainer, StackHeader } from '@mobile/components/ui';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@mobile/hooks/useNotifications';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { navigateToBookingChat } from '@mobile/lib/notificationNavigation';
import {
  groupNotificationsByDate,
  type NotificationFilter,
} from '@mobile/lib/notificationUtils';
import { colors, spacing } from '@mobile/theme';
import NotificationRow from '@mobile/components/NotificationRow';
import { styles } from './styles/nanny-notifications-screen.styles';

const FILTER_OPTIONS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
];

export default function NannyNotificationsScreen() {
  const router = useRouter();
  const bottomPadding = useBottomBarPadding(spacing['4xl']);
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
    if (notification.type === 'booking_message' && notification.referenceId) {
      navigateToBookingChat(router, notification.referenceId, 'nanny');
    }
  };

  const emptyMessage =
    filter === 'unread'
      ? 'You have no unread notifications.'
      : 'No notifications yet. Booking updates and messages will appear here.';

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title="Notifications"
        rightElement={
          showMarkAllRead ? (
            <Pressable onPress={() => markAllRead.mutate()} disabled={markAllRead.isPending} hitSlop={8}>
              <Text style={styles.markAllRead}>Mark all read</Text>
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primaryDark}
            colors={[colors.primaryDark]}
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
              <Pressable
                key={option.key}
                style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}
                onPress={() => setFilter(option.key)}
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
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator color={colors.primaryDark} style={styles.loader} />
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
                    <NotificationRow
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
    </ScreenContainer>
  );
}
