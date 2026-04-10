import { StyleSheet } from 'react-native';
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

const HEADER_HEIGHT_LOCAL = 110;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT_LOCAL + 60,
    paddingBottom: BOTTOM_NAV_HEIGHT + spacing.lg,
    paddingHorizontal: screenPadding,
    gap: spacing.xl,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
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
    ...typeScale.headingLg,
    color: colors.textDark,
  },
  sellButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  sellButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primary,
  },

  // Search bar
  searchBarContainer: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.md,
  },
  searchBar: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.full,
    height: spacing['4xl'],
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
    fontSize: 14,
    color: colors.textDark,
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
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typeScale.labelSm,
    color: colors.textDark,
  },
  chipTextActive: {
    color: colors.white,
  },

  // Product grid
  gridContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  gridColumn: {
    flex: 1,
    gap: spacing.md,
  },

  // Product card
  productCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  productImagePlaceholder: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: spacing.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  productInfo: {
    padding: spacing.md,
    gap: spacing.xxs,
  },
  productName: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
  },
  productPrice: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.primary,
  },
  productLocation: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
});
