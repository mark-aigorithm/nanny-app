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
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoText: {
    ...typeScale.labelSm,
    color: colors.primary,
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
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  input: {
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  textArea: {
    height: 120,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  rateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratePrefix: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  rateInput: {
    flex: 1,
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  rateUnit: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
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
  addCertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addCertText: {
    ...typeScale.labelSm,
    color: colors.primary,
  },

  // Age range
  ageChipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ageChip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
  },
  ageChipSelected: {
    backgroundColor: colors.primary,
  },
  ageChipText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  ageChipTextSelected: {
    color: colors.white,
  },

  // Availability type
  availabilityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  availabilityChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityChipSelected: {
    backgroundColor: colors.primary,
  },
  availabilityChipText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  availabilityChipTextSelected: {
    color: colors.white,
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
  timePills: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timePill: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  timePillText: {
    ...typeScale.labelSm,
    color: colors.textPrimary,
  },
  timeSeparator: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    paddingHorizontal: spacing.xxs,
  },
  dayOffLabel: {
    flex: 1,
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  copyButtonText: {
    ...typeScale.labelSm,
    color: colors.primary,
  },

  // Time picker modal (iOS)
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingBottom: spacing['3xl'],
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pickerTitle: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  pickerDone: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.primary,
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
