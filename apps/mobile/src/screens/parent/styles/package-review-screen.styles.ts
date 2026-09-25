import { StyleSheet } from 'react-native';

import { borderRadius, colors, screenPadding, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: screenPadding,
  },
  missingText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...typeScale.bodySm,
    color: colors.error,
    textAlign: 'center',
  },

  // ── Unfinished checkout for another package ──────────────────────────
  blockingCard: {
    gap: spacing.md,
    backgroundColor: colors.warmSubtle,
  },
  blockingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockingTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    flex: 1,
  },
  blockingBody: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // ── Package details ──────────────────────────────────────────────────
  packageCard: {
    gap: spacing.md,
  },
  packageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  packageHeaderText: {
    flex: 1,
    gap: spacing.xxs,
  },
  packageName: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  packageDescription: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  hoursBadge: {
    minWidth: 62,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
  },
  hoursBadgeValue: {
    ...typeScale.headingLg,
    color: colors.primaryDark,
  },
  hoursBadgeUnit: {
    ...typeScale.caption,
    color: colors.textTertiary,
  },
  rateValue: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
  },
  rateUnit: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.warmBorder,
  },
  sectionLabel: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  includedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  includedText: {
    flex: 1,
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // ── Order summary ────────────────────────────────────────────────────
  summaryCard: {
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    flex: 1,
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typeScale.bodyMd,
    color: colors.textPrimary,
  },
  summaryValueMuted: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  summaryValueSaving: {
    ...typeScale.captionBold,
    color: colors.successText,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalLabel: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  totalValue: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  noteText: {
    flex: 1,
    ...typeScale.caption,
    color: colors.textMuted,
  },
});
