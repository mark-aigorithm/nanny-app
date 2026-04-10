import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 64;

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
    paddingTop: spacing['3xl'],
    paddingHorizontal: screenPadding,
    paddingBottom: 120,
    gap: screenPadding,
  },

  // Progress & Title
  progressSection: {
    gap: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dot: {
    borderRadius: borderRadius.full,
  },
  dotActive: {
    width: 10,
    height: 10,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: colors.taupe,
  },
  stepLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  heading: {
    ...typeScale.headingLg,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },

  // Nanny Card
  nannyCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nannyPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceMuted,
  },
  nannyInfo: {
    flex: 1,
    gap: 6,
  },
  nannyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nannyName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  nannyRating: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.goldWarm,
  },
  nannyDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nannyDateText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Promo Section
  promoSection: {
    gap: spacing.md,
  },
  promoInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    height: 44,
    paddingHorizontal: spacing.lg,
  },
  promoInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    height: 44,
  },
  promoApplyText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
  promoApplyTextDisabled: {
    opacity: 0.5,
  },
  promoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  promoChipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.successDark,
  },

  // Price Card
  priceCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    borderRadius: borderRadius.xl,
    padding: 21,
    gap: 14,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  priceValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  promoLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.success,
  },
  promoValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.success,
  },
  priceDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.taupeLight,
  },
  totalLabel: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  totalValue: {
    ...typeScale.headingLg,
    color: colors.primary,
  },

  // Guarantee Card
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
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textTertiary,
  },

  // Sticky Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.8)',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : screenPadding,
  },
  proceedBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius['2xl'],
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.white,
  },
});
