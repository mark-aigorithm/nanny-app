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

  // Header — matches the review step so the two read as one flow.
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

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingHorizontal: screenPadding,
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
    backgroundColor: colors.primaryAction,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  missingParamsBtnText: {
    ...typeScale.labelMd,
    color: colors.white,
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

  // Children — one card per saved child, ticked to include.
  childrenState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  childrenErrorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
  childrenEmpty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  childrenEmptyTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  childrenEmptySub: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.transparent,
    ...shadows.sm,
  },
  childCardSelected: {
    borderColor: colors.primaryDark,
  },
  childCardDisabled: {
    opacity: 0.5,
  },
  childPickRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    minHeight: 64,
  },
  childBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  childName: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  childMeta: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  childHealth: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  childHealthText: {
    ...typeScale.caption,
    color: colors.error,
    flexShrink: 1,
  },
  /** Marks the extra children — the ones carrying the surcharge. */
  childBadge: {
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  childBadgeText: {
    ...typeScale.caption,
    color: colors.primaryDark,
  },
  // 44dp tap target, per the UI sweep rules.
  childEditBtn: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childEditText: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },

  // Add-ons
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  // Live rate readout
  rateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryMuted,
  },
  rateBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  rateTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  rateLine: {
    ...typeScale.caption,
    color: colors.textSecondary,
  },
  rateValue: {
    ...typeScale.headingSm,
    color: colors.primaryDark,
  },
});
