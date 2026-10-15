import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge, PressableScale } from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { useBookingChatSummary } from '@mobile/hooks/useBookingChat';
import { borderRadius, colors, shadows, spacing, typeScale } from '@mobile/theme';

interface BookingChatCardProps {
  bookingId: number;
  /** The other side's first name, for "Message Sara". */
  otherFirstName: string | null;
  onOpen: () => void;
}

/**
 * The way into a booking's chat. Live: "Message <name>" with an unread badge.
 * Over, with history: "View messages". Otherwise nothing — before the shift
 * there is nothing to open.
 */
export function BookingChatCard({ bookingId, otherFirstName, onOpen }: BookingChatCardProps) {
  const { data: summary } = useBookingChatSummary(bookingId);
  if (!summary) return null;
  if (!summary.canSend && summary.messageCount === 0) return null;

  const title = summary.canSend ? `Message ${otherFirstName ?? 'them'}` : 'View messages';
  const subtitle = summary.canSend
    ? 'Ask or share an update during the shift'
    : `${summary.messageCount} ${summary.messageCount === 1 ? 'message' : 'messages'} · read-only`;
  const unread = summary.unreadCount;

  return (
    <PressableScale
      style={styles.card}
      onPress={onOpen}
      haptic="tap"
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `${title}, ${unread} unread` : title}
    >
      <View style={styles.iconWrap}>
        <View style={styles.icon}>
          <Ionicons name="chatbubbles-outline" size={18} color={colors.primaryDark} />
        </View>
        {unread > 0 ? <Badge count={unread} size="sm" style={styles.badge} /> : null}
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Mirrors the booking detail's "Contact support" row so the two read as one family.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.warmSubtle,
    ...shadows.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // On the icon's corner, outside its shape.
  badge: {
    position: 'absolute',
    top: -spacing.xxs,
    right: -spacing.xs,
  },
  text: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
});
