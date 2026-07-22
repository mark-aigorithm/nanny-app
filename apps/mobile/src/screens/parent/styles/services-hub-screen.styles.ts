import { StyleSheet } from 'react-native';

import {
  colors,
  typeScale,
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

  // Uber-style big screen title
  screenTitle: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
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
