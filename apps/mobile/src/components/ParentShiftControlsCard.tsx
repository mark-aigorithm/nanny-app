import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BookingResponse } from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';

import { Button, Chip } from '@mobile/components/ui';
import {
  useCancelExtension,
  useEndBooking,
  useRequestExtension,
} from '@mobile/hooks/useBookings';
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

function hourLabel(hours: number): string {
  return `+${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * The parent's controls while a shift is actually running: end it early, or ask
 * the nanny for more hours.
 *
 * The card is a small state machine driven entirely by `booking.activeExtension`
 * — "is a request in flight" is never tracked locally, so the state survives
 * backgrounding the app and stays correct when the nanny's answer arrives while
 * the screen is already open.
 */
export default function ParentShiftControlsCard({ booking }: Props) {
  const router = useRouter();
  const role = useUserProfileStore((s) => s.profile?.role);

  const endBooking = useEndBooking();
  const requestExtension = useRequestExtension();
  const cancelExtension = useCancelExtension();

  const [picking, setPicking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const extension = booking.activeExtension;
  const isRunning = booking.status === 'IN_PROGRESS';

  // Tick only while a deadline is on screen — no reason to re-render once the
  // card is just showing the two buttons.
  useEffect(() => {
    if (!extension) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [extension]);

  const nannyName = booking.nanny?.firstName ?? 'your nanny';
  const msLeft = useMemo(
    () => (extension ? new Date(extension.expiresAt).getTime() - now : 0),
    [extension, now],
  );

  if (role !== Role.MOTHER || !isRunning) return null;

  const handleEnd = () => {
    Alert.alert(
      'End this booking?',
      `This ends the shift now and ${nannyName} will be told you're done. The hours you've already paid for aren't refunded.`,
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'End booking',
          style: 'destructive',
          onPress: () =>
            endBooking.mutate(booking.id, {
              onError: (err) => Alert.alert('Could not end the booking', err.message),
            }),
        },
      ],
    );
  };

  const handlePickHours = (hours: number) => {
    Alert.alert(
      `Ask for ${hourLabel(hours).toLowerCase()}?`,
      `We'll send a request to ${nannyName} to confirm she can stay. If she accepts, you'll be asked to pay for the extra time before it's added to your booking.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Send request',
          onPress: () =>
            requestExtension.mutate(
              { bookingId: booking.id, hours },
              {
                onSuccess: () => setPicking(false),
                onError: (err) => Alert.alert('Could not send the request', err.message),
              },
            ),
        },
      ],
    );
  };

  const handleWithdraw = () => {
    if (!extension) return;
    Alert.alert('Withdraw this request?', `${nannyName} will no longer be asked to stay longer.`, [
      { text: 'Keep waiting', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () =>
          cancelExtension.mutate(extension.id, {
            onError: (err) => Alert.alert('Could not withdraw', err.message),
          }),
      },
    ]);
  };

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
          onPress={handleWithdraw}
          loading={cancelExtension.isPending}
          disabled={cancelExtension.isPending}
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
          onPress={handleWithdraw}
          loading={cancelExtension.isPending}
          disabled={cancelExtension.isPending}
        />
      </View>
    );
  }

  // ── Idle: end the shift, or start an extension ────────────────────────────
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SHIFT IN PROGRESS</Text>
          <Text style={styles.title}>Need more time, or all done?</Text>
        </View>
      </View>

      {picking ? (
        <>
          <Text style={styles.hint}>How much longer do you need?</Text>
          <View style={styles.chipRow}>
            {booking.extendableHours.map((hours) => (
              <Chip key={hours} label={hourLabel(hours)} onPress={() => handlePickHours(hours)} />
            ))}
          </View>
          <Button
            title="Cancel"
            variant="text"
            onPress={() => setPicking(false)}
            disabled={requestExtension.isPending}
          />
        </>
      ) : (
        <>
          {booking.canExtend ? (
            <Button
              title="Extend booking"
              variant="outline"
              icon="add-circle-outline"
              onPress={() => setPicking(true)}
            />
          ) : (
            // The server decides what's extendable, so explain why nothing is
            // on offer rather than showing a button that would only 400.
            <Text style={styles.hint}>This booking can't be extended any further today.</Text>
          )}
          <Button
            title="End booking"
            variant="destructive"
            onPress={handleEnd}
            loading={endBooking.isPending}
            disabled={endBooking.isPending}
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
