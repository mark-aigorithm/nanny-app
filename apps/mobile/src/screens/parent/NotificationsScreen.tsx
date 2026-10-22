import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Text } from '@mobile/components/ui/text';
import type { NotificationResponse } from '@nanny-app/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { FadeInView, IconCircle, PressableScale } from '@mobile/components/ui';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@mobile/hooks/useNotifications';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { useFloatingNavClearance } from '@mobile/hooks/useBottomInset';
import {
  navigateToBookingChat,
  navigateToBookingDetail,
  navigateToSurvey,
} from '@mobile/lib/notificationNavigation';
import {
  groupNotificationsByDate,
  type NotificationFilter,
} from '@mobile/lib/notificationUtils';
import { colors, screenPadding } from '@mobile/theme';
import AnnouncementCard from '@mobile/components/AnnouncementCard';
import { openPromoLink } from '@mobile/lib/openPromoLink';
import NotificationRow from '@mobile/components/NotificationRow';
import { styles } from './styles/notifications-screen.styles';

const FILTER_OPTIONS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
];

export default function NotificationsScreen() {
  const navClearance = useFloatingNavClearance();
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
    if (notification.referenceType === 'survey' && notification.referenceId) {
      navigateToSurvey(router, notification.referenceId);
      return;
    }
    // A rejected post needs fixing, so send her to My posts; an approved one
    // is live, so open it. The notification doesn't carry the post's type, so
    // the detail screen returns to the community's default pill.
    if (notification.referenceType === 'community_post' && notification.referenceId) {
      if (notification.type === 'marketplace_listing_rejected') {
        router.push('/(parent)/my-posts' as never);
      } else {
        router.push({
          pathname: '/(parent)/post-detail',
          params: { postId: notification.referenceId },
        });
      }
      return;
    }
    // The nanny couldn't stay, so that booking is a dead end — start a new one
    // instead of opening the shift she can't extend.
    if (notification.type === 'booking_message' && notification.referenceId) {
      navigateToBookingChat(router, notification.referenceId, 'parent');
      return;
    }

    if (notification.type === 'booking_extension_declined') {
      router.push('/(parent)/book/booking-date-picker' as never);
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
      router.push('/(parent)/(tabs)/bookings' as never);
    }
  };

  // An announcement: mark it read, then open its package or promo link. The
  // read is fired, not awaited — her tap should open the offer at once, and a
  // failed read only leaves the dot on. No link opens Home, as the push does.
  const handleAnnouncementPress = (notification: NotificationResponse) => {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.link) openPromoLink(router, notification.link);
    else router.navigate('/(parent)/(tabs)/home' as never);
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
            style={styles.markAllReadButton}
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: navClearance + screenPadding }]}
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
              <PressableScale
                key={option.key}
                style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}
                haptic="select"
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
              </PressableScale>
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
            {sections.map((section, index) => (
              <FadeInView key={section.title} index={index} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.title}</Text>
                <View style={styles.cardGroup}>
                  {section.items.map((notification) =>
                    notification.type === 'announcement' ? (
                      <AnnouncementCard
                        key={notification.id}
                        notification={notification}
                        onPress={() => handleAnnouncementPress(notification)}
                      />
                    ) : (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        onPress={() => handleNotificationPress(notification)}
                      />
                    ),
                  )}
                </View>
              </FadeInView>
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
    </View>
  );
}
