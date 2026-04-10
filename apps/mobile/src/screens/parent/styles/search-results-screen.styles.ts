import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  screenPadding,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  headerSafeArea: {
    backgroundColor: colors.background,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingBottom: 100,
    gap: spacing.lg,
  },

  // Search bar
  searchBar: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: 10,
  },
  searchBarText: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    flex: 1,
  },

  // Filter chips
  filterChipsScroll: {
    marginHorizontal: -screenPadding,
  },
  filterChipsContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.sm,
  },
  filterChipActive: {
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
  },

  // Sort pills
  sortRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sortPill: {
    backgroundColor: colors.taupe,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sortPillActive: {
    backgroundColor: colors.primary,
  },
  sortPillText: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  sortPillTextActive: {
    color: colors.white,
  },

  // Count
  countText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },

  // Nanny result card
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceMuted,
  },
  cardMiddle: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nannyName: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  statPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statPillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textMuted,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  price: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.primary,
  },
  bookButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bookButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.white,
  },
});
