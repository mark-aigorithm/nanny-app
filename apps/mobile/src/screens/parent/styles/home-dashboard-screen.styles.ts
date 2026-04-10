import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
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
    backgroundColor: colors.background,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  greeting: {
    ...typeScale.headingLg,
    color: colors.textDark,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bellBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.md,
    paddingBottom: BOTTOM_NAV_HEIGHT + spacing['3xl'],
    gap: spacing['2xl'],
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.xl,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchPlaceholder: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
  },
  searchPills: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
  },
  pillText: {
    ...typeScale.captionBold,
    fontFamily: fontFamily.semiBold,
    color: colors.textDark,
  },

  // Promo carousel
  promoList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  promoCard: {
    width: 280,
    height: 160,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    ...shadows.sm,
  },
  promoImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  promoGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  promoContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  promoTitle: {
    ...typeScale.headingMd,
    letterSpacing: 0,
    color: colors.white,
  },
  promoSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  promoCta: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  promoCtaText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.textDark,
    letterSpacing: 0.5,
  },

  // Quick actions
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  quickCard: {
    width: '47%',
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 14,
    gap: 10,
    ...shadows.sm,
  },
  quickIconBg: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    ...typeScale.labelMd,
    color: colors.textDark,
    flexShrink: 1,
  },

  // Sections
  section: {
    gap: 14,
  },
  sectionTitle: {
    ...typeScale.headingMd,
    letterSpacing: 0,
    color: colors.textDark,
    paddingHorizontal: spacing.xl,
  },

  // Recommended nanny cards
  nannyList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  nannyCard: {
    width: 150,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  nannyImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.surfaceMuted,
  },
  nannyInfo: {
    padding: 10,
    gap: spacing.xxs,
  },
  nannyName: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
  },
  nannyRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  nannyRating: {
    ...typeScale.captionBold,
    fontFamily: fontFamily.semiBold,
    color: colors.textDark,
  },
  nannyPrice: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },

  // Favourites
  favouritesList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  favouriteItem: {
    alignItems: 'center',
    gap: 6,
  },
  addFavourite: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(151,165,145,0.08)',
  },
  favouriteName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textMuted,
  },

  // Community preview
  communityCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  communityImage: {
    width: '100%',
    height: 140,
    backgroundColor: colors.surfaceMuted,
  },
  communityBody: {
    padding: spacing.lg,
    gap: 6,
  },
  communityTitle: {
    ...typeScale.headingSm,
    letterSpacing: 0,
    color: colors.textDark,
  },
  communitySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  communityLink: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  communityLinkText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primary,
  },
});
