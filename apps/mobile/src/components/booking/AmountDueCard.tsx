import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@mobile/components/ui';
import { useBookingAdjustments } from '@mobile/hooks/useBookings';
import { formatMoney } from '@mobile/lib/formatMoney';
import { colors, spacing, borderRadius, typeScale, shadows } from '@mobile/theme';

/**
 * Shown on a paid booking when our team edited it and the total went up: the
 * mother owes the difference. Fetches her open balance-due obligations and,
 * if any, prompts her to pay via the adjustment checkout.
 */
export function AmountDueCard({ bookingId }: { bookingId: number }) {
  const router = useRouter();
  const { data: adjustments } = useBookingAdjustments(bookingId);
  const pending = adjustments?.find((a) => a.status === 'PENDING_PAYMENT');
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
          ? `Your booking was updated (${pending.reason}). Pay the difference to keep it confirmed.`
          : 'Your booking total went up after an update. Pay the difference to keep it confirmed.'}
      </Text>
      <Button
        title="Pay the difference"
        onPress={() =>
          router.push({
            pathname: '/(parent)/book/adjustment-checkout',
            params: { adjustmentId: String(pending.id), bookingId: String(bookingId) },
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
