import { StyleSheet } from 'react-native';

import {
  colors,
  typeScale,
  fontFamily,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
  FLOATING_NAV_CLEARANCE,
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
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.xl,
    paddingBottom: FLOATING_NAV_CLEARANCE + spacing.lg,
    gap: spacing.lg,
  },

  // Name header (Uber-style: big bold name left, avatar right)
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  name: {
    ...typeScale.displayLg,
    color: colors.textPrimary,
    flex: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    ...typeScale.labelSm,
    color: colors.textPrimary,
  },

  // 2x2 quick tiles
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  tile: {
    flexBasis: '45%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    minHeight: 56,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileLabel: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  tileIconWrap: {
    position: 'relative',
  },
  tileBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.error,
  },

  // Promo cards (title + subtitle left, icon circle right)
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.sm,
  },
  promoTextWrap: {
    flex: 1,
  },
  promoTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  promoSubtitle: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },

  // List section
  listSection: {
    marginTop: spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  listItemLabel: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
    flex: 1,
  },
  listItemDestructive: {
    color: colors.errorDark,
  },
  listDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  signOutPendingLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textMuted,
  },
});
