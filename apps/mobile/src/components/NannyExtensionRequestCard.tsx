import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingResponse } from '@nanny-app/shared';

import { Button } from '@mobile/components/ui';
import { useBookingList, useRespondToExtension } from '@mobile/hooks/useBookings';
import { formatMoney } from '@mobile/lib/formatMoney';
import { colors, borderRadius, shadows, spacing, typeScale } from '@mobile/theme';

/** mm:ss until the given instant, clamped at 0. */
function formatRemaining(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The running booking whose parent is waiting on an answer, if any. */
function pickPendingRequest(bookings: BookingResponse[]): BookingResponse | null {
  return (
    bookings.find(
      (b) => b.status === 'IN_PROGRESS' && b.activeExtension?.status === 'PENDING_NANNY',
    ) ?? null
  );
}

/**
 * Asks the nanny to accept or decline extra hours on the shift she's working.
 *
 * Polls alongside the ongoing-shift banner so the request appears without her
 * having to open the push. Accepting does NOT charge the parent — it only tells
 * her she can stay; the parent then pays, and only that adds the hours.
 */
export default function NannyExtensionRequestCard() {
  // Same query key as OngoingBookingBanner, so React Query serves both from one
  // request rather than doubling the poll.
  const { data: bookings = [] } = useBookingList('IN_PROGRESS', undefined, 15_000);
  const respond = useRespondToExtension();

  const [now, setNow] = useState(() => Date.now());
  const booking = pickPendingRequest(bookings);
  const extension = booking?.activeExtension ?? null;

  useEffect(() => {
    if (!extension) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [extension]);

  const msLeft = useMemo(
    () => (extension ? new Date(extension.expiresAt).getTime() - now : 0),
    [extension, now],
  );

  if (!booking || !extension) return null;

  const motherName = booking.motherFirstName;
  const hours = extension.hours;
  const plural = hours === 1 ? '' : 's';

  const handleRespond = (accept: boolean) => {
    const run = () =>
      respond.mutate(
        { extensionId: extension.id, accept },
        { onError: (err) => Alert.alert('Could not send your answer', err.message) },
      );

    if (accept) {
      run();
      return;
    }

    Alert.alert(
      'Decline the extra hours?',
      `${motherName} will be told you can't stay longer. Your shift still ends at the original time.`,
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: run },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>EXTRA HOURS REQUESTED</Text>
          <Text style={styles.title}>
            {motherName} would like you to stay {hours} more hour{plural}
          </Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>You'd earn</Text>
        <Text style={styles.amountValue}>{formatMoney(extension.nannyAmount)}</Text>
      </View>

      <Text style={styles.hint}>
        Accepting lets her pay for the extra time — your shift only changes once she does. Expires
        in {formatRemaining(msLeft)}.
      </Text>

      <Button
        title={`Yes, I can stay ${hours}h`}
        onPress={() => handleRespond(true)}
        loading={respond.isPending}
        disabled={respond.isPending}
      />
      <Button
        title="Can't stay"
        variant="outline"
        onPress={() => handleRespond(false)}
        disabled={respond.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
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
    ...typeScale.labelSm,
    letterSpacing: 1.1,
    color: colors.primaryDark,
  },
  title: {
    ...typeScale.bodyLg,
    color: colors.textPrimary,
  },
  hint: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  amountLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  amountValue: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
});
