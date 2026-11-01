import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge, PressableScale } from '@mobile/components/ui';
import { useBookingChatSummary } from '@mobile/hooks/useBookingChat';
import { borderRadius, colors, spacing } from '@mobile/theme';

interface BookingChatButtonProps {
  bookingId: number;
  /** The other side's first name, for the screen-reader label. */
  otherFirstName: string | null;
  /** `onDark` sits on the green on-shift banner; `onLight` on a white card. */
  tone: 'onDark' | 'onLight';
  onOpen: () => void;
}

/**
 * The compact way into a booking's chat, for places where the full
 * BookingChatCard doesn't fit: a round chat icon with the unread count on its
 * corner. Same rules as the card — nothing to show before there is a chat.
 */
export function BookingChatButton({ bookingId, otherFirstName, tone, onOpen }: BookingChatButtonProps) {
  const { data: summary } = useBookingChatSummary(bookingId);
  if (!summary) return null;
  if (!summary.canSend && summary.messageCount === 0) return null;

  const unread = summary.unreadCount;
  const label = `Message ${otherFirstName ?? 'them'}`;
  const onDark = tone === 'onDark';

  return (
    <PressableScale
      style={styles.hit}
      onPress={onOpen}
      haptic="tap"
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `${label}, ${unread} unread` : label}
    >
      <View style={[styles.circle, onDark ? styles.circleOnDark : styles.circleOnLight]}>
        <Ionicons
          name="chatbubbles-outline"
          size={20}
          color={onDark ? colors.white : colors.primaryDark}
        />
      </View>
      {unread > 0 ? <Badge count={unread} size="sm" style={styles.badge} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 44,
    height: 44,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The same translucent white as the banner's chevron.
  circleOnDark: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  circleOnLight: {
    backgroundColor: colors.primaryMuted,
  },
  // On the icon's corner, outside its shape.
  badge: {
    position: 'absolute',
    top: -spacing.xxs,
    right: -spacing.xxs,
  },
});
