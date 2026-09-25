import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  shadows,
} from '@mobile/theme';
import { wizardBase } from './registration-wizard.styles';

export const styles = StyleSheet.create({
  ...wizardBase,

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

  // One working day whose end isn't after its start.
  dayErrorText: {
    ...typeScale.bodySm,
    color: colors.error,
    paddingBottom: spacing.sm,
  },
  // What's still missing, while Continue is disabled.
  footerHint: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
