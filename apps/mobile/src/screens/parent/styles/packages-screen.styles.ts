import { StyleSheet } from 'react-native';

import { borderRadius, colors, fontFamily, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.md,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },

  // Prepaid balance summary card
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hoursTextWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  hoursText: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  hoursSubtext: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  sectionHint: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    marginTop: -spacing.sm,
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

  // Package card
  packageCard: {
    gap: spacing.md,
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
    alignItems: 'flex-start',
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
  packageHoursBadge: {
    minWidth: 60,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
  },
  packageHoursValue: {
    ...typeScale.headingLg,
    color: colors.primaryDark,
  },
  packageHoursUnit: {
    ...typeScale.caption,
    color: colors.textTertiary,
  },

  // Per-hour rate — the number the decision actually turns on
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rateValue: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
  },
  rateUnit: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
  },
  savingPill: {
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
  disabledReason: {
    ...typeScale.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
});
