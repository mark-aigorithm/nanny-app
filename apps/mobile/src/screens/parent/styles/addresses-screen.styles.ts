import { StyleSheet } from 'react-native';

import {
  colors,
  screenPadding,
  spacing,
  typeScale,
  borderRadius,
  shadows,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  center: {
    paddingVertical: spacing['4xl'],
    alignItems: 'center',
  },
  errorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  // One address.
  card: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    flex: 1,
  },
  defaultBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
  },
  defaultBadgeText: {
    ...typeScale.captionBold,
    color: colors.primaryDark,
  },
  cardLine: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  cardMeta: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  cardLandmark: {
    ...typeScale.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  action: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },
  actionDestructive: {
    ...typeScale.labelSm,
    color: colors.error,
  },

  // Empty state.
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['3xl'],
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  emptySub: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
