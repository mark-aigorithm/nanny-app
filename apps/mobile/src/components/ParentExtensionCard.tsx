import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BookingResponse } from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';

import { Button } from '@mobile/components/ui';
import { hourLabel, useShiftActions } from '@mobile/hooks/useShiftActions';
import { formatMoney } from '@mobile/lib/formatMoney';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors, borderRadius, shadows, spacing, typeScale } from '@mobile/theme';

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
 * An extension the mother asked for that is still in flight: waiting on the
 * nanny, or accepted and waiting on payment. Renders nothing otherwise — the
 * idle "Extend / End" controls live on the live shift card above it.
 *
 * Driven entirely by `booking.activeExtension`; "is a request in flight" is
 * never tracked locally, so the state survives backgrounding the app and stays
 * correct when the nanny's answer arrives while the screen is already open.
 */
export default function ParentExtensionCard({ booking }: Props) {
  const router = useRouter();
  const role = useUserProfileStore((s) => s.profile?.role);
  const { nannyName, withdraw, isWithdrawing } = useShiftActions(booking);
  const [now, setNow] = useState(() => Date.now());

  const extension = booking.activeExtension;

  // Tick only while a deadline is on screen.
  useEffect(() => {
    if (!extension) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [extension]);

  const msLeft = useMemo(
    () => (extension ? new Date(extension.expiresAt).getTime() - now : 0),
    [extension, now],
  );

  if (role !== Role.MOTHER || booking.status !== 'IN_PROGRESS' || !extension) return null;

  // ── Accepted: she owes money, and this is her route to checkout ───────────
  if (extension?.status === 'ACCEPTED') {
    return (
      <View style={[styles.card, styles.cardAccent]}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>EXTRA HOURS CONFIRMED</Text>
            <Text style={styles.title}>
              {nannyName} can stay {extension.hours} more hour
              {extension.hours === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>To pay</Text>
          <Text style={styles.amountValue}>{formatMoney(extension.totalAmount)}</Text>
        </View>

        <Text style={styles.hint}>
          The extra time is added once payment goes through. This expires in{' '}
          {formatRemaining(msLeft)}.
        </Text>

        <Button
          title="Pay now"
          icon="card-outline"
          onPress={() =>
            router.push({
              pathname: '/(parent)/book/extension-checkout',
              params: { extensionId: String(extension.id) },
            } as never)
          }
        />
        <Button
          title="Never mind"
          variant="text"
          onPress={withdraw}
          loading={isWithdrawing}
          disabled={isWithdrawing}
        />
      </View>
    );
  }

  // ── Waiting on the nanny ──────────────────────────────────────────────────
  if (extension?.status === 'PENDING_NANNY') {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="hourglass-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>EXTENSION REQUESTED</Text>
            <Text style={styles.title}>
              Waiting for {nannyName} to confirm {hourLabel(extension.hours).toLowerCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.hint}>
          We'll let you know as soon as she answers. If she doesn't reply within{' '}
          {formatRemaining(msLeft)}, the request is cancelled and nothing is charged.
        </Text>

        <Button
          title="Withdraw request"
          variant="outline"
          onPress={withdraw}
          loading={isWithdrawing}
          disabled={isWithdrawing}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    ...shadows.sm,
  },
  // The one state that needs the parent to act gets the sage edge.
  cardAccent: {
    borderColor: colors.primary,
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
