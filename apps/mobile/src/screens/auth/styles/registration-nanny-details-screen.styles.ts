import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  STATUS_BAR_HEIGHT,
  borderRadius,
  shadows,
} from '@mobile/theme';

const HEADER_CONTENT_HEIGHT = 56;

export const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header bar
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: spacing.lg,
    height: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    ...typeScale.headingMd,
    color: colors.primary,
    letterSpacing: -0.5,
  },

  // Mini progress (right side of header)
  miniProgressTrack: {
    width: 96,
    height: 6,
    backgroundColor: colors.taupe,
    borderRadius: 3,
  },
  miniProgressFill: {
    width: '100%',
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  // Full-width progress bar below header
  progressBarTrack: {
    position: 'absolute',
    top: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    left: 0,
    right: 0,
    zIndex: 100,
    height: 6,
    backgroundColor: colors.taupe,
  },
  progressBarFill: {
    width: '100%',
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT + 6 + screenPadding,
    paddingHorizontal: screenPadding,
    paddingBottom: 120,
    gap: screenPadding,
  },

  // Step label
  stepLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },

  // Section title (big headline)
  sectionTitle: {
    fontFamily: fontFamily.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // Form sections
  sectionBlock: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...typeScale.captionBold,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
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

  // Generic tag chips — age ranges, certifications, skills
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  chipTextSelected: {
    color: colors.white,
  },
  emptyHint: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },

  // Availability type — equal-width chip row
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

  // Inline form-level error
  errorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },

  // Footer
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : screenPadding,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.taupe,
  },
});
