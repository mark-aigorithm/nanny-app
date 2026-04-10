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
  BOTTOM_NAV_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: STATUS_BAR_HEIGHT,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },

  // Scroll area
  scrollView: {
    flex: 1,
    marginTop: HEADER_HEIGHT,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: BOTTOM_NAV_HEIGHT + screenPadding,
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    marginBottom: screenPadding,
    ...shadows.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  tabText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  tabTextActive: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },

  // Section
  section: {
    gap: spacing.lg,
  },
  sectionTitle: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: spacing.md,
  },
  emptyStateText: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    color: colors.textMuted,
  },

  // Upcoming Booking Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(196,200,191,0.1)',
    shadowColor: colors.textMuted,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },

  // Nanny Row (shared)
  nannyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  nannyPhotoWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginRight: spacing.md,
  },
  nannyPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  nannyInfo: {
    flex: 1,
  },
  nannyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nannyName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  ratingText: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Status Badges
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  statusBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.successDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Detail Rows
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 6,
  },
  detailText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },

  // Card Divider
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(196,200,191,0.15)',
    marginVertical: spacing.lg,
  },

  // Card Actions
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewDetailsText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
  cancelText: {
    ...typeScale.labelMd,
    color: colors.error,
  },
  messageButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  messageButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },

  // Past Booking Card
  pastCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    opacity: 0.9,
  },
  bookedTimesText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  completedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.taupe,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  completedBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Past Card Actions
  pastCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leaveReviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leaveReviewText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
  bookAgainButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bookAgainButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
});
