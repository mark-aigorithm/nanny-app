import { StyleSheet, Dimensions } from 'react-native';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 300;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: BOTTOM_NAV_HEIGHT + spacing['3xl'],
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: spacing['4xl'],
    paddingBottom: spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },

  // Image carousel
  carouselContainer: {
    height: IMAGE_HEIGHT,
    backgroundColor: colors.surfaceMuted,
  },
  carouselScroll: {
    height: IMAGE_HEIGHT,
  },
  carouselSlide: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  carouselImage: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    resizeMode: 'cover',
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
  },
  indicatorDotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },

  // Product info
  infoSection: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    ...typeScale.headingLg,
    color: colors.primary,
  },
  conditionBadge: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  conditionBadgeText: {
    ...typeScale.labelSm,
    color: colors.successText,
  },
  title: {
    ...typeScale.headingMd,
    color: colors.textDark,
  },

  // Seller card
  sellerCard: {
    marginHorizontal: screenPadding,
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  sellerInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  sellerName: {
    ...typeScale.labelLg,
    color: colors.textDark,
  },
  sellerMeta: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  sellerResponseTime: {
    ...typeScale.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  messageSellerButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageSellerButtonText: {
    ...typeScale.labelMd,
    color: colors.white,
  },

  // Description
  descriptionSection: {
    paddingHorizontal: screenPadding,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  descriptionText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    lineHeight: 22,
  },

  // Details rows
  detailsSection: {
    paddingHorizontal: screenPadding,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  detailLabel: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  detailValue: {
    ...typeScale.bodySm,
    fontFamily: fontFamily.semiBold,
    color: colors.textDark,
  },

  // Similar items
  similarSection: {
    marginTop: spacing['3xl'],
    gap: spacing.lg,
  },
  similarHeader: {
    paddingHorizontal: screenPadding,
  },
  similarScrollContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  similarCard: {
    width: 150,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  similarImagePlaceholder: {
    height: 120,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  similarCardInfo: {
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  similarCardName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textDark,
  },
  similarCardPrice: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primary,
  },
  similarCardLocation: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
});
