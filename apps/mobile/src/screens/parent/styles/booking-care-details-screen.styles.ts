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

  // Children
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  countBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  countTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  countSub: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },

  // One row per child: name + age.
  childCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  childHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  childIndex: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childIndexText: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },
  childNameInput: {
    flex: 1,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.full,
    height: 40,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
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
  ageLabel: {
    ...typeScale.labelSm,
    color: colors.textSecondary,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },

  // Save-for-next-time toggle
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  saveBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  saveTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  saveSub: {
    ...typeScale.caption,
    color: colors.textMuted,
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
