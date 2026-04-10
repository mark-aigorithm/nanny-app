import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  STATUS_BAR_HEIGHT,
  BOTTOM_NAV_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    backgroundColor: colors.background,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textDark,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    gap: 6,
  },
  onlineDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: spacing.xs,
    backgroundColor: colors.success,
  },
  onlineText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textTertiary,
  },
  headerIcon: {
    padding: spacing.xs,
  },

  // Filter pills
  filterRow: {
    paddingHorizontal: screenPadding,
    gap: spacing.sm,
  },
  filterPill: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
  },
  filterPillInactive: {
    backgroundColor: colors.taupe,
  },
  filterPillText: {
    ...typeScale.labelSm,
  },
  filterPillTextActive: {
    color: colors.white,
  },
  filterPillTextInactive: {
    color: colors.textTertiary,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: BOTTOM_NAV_HEIGHT + spacing['2xl'],
    gap: spacing.lg,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: spacing.md,
  },
  eventCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.successLight,
  },

  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.warmBorder,
  },
  authorInfo: {
    flex: 1,
    gap: 1,
  },
  authorName: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
    lineHeight: 18,
  },
  authorTime: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  tagPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagPillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },

  // Post body (advice)
  postBody: {
    ...typeScale.bodyMd,
    color: colors.textDark,
  },
  readMore: {
    ...typeScale.labelSm,
    color: colors.primary,
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: spacing.md,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCount: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },

  // Marketplace post
  marketplaceImageContainer: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  marketplaceImage: {
    width: '100%',
    height: 161,
  },
  priceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.goldWarm,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
  },
  priceBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },
  marketplaceTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textDark,
    lineHeight: 20,
  },

  // Event post
  eventTitle: {
    ...typeScale.headingMd,
    color: colors.textDark,
    lineHeight: 24,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventDetailText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    lineHeight: 18,
  },
  attendeesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.xs,
  },
  stackedAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeAvatar: {
    width: 32,
    height: 32,
    borderRadius: spacing.lg,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.warmBorder,
  },
  attendeeCount: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  rsvpButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  rsvpButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
    letterSpacing: 0.5,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: screenPadding,
    bottom: BOTTOM_NAV_HEIGHT + spacing['2xl'],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 5,
  },
});
