import React, { useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingLocation, BookingResponse } from '@nanny-app/shared';
import { PaymentStatus } from '@nanny-app/shared';

import { PressableScale } from '@mobile/components/ui';
import { durationLabel } from '@mobile/lib/bookingDetail';
import { formatPaymentMethod, formatPaymentStatus } from '@mobile/lib/formatBookingStatus';
import { formatHourlyRate, formatMoney } from '@mobile/lib/formatMoney';
import { formatBookingTimeRange, formatDurationHours } from '@mobile/lib/formatTime';
import { colors, borderRadius, shadows, spacing, typeScale } from '@mobile/theme';

interface Props {
  booking: BookingResponse;
  /** Open the payment breakdown on arrival — when she is about to pay it. */
  paymentOpen?: boolean;
}

/** "Building 4, floor 2, apt 7" — only the parts she filled in. */
function doorLine(details: NonNullable<BookingLocation['details']>): string | null {
  const parts = [
    details.building ? `Building ${details.building}` : null,
    details.floor ? `floor ${details.floor}` : null,
    details.apartment ? `apt ${details.apartment}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

/**
 * The paperwork, folded into one card at the bottom of Booking details: where,
 * when, and what it cost. Payment shows its headline — amount and whether it
 * went through — and opens to the full breakdown.
 */
export function BookingInfoCard({ booking, paymentOpen = false }: Props) {
  const [open, setOpen] = useState(paymentOpen);
  const details = booking.address?.details ?? null;
  const door = details ? doorLine(details) : null;
  const payment = booking.payment;

  const paymentIcon =
    payment?.status === PaymentStatus.CAPTURED
      ? 'checkmark-circle'
      : payment?.status === PaymentStatus.FAILED
        ? 'alert-circle'
        : 'time-outline';
  const paymentColor =
    payment?.status === PaymentStatus.CAPTURED
      ? colors.successDark
      : payment?.status === PaymentStatus.FAILED
        ? colors.error
        : colors.textTertiary;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Booking info</Text>
      <View style={styles.card}>
        {booking.address ? (
          <View style={styles.row}>
            <RowIcon name="location-outline" />
            <View style={styles.main}>
              <Text style={styles.title}>{details?.label ?? booking.address.area}</Text>
              {details ? (
                <Text style={styles.sub}>
                  {details.formattedAddress}
                  {door ? `. ${door}` : ''}
                </Text>
              ) : null}
              {details?.landmark ? <Text style={styles.sub}>{details.landmark}</Text> : null}
            </View>
            {details ? (
              <PressableScale
                style={styles.mapsButton}
                onPress={() => void Linking.openURL(mapsUrl(details.latitude, details.longitude))}
                accessibilityRole="button"
                accessibilityLabel="Open in Maps"
              >
                <Ionicons name="navigate-outline" size={15} color={colors.primaryDark} />
                <Text style={styles.mapsText}>Maps</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.row, booking.address ? styles.divided : null]}>
          <RowIcon name="time-outline" />
          <View style={styles.main}>
            <Text style={styles.title}>
              {formatBookingTimeRange(booking.startTime, booking.endTime)}
            </Text>
            <Text style={styles.sub}>{durationLabel(booking.durationHours)}</Text>
          </View>
        </View>

        <Pressable
          style={[styles.row, styles.divided]}
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityHint="Shows the price breakdown"
        >
          <RowIcon name="card-outline" />
          <View style={styles.main}>
            <Text style={styles.title}>{formatMoney(booking.totalAmount)}</Text>
            {payment ? (
              <View style={styles.paymentStatus}>
                <Ionicons name={paymentIcon} size={14} color={paymentColor} />
                <Text style={[styles.sub, { color: paymentColor }]}>
                  {formatPaymentStatus(payment.status)} · {formatPaymentMethod(payment.method)}
                </Text>
              </View>
            ) : (
              <Text style={styles.sub}>Not paid yet</Text>
            )}
          </View>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </Pressable>

        {open ? <PriceBreakdown booking={booking} /> : null}
      </View>
    </View>
  );
}

function RowIcon({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={styles.icon}>
      <Ionicons name={name} size={18} color={colors.primaryDark} />
    </View>
  );
}

/**
 * Every line carries its own working, matching the review step — a bare
 * "+EGP 120" gives the mother nothing to check.
 */
function PriceBreakdown({ booking }: { booking: BookingResponse }) {
  const hours = formatDurationHours(booking.durationHours);
  // The backend folds redeemed Care Points into discountAmount alongside the
  // promo, so split them back out to show each as its own line.
  const carePoints = booking.rewardCreditAmount;
  const promo =
    Math.round((booking.discountAmount - carePoints - booking.packageCreditAmount) * 100) / 100;
  const longerBooking = booking.effectiveHourlyRate * booking.durationHours - booking.subtotal;

  return (
    <View style={styles.breakdown}>
      <Line
        label="Base rate"
        math={`${formatHourlyRate(booking.baseRate)} × ${hours}`}
        value={formatMoney(booking.baseRate * booking.durationHours)}
      />
      {booking.extraChildren > 0 ? (
        <Line
          label={`+ ${booking.extraChildren} extra child${booking.extraChildren === 1 ? '' : 'ren'}`}
          math={`${formatHourlyRate(booking.extraChildFeePerHour)} × ${hours}`}
          value={formatMoney(booking.extraChildFeePerHour * booking.durationHours)}
        />
      ) : null}
      {booking.skillAddOns.map((addon) => (
        <Line
          key={addon.id}
          label={`+ ${addon.name}`}
          math={`${formatHourlyRate(addon.amountPerHour)} × ${hours}`}
          value={formatMoney(addon.amountPerHour * booking.durationHours)}
        />
      ))}
      {longerBooking > 0.005 ? (
        <Line label="Longer-booking discount" value={`–${formatMoney(longerBooking)}`} />
      ) : null}
      {carePoints > 0.005 ? (
        <Line
          label={`Care Points · ${booking.rewardCreditHoursApplied}h`}
          value={`–${formatMoney(carePoints)}`}
        />
      ) : null}
      {booking.packageHoursApplied > 0 ? (
        <Line
          label={`Package hours · ${booking.packageHoursApplied}h${
            booking.packageSkillsCovered > 0 ? ` + ${booking.packageSkillsCovered} free skills` : ''
          }`}
          value={`–${formatMoney(booking.packageCreditAmount)}`}
        />
      ) : null}
      {promo > 0.005 ? <Line label="Promo discount" value={`–${formatMoney(promo)}`} /> : null}
      <View style={styles.totalRow}>
        <Text style={styles.total}>Total</Text>
        <Text style={styles.total}>{formatMoney(booking.totalAmount)}</Text>
      </View>
      {booking.payment ? (
        <Line label="Charged" value={formatMoney(booking.payment.amount)} />
      ) : null}
    </View>
  );
}

function Line({ label, math, value }: { label: string; math?: string; value: string }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineLabel}>
        <Text style={styles.lineText}>{label}</Text>
        {math ? <Text style={styles.math}>{math}</Text> : null}
      </View>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const ICON = 36;

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  heading: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.warmSubtle,
    overflow: 'hidden',
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.warmSubtle,
  },
  icon: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  sub: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  paymentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
  },
  mapsText: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },
  breakdown: {
    // Aligned under the row text, past the icon column.
    paddingLeft: spacing.lg + ICON + spacing.md,
    paddingRight: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  lineLabel: {
    flex: 1,
    gap: spacing.xxs,
  },
  lineText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  math: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  lineValue: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.warmSubtle,
  },
  total: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
});
