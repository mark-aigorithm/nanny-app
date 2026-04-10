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
    ...typeScale.headingMd,
    fontFamily: fontFamily.extraBold,
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
  dotActive: {
    width: 10,
    height: 10,
    backgroundColor: colors.primary,
  },
  dotCompleted: {
    width: 10,
    height: 10,
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: colors.taupe,
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

  // Cards
  savedCardsSection: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  cardRowSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  cardIcon: {
    width: 40,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.taupeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  cardLabel: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  cardExpiry: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  defaultBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  defaultBadgeText: {
    ...typeScale.captionBold,
    color: colors.successDark,
    fontSize: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.taupe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },

  // Digital wallets
  digitalWalletRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  walletButton: {
    flex: 1,
    height: 56,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.taupe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletButtonText: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },

  // Add new card
  addCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addCardText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // New card form
  newCardForm: {
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.sm,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  formFieldHalf: {
    flex: 1,
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
  proceedBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius['2xl'],
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedBtnText: {
    ...typeScale.labelLg,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
