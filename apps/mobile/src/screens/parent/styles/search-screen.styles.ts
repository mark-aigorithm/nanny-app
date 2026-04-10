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

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 172,
    paddingBottom: 100,
    paddingHorizontal: screenPadding,
    gap: spacing['2xl'],
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.taupeHeader,
    zIndex: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    ...typeScale.headingMd,
    color: colors.primary,
  },
  headerAvatarBorder: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(151, 165, 145, 0.2)',
    overflow: 'hidden',
    padding: 1,
    backgroundColor: colors.neutralLight,
  },
  headerAvatar: {
    flex: 1,
    borderRadius: borderRadius.lg,
  },
  searchBarContainer: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.lg,
  },
  searchBar: {
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.xl,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },

  // Filter chips
  filterChips: {
    marginHorizontal: -screenPadding,
  },
  filterChipsContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.white,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  resultsCount: {
    ...typeScale.labelSm,
    color: colors.primary,
  },

  // Nanny cards
  nannyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  nannyImageContainer: {
    position: 'relative',
    backgroundColor: colors.surfaceMuted,
  },
  nannyImage: {
    width: '100%',
    height: 240,
  },
  verifiedBadge: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.success,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  verifiedText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.white,
    letterSpacing: 0.55,
  },
  nannyInfo: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  nannyInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  nannyNameBlock: {
    flex: 1,
    gap: spacing.xxs,
  },
  nannyName: {
    ...typeScale.headingSm,
    letterSpacing: 0,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  nannyMeta: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  ratingBadge: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19.5,
  },
  nannyPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  nannyPrice: {
    lineHeight: 27,
  },
  nannyPriceAmount: {
    fontFamily: fontFamily.extraBold,
    fontSize: 18,
    color: colors.goldWarm,
  },
  nannyPriceUnit: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  viewProfileButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  viewProfileText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.white,
    lineHeight: 19.5,
  },

  // Featured banner
  featuredBanner: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius['2xl'],
    padding: spacing['3xl'],
    gap: spacing.lg,
  },
  featuredPremiumBadge: {
    backgroundColor: colors.goldWarm,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    alignSelf: 'flex-start',
  },
  featuredPremiumText: {
    fontFamily: fontFamily.extraBold,
    fontSize: 10,
    color: colors.white,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  featuredTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  featuredBody: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    lineHeight: 22.75,
  },
  featuredButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.full,
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.md,
    alignSelf: 'flex-start',
    ...shadows.sm,
  },
  featuredButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
    lineHeight: 21,
  },
  featuredImageContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    ...shadows.sm,
  },
  featuredImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
  },

});
