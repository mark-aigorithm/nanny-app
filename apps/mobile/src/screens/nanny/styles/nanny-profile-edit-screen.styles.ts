import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  HEADER_HEIGHT,
  BOTTOM_NAV_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loadingCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.lg,
    paddingHorizontal: screenPadding,
    paddingBottom: BOTTOM_NAV_HEIGHT + spacing.lg,
    gap: spacing['2xl'],
  },

  // Photo section
  photoSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  photoWrapper: {
    width: 96,
    height: 96,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: colors.surface,
  },

  // Form sections
  formSection: {
    gap: spacing.xl,
  },
  sectionLabel: {
    ...typeScale.captionBold,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  // Certifications
  certsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  certChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warmBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  certChipText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },

  // Working hours
  scheduleCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  dayDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  dayLabel: {
    width: 36,
    ...typeScale.labelMd,
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
  // Save button
  saveButton: {
    height: 56,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  saveButtonText: {
    ...typeScale.labelLg,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },

  // ─── Read-only view mode ───────────────────────────────────────────────────
  viewName: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  viewLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  viewLocationText: {
    ...typeScale.bodyMd,
    color: colors.textTertiary,
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    marginTop: spacing.xs,
    ...shadows.sm,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  statValue: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  statLabel: {
    ...typeScale.caption,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  viewBio: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  viewHoursText: {
    flex: 1,
    ...typeScale.labelSm,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  viewHoursOff: {
    color: colors.textMuted,
  },
});
