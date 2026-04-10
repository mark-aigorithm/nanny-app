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
  HEADER_HEIGHT,
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
    paddingBottom: 120,
    gap: spacing['3xl'],
  },

  // Calendar
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarMonth: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  calendarNavButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.lg,
  },
  weekdayLabel: {
    ...typeScale.captionBold,
    color: colors.textMuted,
    width: 40,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dayText: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    width: 36,
    height: 36,
    textAlign: 'center',
    lineHeight: 36,
  },
  dayTextDisabled: {
    color: colors.textPlaceholder,
  },
  dayTextSelected: {
    color: colors.white,
  },
  daySelected: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.full,
  },

  // Time slots
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  timeSlotSection: {
    gap: spacing.md,
  },
  timePeriodLabel: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  timeSlotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timeSlot: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.taupeLight,
  },
  timeSlotSelected: {
    backgroundColor: colors.primary,
  },
  timeSlotDisabled: {
    opacity: 0.4,
  },
  timeSlotText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  timeSlotTextSelected: {
    color: colors.white,
  },

  // Duration
  durationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  durationChip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
  },
  durationChipSelected: {
    backgroundColor: colors.primaryDark,
  },
  durationChipText: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  durationChipTextSelected: {
    color: colors.white,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing['2xl'],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  continueButton: {
    height: 56,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  continueButtonDisabled: {
    backgroundColor: colors.taupe,
    ...{ shadowOpacity: 0 },
  },
  continueButtonText: {
    ...typeScale.labelLg,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
