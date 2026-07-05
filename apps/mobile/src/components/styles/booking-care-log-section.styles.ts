import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  filtersScroll: {
    marginHorizontal: -spacing.xl,
  },
  filtersContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillInactive: {
    backgroundColor: colors.taupe,
  },
  pillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  pillTextActive: {
    color: colors.white,
  },
  pillTextInactive: {
    color: colors.textTertiary,
  },
  emptyText: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
  },
  dayGroup: {
    gap: spacing.sm,
  },
  dayLabel: {
    ...typeScale.captionBold,
    letterSpacing: 0.6,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  entryList: {
    gap: spacing.sm,
  },
  entry: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  entryType: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
    flex: 1,
  },
  entryTime: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  entryNotes: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
});
