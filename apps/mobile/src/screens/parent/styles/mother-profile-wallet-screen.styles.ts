import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  screenPadding,
  STATUS_BAR_HEIGHT,
  HEADER_HEIGHT,
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
    // TODO: Update bottom padding once BottomNav is updated with
    // the correct tabs for this screen (Home, Bookings, Support, Profile)
    paddingBottom: 128,
    paddingHorizontal: screenPadding,
    gap: spacing['2xl'],
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.8)',
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
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: spacing.xl,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: 'rgba(196,200,191,0.2)',
  },

  // Hero section
  heroSection: {
    backgroundColor: colors.warmBorder,
    borderRadius: borderRadius.xl,
    height: 305,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.sm,
  },
  profilePhotoWrap: {
    width: 96,
    height: 96,
    marginBottom: spacing.xs,
  },
  profilePhoto: {
    width: 96,
    height: 96,
    borderRadius: spacing['4xl'],
    borderWidth: 2,
    borderColor: colors.white,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberBadge: {
    backgroundColor: colors.bronze,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  memberBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.white,
  },
  profileName: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textTertiary,
  },
  editProfileBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  editProfileText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },

  // Wallet row
  walletRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  walletCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  walletAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
    color: colors.primary,
  },
  rewardsAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
    color: colors.textPrimary,
  },
  rewardsPts: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  walletLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textTertiary,
  },
  earnMore: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
    marginTop: spacing.xxs,
  },

  // Settings list
  settingsList: {
    gap: spacing.sm,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    height: 56,
    paddingHorizontal: spacing.lg,
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsItemLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  settingsItemLabelDestructive: {
    color: colors.errorDark,
    fontWeight: '700',
  },
  settingsItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsBadge: {
    backgroundColor: colors.warmBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  settingsBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textTertiary,
  },
});
