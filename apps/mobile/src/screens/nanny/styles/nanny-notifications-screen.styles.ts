import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
} from '@mobile/theme';

// Notifications is a pushed stack screen (reached from the header bell), not a
// tab — so it uses StackHeader and clears no bottom nav. Kept self-contained
// rather than borrowing the parent screen's file, whose layout assumes the
// parent floating pill bar.
export const styles = StyleSheet.create({
  loader: {
    marginTop: spacing.xl,
  },
  emptyText: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: screenPadding,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
    gap: spacing.md,
  },
  retryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    ...typeScale.labelMd,
    color: colors.white,
  },
  loadMoreButton: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
  },
  loadMoreText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Mark-all-read control (StackHeader rightElement)
  markAllRead: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing['2xl'],
  },

  // Filter pills
  pillsScroll: {
    paddingTop: spacing.lg,
  },
  pillsContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  pill: {
    height: 36,
    paddingHorizontal: screenPadding,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.primary,
    ...shadows.sm,
  },
  pillInactive: {
    backgroundColor: colors.taupe,
  },
  pillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  pillTextActive: {
    color: colors.white,
  },
  pillTextInactive: {
    color: colors.textTertiary,
  },

  // Section
  section: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  sectionHeading: {
    ...typeScale.headingMd,
    letterSpacing: 0,
    color: colors.textDark,
  },
  cardGroup: {
    gap: spacing.md,
  },

});
