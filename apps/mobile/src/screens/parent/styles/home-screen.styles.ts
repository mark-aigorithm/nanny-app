import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  PARENT_TAB_CONTENT_TOP,
  PARENT_TAB_SCROLL_BOTTOM,
} from '@mobile/theme';

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
    paddingTop: PARENT_TAB_CONTENT_TOP,
    paddingBottom: PARENT_TAB_SCROLL_BOTTOM,
    paddingHorizontal: screenPadding,
    gap: spacing['2xl'],
  },

  // Book care entry
  bookCareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  bookCareIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookCareTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  bookCareSubtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // Hero
  heroSection: {
    gap: spacing['2xl'],
  },
  heroTitle: {
    ...typeScale.displayMd,
    lineHeight: 35,
    color: colors.textPrimary,
  },
  heroImageWrap: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    height: 192,
    ...shadows.sm,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayLight,
  },

  // Filters
  filtersScroll: {
    marginHorizontal: -screenPadding,
  },
  filtersContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  chipActive: {
    backgroundColor: colors.primaryDark,
    ...shadows.sm,
  },
  chipInactive: {
    backgroundColor: 'rgba(235,221,210,0.5)',
  },
  chipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  chipTextActive: {
    color: colors.white,
  },
  chipTextInactive: {
    color: colors.textTertiary,
  },

  // Section
  section: {
    gap: spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typeScale.headingLg,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  viewAll: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
  },

  // Nanny card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
    elevation: 2,
  },
  cardPhotoWrap: {
    height: 280,
    backgroundColor: colors.surfaceMuted,
  },
  cardPhoto: {
    width: '100%',
    height: '100%',
  },
  verifiedBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  verifiedText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.white,
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardNameCol: {
    flex: 1,
    gap: spacing.xxs,
    marginRight: spacing.md,
  },
  cardName: {
    ...typeScale.headingMd,
    lineHeight: 28,
    letterSpacing: 0,
    color: colors.textPrimary,
  },
  cardMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textDark,
  },
  cardBio: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  priceAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 28,
    color: colors.primaryDark,
  },
  priceUnit: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  bookBtn: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: screenPadding,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  bookBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },

  // Editorial
  editorial: {
    backgroundColor: 'rgba(235,221,210,0.3)',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(196,200,191,0.1)',
    paddingHorizontal: 25,
    paddingTop: 28,
    paddingBottom: screenPadding,
    gap: spacing.sm,
  },
  editorialTag: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    color: colors.goldWarm,
    textTransform: 'uppercase',
  },
  editorialTitle: {
    ...typeScale.headingLg,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  editorialBody: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  readBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primaryDark,
  },
});
