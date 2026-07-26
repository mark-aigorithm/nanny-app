import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BookingResponse } from '@nanny-app/shared';

import { Button } from '@mobile/components/ui';
import { formatMoney } from '@mobile/lib/formatMoney';
import { colors, spacing, borderRadius, typeScale, shadows } from '@mobile/theme';

/**
 * Shown on a paid booking when our team edited it and the total went up: the
 * mother owes the difference, and until she pays it the booking cannot start.
 *
 * Reads `booking.balanceDue` rather than fetching, so this card and the Start
 * gate it replaces can never disagree about whether money is owed — they are
 * driven off the same payload in the same render.
 */
export function AmountDueCard({ booking }: { booking: BookingResponse }) {
  const router = useRouter();
  const pending = booking.balanceDue;
  if (!pending) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="alert-circle" size={20} color={colors.gold} />
        <Text style={styles.title}>Balance due</Text>
      </View>
      <Text style={styles.amount}>{formatMoney(pending.amountEgp)}</Text>
      <Text style={styles.note}>
        {pending.reason
          ? `Your booking was updated (${pending.reason}). Complete your payment to start this booking.`
          : 'Your booking total went up after an update. Complete your payment to start this booking.'}
      </Text>
      <Button
        title="Complete payment"
        onPress={() =>
          router.push({
            pathname: '/(parent)/book/adjustment-checkout',
            params: { adjustmentId: String(pending.id), bookingId: String(booking.id) },
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    gap: spacing.sm,
    ...shadows.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  amount: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  note: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
});
