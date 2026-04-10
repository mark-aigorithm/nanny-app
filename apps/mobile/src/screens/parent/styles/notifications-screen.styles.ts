import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  STATUS_BAR_HEIGHT,
  BOTTOM_NAV_HEIGHT,
} from '@mobile/theme';

const HEADER_HEIGHT = 64;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: HEADER_HEIGHT,
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textDark,
    letterSpacing: -0.5,
  },
  markAllRead: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: BOTTOM_NAV_HEIGHT + screenPadding,
    gap: spacing['2xl'],
  },

  // Filter pills
  pillsScroll: {
    paddingTop: spacing.lg,
  },
  pillsContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  pill: {
    height: 36,
    paddingHorizontal: screenPadding,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pillInactive: {
    backgroundColor: colors.taupe,
  },
  pillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  pillTextActive: {
    color: colors.white,
  },
  pillTextInactive: {
    color: colors.textTertiary,
  },

  // Section
  section: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  yesterdaySection: {
    opacity: 0.7,
  },
  sectionHeading: {
    ...typeScale.headingMd,
    letterSpacing: 0,
    color: colors.textDark,
  },
  cardGroup: {
    gap: spacing.md,
  },

  // Notification card
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.lg,
  },
  cardRead: {
    padding: spacing.lg,
  },

  // Icon circle
  iconCircle: {
    marginTop: spacing.xxs,
  },

  // Card text
  cardTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typeScale.headingSm,
    letterSpacing: 0,
    color: colors.textDark,
    flex: 1,
  },
  cardTime: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  cardSubtitle: {
    ...typeScale.bodySm,
    lineHeight: 18,
    color: colors.textMuted,
  },
});
