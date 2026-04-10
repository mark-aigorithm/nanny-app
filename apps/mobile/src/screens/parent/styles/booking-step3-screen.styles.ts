import { StyleSheet, Platform } from 'react-native';
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
    ...typeScale.headingMd,
    fontFamily: fontFamily.extraBold,
    letterSpacing: -0.45,
    color: colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing['3xl'],
    paddingHorizontal: screenPadding,
    paddingBottom: 120,
    gap: spacing['2xl'],
  },

  // Progress
  progressSection: {
    gap: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    borderRadius: borderRadius.full,
  },
  dotCompleted: {
    width: 10,
    height: 10,
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
  dotActive: {
    width: 10,
    height: 10,
    backgroundColor: colors.primary,
  },
  stepLabel: {
    ...typeScale.bodySm,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  heading: {
    ...typeScale.headingLg,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },

  // Nanny card
  nannyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nannyPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.neutralLight,
  },
  nannyInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  nannyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nannyName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  nannyDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nannyDateText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // Price card
  priceCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  priceValue: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
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
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  totalValue: {
    ...typeScale.headingLg,
    color: colors.primary,
  },

  // Payment method
  paymentMethodCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  paymentIconCircle: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentLabel: {
    flex: 1,
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  changeText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Special instructions
  instructionsSection: {
    gap: spacing.sm,
  },
  instructionsLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  instructionsInput: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    height: 100,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },

  // Guarantee
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

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.8)',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing['2xl'],
  },
  confirmBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius['2xl'],
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  confirmBtnText: {
    ...typeScale.labelLg,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
