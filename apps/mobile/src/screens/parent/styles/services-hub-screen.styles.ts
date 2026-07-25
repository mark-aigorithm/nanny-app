import { StyleSheet } from 'react-native';

import {
  colors,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  PARENT_TAB_SCROLL_BOTTOM,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    paddingBottom: PARENT_TAB_SCROLL_BOTTOM,
    gap: spacing.lg,
  },

  // Hero tile: Book a Nanny
  heroTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    ...shadows.sm,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },

  // 2-column tile grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  tile: {
    flexBasis: '45%',
    flexGrow: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    minHeight: 104,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileLabel: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
});
