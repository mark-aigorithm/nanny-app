import type { NotificationResponse } from '@nanny-app/shared';
import type { Ionicons } from '@expo/vector-icons';

import { colors } from '@mobile/theme';

export type NotificationFilter = 'all' | 'unread';

export interface NotificationSection {
  title: string;
  items: NotificationResponse[];
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysAgo(days: number): Date {
  const date = startOfDay(new Date());
  date.setDate(date.getDate() - days);
  return date;
}

export function getNotificationSectionTitle(createdAt: string): string {
  const date = new Date(createdAt);
  const today = startOfDay(new Date());
  const notificationDay = startOfDay(date);

  if (notificationDay.getTime() === today.getTime()) return 'Today';

  const yesterday = daysAgo(1);
  if (notificationDay.getTime() === yesterday.getTime()) return 'Yesterday';

  const weekAgo = daysAgo(7);
  if (notificationDay.getTime() > weekAgo.getTime()) return 'This week';

  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function groupNotificationsByDate(
  notifications: NotificationResponse[],
): NotificationSection[] {
  const sections: NotificationSection[] = [];

  for (const notification of notifications) {
    const title = getNotificationSectionTitle(notification.createdAt);
    const lastSection = sections[sections.length - 1];
    if (lastSection?.title === title) {
      lastSection.items.push(notification);
    } else {
      sections.push({ title, items: [notification] });
    }
  }

  return sections;
}

export function getNotificationIcon(type: NotificationResponse['type']): {
  name: keyof typeof Ionicons.glyphMap;
  backgroundColor: string;
  iconColor: string;
} {
  switch (type) {
    case 'marketplace_message':
      return {
        name: 'chatbubble',
        backgroundColor: colors.taupe,
        iconColor: colors.textTertiary,
      };
    case 'booking_confirmed':
      return {
        name: 'calendar',
        backgroundColor: colors.successLight,
        iconColor: colors.successDark,
      };
    case 'nanny_checkin':
      return {
        name: 'checkmark-circle',
        backgroundColor: colors.successLight,
        iconColor: colors.successDark,
      };
    case 'booking_completed':
      return {
        name: 'star',
        backgroundColor: colors.warmLight,
        iconColor: colors.goldWarm,
      };
    case 'care_log_entry':
      return {
        name: 'journal',
        backgroundColor: colors.primaryMuted,
        iconColor: colors.primary,
      };
    default:
      return {
        name: 'notifications',
        backgroundColor: colors.surfaceMuted,
        iconColor: colors.textTertiary,
      };
  }
}
