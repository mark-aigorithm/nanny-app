import { StyleSheet, Platform, Dimensions } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 397;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },

  // Hero
  heroSection: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },

  // Top navigation
  topNav: {
    position: 'absolute',
    top: STATUS_BAR_HEIGHT + spacing.sm,
    left: screenPadding,
    right: screenPadding,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  topNavBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  topNavRight: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  // Summary card
  summaryCard: {
    marginTop: -48,
    marginHorizontal: screenPadding,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: screenPadding,
    gap: spacing.lg,
    ...shadows.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  nannyName: {
    ...typeScale.headingLg,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  hourlyRate: {
    ...typeScale.headingMd,
    lineHeight: 28,
    color: colors.primaryDark,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textTertiary,
    marginLeft: spacing.xs,
  },
  ratingDot: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textTertiary,
  },
  ratingMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textTertiary,
  },
  statsPillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statsPill: {
    backgroundColor: colors.warmBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  statsPillText: {
    ...typeScale.captionBold,
    lineHeight: 16,
    fontFamily: fontFamily.semiBold,
    color: colors.textTertiary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
  },
  actionBtnText: {
    ...typeScale.labelMd,
    lineHeight: 20,
    color: colors.primaryDark,
  },

  // About
  sectionContainer: {
    paddingHorizontal: screenPadding,
    marginTop: 28,
  },
  sectionHeading: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.7,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  aboutText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 26,
    color: colors.textSecondary,
  },
  readMore: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primaryDark,
    marginTop: spacing.sm,
  },

  // Certifications
  certsScroll: {
    marginHorizontal: -screenPadding,
  },
  certsContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.sm,
  },
  certPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warmBorder,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  certPillText: {
    ...typeScale.captionBold,
    lineHeight: 16,
    color: colors.textTertiary,
  },

  // Trust bar
  trustBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(235,221,210,0.6)',
    borderRadius: borderRadius.xl,
    marginHorizontal: screenPadding,
    marginTop: 28,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  trustAvatars: {
    width: 72,
    height: 32,
    marginRight: spacing.md,
  },
  trustAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.white,
    position: 'absolute',
    top: 0,
    backgroundColor: colors.warmBorder,
  },
  trustAvatar1: {
    left: 0,
    zIndex: 3,
  },
  trustAvatar2: {
    left: 20,
    zIndex: 2,
  },
  trustAvatar3: {
    left: 40,
    zIndex: 1,
  },
  trustText: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
  },

  // Reviews
  reviewsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  viewAllLink: {
    ...typeScale.labelMd,
    lineHeight: 20,
    color: colors.primaryDark,
  },
  reviewsList: {
    gap: spacing.lg,
  },
  reviewCard: {
    gap: spacing.md,
  },
  reviewAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reviewAuthorInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  reviewAuthorName: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  reviewTimeAgo: {
    ...typeScale.caption,
    lineHeight: 16,
    color: colors.textTertiary,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  reviewText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // Sticky footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.95)',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : screenPadding,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  bookButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius['2xl'],
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  bookButtonText: {
    ...typeScale.headingMd,
    lineHeight: 24,
    color: colors.white,
  },
});
