import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingResponse } from '@nanny-app/shared';
import { CHECK_IN_EARLY_MINUTES, Role } from '@nanny-app/shared';

import { Button } from '@mobile/components/ui';
import { useGenerateStartPin } from '@mobile/hooks/useBookings';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
} from '@mobile/theme';

interface Props {
  booking: BookingResponse;
}

/** mm:ss until the given instant, clamped at 0. */
function formatRemaining(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Parent-only "Start booking" gate shown within the 15-minute check-in window.
 * The parent taps Start to reveal a 4-digit PIN and reads it out to the nanny,
 * who enters it to check in. Auto-hides outside the window and once the nanny
 * has started (status flips to IN_PROGRESS on the next poll).
 */
export default function ParentStartPinCard({ booking }: Props) {
  const role = useUserProfileStore((s) => s.profile?.role);
  const generate = useGenerateStartPin();

  const [pin, setPin] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick every second so the window edge and the PIN countdown stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const inWindow = useMemo(() => {
    if (booking.status !== 'CONFIRMED') return false;
    const startMs = new Date(booking.startTime).getTime();
    const endMs = new Date(booking.endTime).getTime();
    const earliest = startMs - CHECK_IN_EARLY_MINUTES * 60_000;
    return now >= earliest && now <= endMs;
  }, [booking.status, booking.startTime, booking.endTime, now]);

  // Drop a revealed PIN once it expires so the parent can regenerate cleanly.
  const pinExpired = expiresAt != null && now >= expiresAt;
  useEffect(() => {
    if (pinExpired) {
      setPin(null);
      setExpiresAt(null);
    }
  }, [pinExpired]);

  // Only parents, only for a confirmed booking inside the window.
  if (role !== Role.MOTHER || !inWindow) return null;

  const handleStart = () => {
    generate.mutate(booking.id, {
      onSuccess: (res) => {
        setPin(res.pin);
        setExpiresAt(new Date(res.expiresAt).getTime());
      },
    });
  };

  const hasPin = pin != null && expiresAt != null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="keypad" size={18} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>START BOOKING</Text>
          <Text style={styles.title}>
            {hasPin ? 'Give this PIN to your nanny' : 'Only you can start this booking'}
          </Text>
        </View>
      </View>

      {hasPin ? (
        <>
          <View style={styles.pinRow}>
            {pin.split('').map((digit, i) => (
              <View key={i} style={styles.pinCell}>
                <Text style={styles.pinDigit}>{digit}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>
            Read this code to your nanny — she enters it to start the shift. Expires in{' '}
            {formatRemaining(expiresAt - now)}.
          </Text>
          <Button
            title="Regenerate PIN"
            onPress={handleStart}
            variant="outline"
            loading={generate.isPending}
            disabled={generate.isPending}
          />
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            Tap Start when your nanny arrives to reveal a 4-digit PIN for her to enter.
          </Text>
          {generate.isError ? (
            <Text style={styles.error}>{generate.error.message}</Text>
          ) : null}
          <Button
            title="Start booking"
            onPress={handleStart}
            loading={generate.isPending}
            disabled={generate.isPending}
          />
        </>
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
  pinRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  pinCell: {
    width: 56,
    height: 64,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDigit: {
    fontFamily: fontFamily.extraBold,
    fontSize: 30,
    color: colors.primaryDark,
  },
  hint: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  error: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.error,
  },
});
