import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  screenPadding,
  STATUS_BAR_HEIGHT,
  HEADER_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: HEADER_HEIGHT,
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textDark,
    letterSpacing: -0.5,
  },
  // Shrinks so "Mark all read" wraps instead of pushing past the edge on narrow phones.
  markAllReadButton: {
    flexShrink: 1,
    marginLeft: spacing.sm,
  },
  markAllRead: {
    ...typeScale.labelMd,
    color: colors.primary,
    textAlign: 'right',
  },
  headerSpacer: {
    width: 72,
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
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
