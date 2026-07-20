import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Linking, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingResponse } from '@nanny-app/shared';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
} from '@mobile/theme';

interface Props {
  booking: BookingResponse;
  /** Pulls a fresh booking so the backend-gated number appears once it unlocks. */
  onRefresh?: () => void;
}

/** "2h 15m" / "8m" until the given instant, for the pre-reveal countdown. */
function formatCountdown(msLeft: number): string {
  const totalMinutes = Math.max(0, Math.ceil(msLeft / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Parent-facing card that surfaces the nanny's phone number so the parent can
 * coordinate arrival — but only close to the booking. For privacy the backend
 * withholds the number until nannyPhoneRevealMinutes before the start time
 * (through the end of the shift), so before the window this card just explains
 * when the number will appear. startTime/endTime are offset-bearing ISO strings,
 * so parsing them yields the correct instant.
 */
export default function ParentNannyContactCard({ booking, onRefresh }: Props) {
  const [now, setNow] = useState(() => Date.now());

  // Tick every second so the window edge and the countdown stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { revealable, active, upcoming, unlockMs } = useMemo(() => {
    const startMs = new Date(booking.startTime).getTime();
    const endMs = new Date(booking.endTime).getTime();
    const unlock = startMs - booking.nannyPhoneRevealMinutes * 60_000;
    const canReveal = booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS';
    return {
      revealable: canReveal,
      active: canReveal && now >= unlock && now <= endMs,
      upcoming: booking.status === 'CONFIRMED' && now < unlock,
      unlockMs: unlock,
    };
  }, [booking.status, booking.startTime, booking.endTime, booking.nannyPhoneRevealMinutes, now]);

  const phone = booking.nanny?.phone ?? null;

  // Once the window opens, the number is gated server-side, so pull a fresh
  // booking until it arrives. Keyed to a coarse bucket so it retries roughly
  // every 15s while waiting (covers small clock skew) rather than every tick.
  const refetchBucket = active && !phone ? Math.floor(now / 15_000) : null;
  useEffect(() => {
    if (refetchBucket !== null) onRefresh?.();
  }, [refetchBucket, onRefresh]);

  // Only for a confirmed/in-progress booking with an assigned nanny, and never
  // after the shift has ended.
  if (!revealable || !booking.nanny || (!active && !upcoming)) return null;

  const handleCall = () => {
    if (phone) void Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name={active && phone ? 'call' : 'lock-closed'} size={18} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>NANNY CONTACT</Text>
          <Text style={styles.title}>
            {active && phone ? 'Call your nanny' : 'Phone number locked'}
          </Text>
        </View>
      </View>

      {active && phone ? (
        <>
          <Pressable style={styles.phoneRow} onPress={handleCall}>
            <Ionicons name="call-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.phoneNumber}>{phone}</Text>
          </Pressable>
          <Text style={styles.hint}>
            Tap the number to call and coordinate your nanny&apos;s arrival.
          </Text>
        </>
      ) : active && !phone ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Loading your nanny&apos;s number…</Text>
        </View>
      ) : (
        <Text style={styles.hint}>
          For your privacy and hers, your nanny&apos;s phone number becomes available{' '}
          {booking.nannyPhoneRevealMinutes} minutes before the booking starts — in{' '}
          {formatCountdown(unlockMs - now)}.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: fontFamily.extraBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primaryDark,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  phoneNumber: {
    fontFamily: fontFamily.extraBold,
    fontSize: 20,
    color: colors.primaryDark,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hint: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
