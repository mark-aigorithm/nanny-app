import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingResponse, BookingStatus } from '@nanny-app/shared';

import { Text } from '@mobile/components/ui/text';
import { BookingNannyAvatar } from '@mobile/components/booking/BookingNannyAvatar';
import { fmtBookingTime } from '@mobile/hooks/useBookings';
import { childrenPhrase, durationLabel } from '@mobile/lib/bookingDetail';
import { formatBookingStatus } from '@mobile/lib/formatBookingStatus';
import { borderRadius, colors, shadows, spacing, typeScale } from '@mobile/theme';

function statusColors(status: BookingStatus) {
  switch (status) {
    case 'CONFIRMED':
      return { backgroundColor: colors.successLight, color: colors.successDark };
    case 'CANCELLED':
      return { backgroundColor: colors.errorLight, color: colors.error };
    case 'COMPLETED':
      return { backgroundColor: colors.taupe, color: colors.textSecondary };
    default:
      return { backgroundColor: colors.taupeLight, color: colors.textTertiary };
  }
}

/**
 * The top of the nanny's Booking details for every state but a running shift
 * (that one is NannyShiftCard): whose family, where the booking stands, and
 * the when and who of it at a glance.
 */
export function NannyBookingStatusCard({ booking }: { booking: BookingResponse }) {
  const { backgroundColor, color } = statusColors(booking.status);
  const mother = {
    firstName: booking.motherFirstName,
    lastName: booking.motherLastName,
    avatarUrl: booking.motherAvatarUrl,
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <BookingNannyAvatar nanny={mother} />
        <View style={styles.who}>
          <Text style={styles.name}>
            {booking.motherFirstName} {booking.motherLastName}
          </Text>
          <View style={[styles.pill, { backgroundColor }]}>
            <Text style={[styles.pillText, { color }]}>{formatBookingStatus(booking.status)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.facts}>
        <View style={styles.fact}>
          <Ionicons name="time-outline" size={18} color={colors.primaryDark} />
          <Text style={styles.factText}>
            {fmtBookingTime(booking.startTime, booking.endTime)} · {durationLabel(booking.durationHours)}
          </Text>
        </View>
        <View style={styles.fact}>
          <Ionicons name="people-outline" size={18} color={colors.primaryDark} />
          <Text style={styles.factText}>
            {childrenPhrase(booking.children, booking.childrenCount, 'One child')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.sm,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  who: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  pillText: {
    ...typeScale.captionBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  facts: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.warmSubtle,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  factText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
