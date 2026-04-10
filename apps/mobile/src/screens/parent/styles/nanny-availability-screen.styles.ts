import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  BOTTOM_NAV_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  headerSafeArea: {
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  headerTitle: {
    ...typeScale.headingMd,
    color: colors.textDark,
    flex: 1,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingBottom: BOTTOM_NAV_HEIGHT + spacing['3xl'],
    gap: spacing.xl,
  },

  // Week selector
  weekSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  weekArrowButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  weekLabel: {
    ...typeScale.labelLg,
    color: colors.textDark,
  },

  // Grid
  gridContainer: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  gridHeaderDayCell: {
    flex: 2,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
  },
  gridHeaderDayText: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  gridHeaderSlotCell: {
    flex: 3,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  gridHeaderSlotText: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Day rows
  dayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    minHeight: 56,
    alignItems: 'center',
  },
  dayRowLast: {
    borderBottomWidth: 0,
  },
  dayLabelCell: {
    flex: 2,
    paddingLeft: spacing.lg,
  },
  dayLabel: {
    ...typeScale.labelMd,
    color: colors.textDark,
  },
  slotCell: {
    flex: 3,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPill: {
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    width: '90%',
    alignItems: 'center',
  },
  slotAvailable: {
    backgroundColor: colors.successLight,
  },
  slotUnavailable: {
    backgroundColor: colors.surfaceMuted,
  },
  slotTimeText: {
    ...typeScale.caption,
    color: colors.textSecondary,
  },
  slotUnavailableText: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDotAvailable: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successLight,
  },
  legendDotUnavailable: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  legendText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },

  // Book button
  bookButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  bookButtonText: {
    ...typeScale.labelLg,
    color: colors.white,
  },
});
