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
    // Clears the summary bar, which is taller than a plain button and grows
    // again when the longer-booking nudge appears.
    paddingBottom: 220,
    gap: spacing['2xl'],
  },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupeLight,
  },
  advanceNotice: {
    ...typeScale.caption,
    color: colors.textTertiary,
  },

  // Sections
  section: {
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
  },
  viewToggleText: {
    ...typeScale.caption,
    fontFamily: fontFamily.semiBold,
    color: colors.primaryDark,
  },

  // Date rail
  railContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
    paddingRight: spacing.lg,
  },
  railCard: {
    width: 62,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.warmBorder,
    alignItems: 'center',
    gap: spacing.xxs,
    ...shadows.sm,
  },
  railCardSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  railWeekday: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  railDay: {
    ...typeScale.headingMd,
    letterSpacing: 0,
    color: colors.textPrimary,
  },
  railMonth: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  railTextSelected: {
    color: colors.white,
  },

  // Month grid
  gridBlock: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarMonth: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  calendarNavButton: {
    width: 36,
    height: 36,
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
    width: 36,
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
    paddingVertical: spacing.xs,
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

  // Start time — same card vocabulary as Duration below it
  slotsPlaceholder: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
  quickScrollRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },

  // Duration
  durationCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    gap: spacing.lg,
    ...shadows.sm,
  },
  durationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  durationReadout: {
    gap: spacing.xxs,
  },
  durationValue: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
  },
  durationCaption: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  durationChip: {
    minWidth: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupeLight,
    alignItems: 'center',
  },
  durationChipSelected: {
    backgroundColor: colors.primaryDark,
  },
  durationChipDisabled: {
    opacity: 0.4,
  },
  durationChipText: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  durationChipTextSelected: {
    color: colors.white,
  },
  durationHint: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  availabilityError: {
    ...typeScale.bodySm,
    color: colors.error,
    marginTop: spacing.sm,
  },

  // Longer-booking nudge, rendered inside the summary bar
  dealBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.successLight,
  },
  dealText: {
    ...typeScale.caption,
    color: colors.successText,
    flex: 1,
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
});
