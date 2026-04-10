import { StyleSheet } from 'react-native';
import {
  colors,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
  HEADER_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.lg,
    paddingHorizontal: screenPadding,
    paddingBottom: 100,
    gap: spacing['2xl'],
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  bellBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Earnings card
  earningsCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.lg,
  },
  earningsTitle: {
    ...typeScale.labelMd,
    color: 'rgba(255,255,255,0.7)',
  },
  earningsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  earningsItem: {
    flex: 1,
    gap: spacing.xs,
  },
  earningsLabel: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.6)',
  },
  earningsAmount: {
    ...typeScale.displayMd,
    color: colors.white,
  },
  earningsDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },

  // Booking cards
  bookingsList: {
    gap: spacing.md,
  },
  bookingCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  bookingAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
  },
  bookingInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  bookingName: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  bookingMeta: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  bookingAmount: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  seeAll: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
});
