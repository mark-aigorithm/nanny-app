import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingResponse } from '@nanny-app/shared';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
} from '@mobile/theme';
import { fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { useBookingShiftTimer } from '@mobile/hooks/useBookingShiftTimer';
import {
  showConfirmEndPrompt,
  showEnterPinPrompt,
  showShiftErrorPrompt,
} from '@mobile/store/nannyShiftPromptStore';

interface Props {
  bookings: BookingResponse[];
}

/**
 * Opens the parent-PIN entry so the nanny can start the shift. The actual
 * check-in mutation runs inside the PIN modal once the correct code is entered.
 */
export function confirmStartShift(booking: BookingResponse): void {
  showEnterPinPrompt(booking);
}

export function confirmEndShift(
  booking: BookingResponse,
  checkOut: { mutate: (id: number, opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => void; isPending: boolean },
  onSuccess?: () => void,
): void {
  showConfirmEndPrompt(booking, () => {
    checkOut.mutate(booking.id, {
      onSuccess,
      onError: (err) => showShiftErrorPrompt('Could not end shift', err.message),
    });
  });
}
export default function UpcomingShiftBanner({ bookings }: Props) {
  const { nearestBooking, phase, countdownLabel, canCheckIn } = useBookingShiftTimer(bookings);

  if (!nearestBooking || phase === 'idle' || phase === 'in_progress') {
    return null;
  }

  const motherName = `${nearestBooking.motherFirstName} ${nearestBooking.motherLastName}`;
  const isUrgent = phase === 'ready_to_start' || phase === 'overdue';
  const dateTime = `${fmtBookingDate(nearestBooking.date)} · ${fmtBookingTime(nearestBooking.startTime, nearestBooking.endTime)}`;

  return (
    <View style={[styles.container, isUrgent ? styles.containerUrgent : styles.containerSoon]}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={isUrgent ? 'alarm' : 'time-outline'}
          size={22}
          color={isUrgent ? colors.tintAmber : colors.primary}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.eyebrow, isUrgent && styles.eyebrowUrgent]}>
            {isUrgent ? 'START NOW' : 'UPCOMING SHIFT'}
          </Text>
          <View style={styles.eyebrowDivider} />
          <Text style={styles.countdown}>{countdownLabel}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {motherName}
        </Text>
        <Text style={styles.meta}>{dateTime}</Text>
      </View>

      {canCheckIn ? (
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => confirmStartShift(nearestBooking)}
          accessibilityRole="button"
          accessibilityLabel={`Start shift with ${motherName}`}
        >
          <Text style={styles.ctaText}>Start</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  containerUrgent: {
    backgroundColor: colors.warmLight,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  containerSoon: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: fontFamily.extraBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primary,
  },
  eyebrowUrgent: {
    color: colors.tintAmber,
  },
  eyebrowDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
  countdown: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },
});
