import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  STATUS_BAR_HEIGHT,
  HEADER_HEIGHT,
  BOTTOM_NAV_HEIGHT,
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
    paddingTop: HEADER_HEIGHT + spacing.lg,
    paddingBottom: BOTTOM_NAV_HEIGHT + 40,
    paddingHorizontal: screenPadding,
    gap: spacing['3xl'],
  },

  // Filter pills
  filtersScroll: {
    marginHorizontal: -screenPadding,
  },
  filtersContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillInactive: {
    backgroundColor: colors.taupe,
  },
  pillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  pillTextActive: {
    color: colors.white,
  },
  pillTextInactive: {
    color: colors.textTertiary,
  },

  // Section
  section: {
    gap: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionDate: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 0.65,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  sectionDateFaded: {
    opacity: 0.6,
  },
  markAllRead: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },

  // Activity list
  activityList: {
    gap: spacing['2xl'],
  },

  // Activity card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    ...shadows.sm,
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    zIndex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: spacing.xxs,
  },
  cardType: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  cardTime: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  cardDescription: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  cardThumbnail: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
  },

  // Yesterday overlay
  yesterdayCardWrap: {
    position: 'relative',
  },
  yesterdayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: borderRadius.xl,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253, 250, 248, 0.92)',
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: spacing['3xl'],
    height: spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 96,
    right: screenPadding,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
});
