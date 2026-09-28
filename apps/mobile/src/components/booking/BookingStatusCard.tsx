import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BookingResponse } from '@nanny-app/shared';

import { Button } from '@mobile/components/ui';
import { BookingNannyAvatar } from '@mobile/components/booking/BookingNannyAvatar';
import { formatCountdown, useNannyPhone } from '@mobile/hooks/useNannyPhone';
import { childrenPhrase, formatSpan } from '@mobile/lib/bookingDetail';
import { formatMoney } from '@mobile/lib/formatMoney';
import { colors, borderRadius, shadows, spacing, typeScale } from '@mobile/theme';

interface Props {
  booking: BookingResponse;
  /** Pulls a fresh booking so the nanny's number appears once it is released. */
  onRefresh?: () => void;
  onPay: () => void;
  onCancel: () => void;
  isCancelling: boolean;
}

type Tone = 'accent' | 'muted' | 'error';

const TONE_COLOR: Record<Tone, string> = {
  accent: colors.primaryDark,
  muted: colors.textTertiary,
  error: colors.error,
};

/** "12:10 PM" for a plain UTC instant (check-out, cancellation) on this device. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * The top of Booking details for every state but a running shift (that one is
 * LiveShiftCard): who, where the booking stands, and the one thing she can do
 * about it next — pay, get ready, review, or cancel.
 */
export function BookingStatusCard({ booking, onRefresh, onPay, onCancel, isCancelling }: Props) {
  const router = useRouter();
  const {
    phone,
    active: phoneWindow,
    upcoming: phoneLocked,
    msUntilUnlock,
  } = useNannyPhone(booking, onRefresh);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (booking.status !== 'CONFIRMED') return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [booking.status]);

  const nanny = booking.nanny;
  const children = childrenPhrase(booking.children, booking.childrenCount);
  const place = booking.address?.details?.label ?? booking.address?.area ?? null;
  const forWhom = `For ${children}${place ? ` at ${place}` : ''}`;
  const canCancel =
    booking.status === 'PENDING' || booking.status === 'APPROVED' || booking.status === 'CONFIRMED';

  let tone: Tone = 'accent';
  let status: string;
  let body: React.ReactNode = null;

  switch (booking.status) {
    case 'PENDING':
    case 'PENDING_CONFIRMATION':
      status = 'Finding a nanny';
      body = (
        <Text style={styles.text}>
          We're asking nannies near {booking.address?.area ?? 'you'}. You'll get a notification as
          soon as one accepts.
        </Text>
      );
      break;

    case 'APPROVED':
      status = 'Nanny found · payment due';
      body = (
        <>
          <Text style={styles.text}>
            Pay {formatMoney(booking.totalAmount)} to confirm {nanny?.firstName ?? 'your nanny'}.
          </Text>
          <Button title="Complete payment" icon="card-outline" onPress={onPay} />
        </>
      );
      break;

    case 'CONFIRMED': {
      const msToStart = new Date(booking.startTime).getTime() - now;
      status = 'Confirmed';
      body = (
        <>
          <Text style={styles.big}>
            {msToStart > 60_000
              ? `Starts in ${formatSpan(msToStart)}`
              : `Waiting for ${nanny?.firstName ?? 'your nanny'} to check in`}
          </Text>
          {phoneWindow && nanny ? (
            <Button
              title={`Call ${nanny.firstName}`}
              icon="call-outline"
              variant="outline"
              loading={!phone}
              onPress={() => {
                if (phone) void Linking.openURL(`tel:${phone}`);
              }}
            />
          ) : phoneLocked ? (
            <View style={styles.hintRow}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              <Text style={styles.hint}>
                For your privacy and hers, {nanny?.firstName ?? 'her'}'s number appears{' '}
                {booking.nannyPhoneRevealMinutes} minutes before the start, in{' '}
                {formatCountdown(msUntilUnlock)}.
              </Text>
            </View>
          ) : null}
        </>
      );
      break;
    }

    case 'COMPLETED': {
      status = 'Completed';
      const ended = booking.motherEndedAt ?? booking.nannyCheckedOutAt;
      const review = booking.myReview;
      body = (
        <>
          {ended ? (
            <Text style={styles.text}>
              {booking.motherEndedAt ? 'You ended the booking' : 'Finished'} at {clockTime(ended)}.
            </Text>
          ) : null}
          {review ? (
            <View style={styles.review}>
              <View style={styles.stars} accessibilityLabel={`You rated ${review.rating} of 5`}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= review.rating ? 'star' : 'star-outline'}
                    size={16}
                    color={colors.gold}
                  />
                ))}
              </View>
              {review.comment ? <Text style={styles.text}>{review.comment}</Text> : null}
            </View>
          ) : nanny ? (
            <Button
              title="Leave a review"
              icon="star-outline"
              onPress={() =>
                router.push({
                  pathname: '/(parent)/book/review',
                  params: { bookingId: String(booking.id) },
                } as never)
              }
            />
          ) : null}
        </>
      );
      break;
    }

    case 'CANCELLED':
    case 'REFUNDED':
      tone = 'error';
      status = booking.status === 'REFUNDED' ? 'Refunded' : 'Cancelled';
      body = booking.cancellationReason ? (
        <Text style={styles.text}>{booking.cancellationReason}</Text>
      ) : null;
      break;

    default:
      tone = 'muted';
      status = booking.status;
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        {nanny ? (
          <BookingNannyAvatar nanny={nanny} />
        ) : (
          <View style={styles.searching}>
            <Ionicons name="search" size={22} color={colors.primaryDark} />
          </View>
        )}
        <View style={styles.who}>
          <Text style={[styles.status, { color: TONE_COLOR[tone] }]}>{status}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {nanny ? `${nanny.firstName} ${nanny.lastName}` : 'Your request'}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {forWhom}
          </Text>
        </View>
      </View>

      {body}

      {canCancel ? (
        <Pressable
          style={styles.cancel}
          onPress={onCancel}
          disabled={isCancelling}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>{isCancelling ? 'Cancelling...' : 'Cancel booking'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warmSubtle,
    ...shadows.sm,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  searching: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: {
    flex: 1,
    gap: spacing.xxs,
  },
  status: {
    ...typeScale.captionBold,
  },
  name: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  sub: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  big: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  text: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  hint: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  review: {
    gap: spacing.xs,
  },
  stars: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  cancel: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.warmSubtle,
  },
  cancelText: {
    ...typeScale.labelMd,
    color: colors.error,
  },
});
