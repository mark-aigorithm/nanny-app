import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    backgroundColor: colors.background,
    paddingTop: STATUS_BAR_HEIGHT,
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    height: 64,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fontFamily.extraBold,
    fontSize: 18,
    letterSpacing: -0.45,
    color: colors.textPrimary,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingHorizontal: screenPadding,
    // Clears the sticky summary bar.
    paddingBottom: 200,
    gap: screenPadding,
  },

  // Missing-draft fallback
  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  missingParamsText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  missingParamsBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  missingParamsBtnText: {
    ...typeScale.labelMd,
    color: colors.white,
  },

  // When card
  whenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  whenIcon: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whenBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  whenDate: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  whenTime: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  whenEdit: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },

  // Generic section
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  sectionHint: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Promo code
  promoInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  promoInput: {
    flex: 1,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.full,
    height: 44,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  promoApplyBtn: {
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoApplyBtnDisabled: {
    backgroundColor: colors.taupe,
  },
  promoApplyText: {
    ...typeScale.labelMd,
    color: colors.white,
  },
  promoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  promoChipText: {
    ...typeScale.labelSm,
    color: colors.successDark,
  },
  promoErrorText: {
    ...typeScale.caption,
    color: colors.error,
  },

  // Care Points
  pointsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pointsBalance: {
    ...typeScale.labelSm,
    color: colors.goldWarm,
    marginLeft: 'auto',
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  pointsSaving: {
    ...typeScale.labelMd,
    color: colors.successDark,
  },
  pointsNote: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Prepaid hours
  prepaidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.successLight,
  },
  prepaidText: {
    ...typeScale.caption,
    color: colors.successText,
    flex: 1,
  },

  // Prepaid-package nudge
  packageNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
  },
  packageNudgeBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  packageNudgeTitle: {
    ...typeScale.labelSm,
    color: colors.textPrimary,
  },
  packageNudgeSub: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // "You're saving" tally — read-only, never a control
  savingsCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.successLight,
    gap: spacing.sm,
  },
  savingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  savingsTitle: {
    ...typeScale.labelMd,
    color: colors.successText,
    flex: 1,
  },
  savingsTotal: {
    ...typeScale.headingSm,
    color: colors.successDark,
  },
  savingsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  savingsLineLabel: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  savingsLineValue: {
    ...typeScale.labelSm,
    color: colors.successDark,
  },
  savingsFootnote: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Price breakdown
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  priceLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  priceValue: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  addOnRowLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    flex: 1,
  },
  addOnRowValue: {
    ...typeScale.labelMd,
    color: colors.bronze,
  },
  promoLabel: {
    ...typeScale.bodyMd,
    color: colors.success,
  },
  promoValue: {
    ...typeScale.labelMd,
    color: colors.success,
  },
  priceDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.taupeLight,
  },
  totalLabel: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  totalValue: {
    ...typeScale.headingSm,
    color: colors.primaryDark,
  },
  pendingCreditNote: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Submit failure, shown just above the sticky CTA
  submitErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.errorLight,
  },
  submitErrorText: {
    ...typeScale.caption,
    color: colors.error,
    flex: 1,
  },

  // Instructions
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  instructionsInput: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    minHeight: 100,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    marginTop: spacing.xs,
  },

  // Guarantee card
  guaranteeCard: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  guaranteeText: {
    flex: 1,
    ...typeScale.bodyMd,
    color: colors.textTertiary,
  },
});
