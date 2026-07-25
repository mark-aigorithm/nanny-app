import { StyleSheet } from 'react-native';

import { borderRadius, colors, fontFamily, screenPadding, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },

  // ── Balance summary card ──────────────────────────────────────────────
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  balanceIcon: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceTextWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  balanceValue: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  balanceSubtext: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // ── Section intro ─────────────────────────────────────────────────────
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  sectionHint: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    marginTop: -spacing.xs,
  },

  center: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
  errorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  emptyTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  emptyBody: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // ── Package card ──────────────────────────────────────────────────────
  packageCard: {
    gap: spacing.lg,
  },
  packageCardFeatured: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  featuredBadge: {
    position: 'absolute',
    top: -spacing.md,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  featuredBadgeText: {
    ...typeScale.caption,
    fontFamily: fontFamily.bold,
    color: colors.white,
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
    ...typeScale.headingSm,
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

  // Value: the per-hour rate the decision turns on
  rateBlock: {
    gap: spacing.xxs,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rateValue: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
  },
  rateUnit: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
  },
  rateCompare: {
    ...typeScale.caption,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  savingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successLight,
  },
  savingPillText: {
    ...typeScale.captionBold,
    color: colors.successText,
  },

  packageMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupeLight,
  },
  metaChipText: {
    ...typeScale.caption,
    color: colors.textTertiary,
  },

  // Total + CTA footer, split by a hairline
  cardDivider: {
    height: 1,
    backgroundColor: colors.warmBorder,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  totalValue: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  disabledReason: {
    ...typeScale.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },

  // ── "How packages work" explainer ────────────────────────────────────
  infoCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.warmSubtle,
  },
  infoTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoRowText: {
    flex: 1,
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
});
