import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { IconCircle, Stepper } from '@mobile/components/ui';
import type { BookingCreditsPlan } from '@mobile/lib/bookingCredits';
import { formatMoney } from '@mobile/lib/formatMoney';
import { formatDurationHours } from '@mobile/lib/formatTime';
import { colors, borderRadius, shadows, spacing, typeScale } from '@mobile/theme';

interface Props {
  plan: BookingCreditsPlan;
  /** What is owed after the promo, before any credit — the bar's full width. */
  totalBeforeCredits: number;
  pointsBalance: number;
  /** The stepper's raw value; the plan's `hoursApplied` is what actually counts. */
  pointsHours: number;
  onPointsChange: (next: number) => void;
}

function hoursLabel(hours: number): string {
  return `${hours} free hour${hours === 1 ? '' : 's'}`;
}

/**
 * "Paying with" — how the booking will be paid for, in the order the server
 * applies it: the prepaid package first (automatic, never optional), then Care
 * Points for whatever the package leaves owed, then the card for the rest.
 *
 * Renders nothing when she holds neither a usable package nor enough points to
 * redeem, so a pay-as-you-go parent sees no dead UI.
 */
export function PayingWithCard({
  plan,
  totalBeforeCredits,
  pointsBalance,
  pointsHours,
  onPointsChange,
}: Props) {
  const { package: pkg, points } = plan;
  const showPoints = points.status === 'available' || (points.status === 'not-needed' && pkg !== null && pointsBalance > 0);
  if (!pkg && !showPoints) return null;

  const packageShare = totalBeforeCredits > 0 && pkg ? pkg.creditAmount / totalBeforeCredits : 0;
  const pointsShare = totalBeforeCredits > 0 ? points.saving / totalBeforeCredits : 0;
  const coveredInFull = plan.netTotal <= 0;

  const held = [pkg ? 'Package hours' : null, points.hoursApplied > 0 ? 'Care Points' : null]
    .filter(Boolean)
    .join(' and ');
  const footnote = held
    ? `${held} are held when you send the request, and returned if you cancel before a nanny accepts.`
    : null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Paying with</Text>

      <View style={styles.card}>
        {pkg && (
          <View style={styles.row} testID="booking.package">
            <IconCircle icon="time-outline" iconColor={colors.primaryDark} />
            <View style={styles.rowBody}>
              <View style={styles.rowTitleLine}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {pkg.packageName}
                </Text>
                <View style={styles.firstPill}>
                  <Text style={styles.firstPillText}>Used first</Text>
                </View>
              </View>
              <Text style={styles.rowSub}>
                {formatDurationHours(pkg.hoursApplied)} of your {formatDurationHours(pkg.availableHours)}
                {' · '}
                {pkg.hoursLeftAfter > 0
                  ? `${formatDurationHours(pkg.hoursLeftAfter)} left after this`
                  : 'uses the last of your package'}
              </Text>
            </View>
            <Text style={styles.rowAmount}>−{formatMoney(pkg.creditAmount)}</Text>
          </View>
        )}

        {pkg && showPoints && <View style={styles.divider} />}

        {showPoints && (
          <View style={styles.pointsBlock} testID="booking.carePoints">
            <View style={styles.row}>
              <IconCircle icon="gift-outline" backgroundColor={colors.warmSubtle} iconColor={colors.goldWarm} />
              <View style={styles.rowBody}>
                <View style={styles.rowTitleLine}>
                  <Text style={styles.rowTitle}>Care Points</Text>
                  <Text style={styles.pointsBalance}>{pointsBalance} pts</Text>
                </View>
                <Text style={styles.rowSub}>
                  {points.status === 'not-needed'
                    ? 'Not needed — your package covers this booking. Your points stay in your wallet.'
                    : pkg
                      ? `Cover what your package doesn’t — ${points.perHour} pts per hour, up to ${points.maxHours}.`
                      : `Swap ${points.perHour} points for a free hour — up to ${points.maxHours} on this booking.`}
                </Text>
              </View>
            </View>

            {points.status === 'available' && (
              <View style={styles.stepperRow}>
                <Stepper
                  testID="booking.points"
                  value={Math.min(pointsHours, points.maxHours)}
                  onChange={onPointsChange}
                  min={0}
                  max={points.maxHours}
                  suffix="h free"
                  size="sm"
                />
                <Text style={points.hoursApplied > 0 ? styles.rowAmount : styles.noneUsed}>
                  {points.hoursApplied > 0 ? `−${formatMoney(points.saving)}` : 'None used'}
                </Text>
              </View>
            )}
          </View>
        )}

        {(pkg || points.hoursApplied > 0) && (
          <View style={styles.coverage}>
            <View
              style={styles.track}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={
                coveredInFull ? 'Fully covered' : `${formatMoney(plan.netTotal)} left to pay`
              }
            >
              {packageShare > 0 && <View style={[styles.fill, styles.fillPackage, { flex: packageShare }]} />}
              {pointsShare > 0 && <View style={[styles.fill, styles.fillPoints, { flex: pointsShare }]} />}
              {!coveredInFull && <View style={{ flex: Math.max(0, 1 - packageShare - pointsShare) }} />}
            </View>
            <View style={styles.legend}>
              {pkg && (
                <View style={styles.legendItem}>
                  <View style={[styles.dot, styles.fillPackage]} />
                  <Text style={styles.legendText}>Package {formatDurationHours(pkg.hoursApplied)}</Text>
                </View>
              )}
              {points.hoursApplied > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.dot, styles.fillPoints]} />
                  <Text style={styles.legendText}>{hoursLabel(points.hoursApplied)}</Text>
                </View>
              )}
              <Text style={[styles.legendText, styles.legendRest]}>
                {coveredInFull ? 'Fully covered' : `${formatMoney(plan.netTotal)} to pay`}
              </Text>
            </View>
          </View>
        )}
      </View>

      {footnote && <Text style={styles.footnote}>{footnote}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  title: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rowSub: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  rowAmount: {
    ...typeScale.labelMd,
    color: colors.successDark,
  },
  noneUsed: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  firstPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
  },
  firstPillText: {
    ...typeScale.caption,
    color: colors.primaryDark,
  },
  pointsBlock: {
    gap: spacing.md,
  },
  pointsBalance: {
    ...typeScale.labelSm,
    color: colors.goldWarm,
    marginLeft: 'auto',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.taupeLight,
  },
  coverage: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  track: {
    flexDirection: 'row',
    height: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupeLight,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  fillPackage: {
    backgroundColor: colors.primary,
  },
  fillPoints: {
    backgroundColor: colors.goldWarm,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xxs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: borderRadius.full,
  },
  legendText: {
    ...typeScale.caption,
    color: colors.textSecondary,
  },
  legendRest: {
    marginLeft: 'auto',
    color: colors.textPrimary,
  },
  footnote: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
});
