import { StyleSheet } from 'react-native';

import { colors, screenPadding, spacing, typeScale, borderRadius, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
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

  // One child.
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
    gap: spacing.md,
  },
  initial: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    ...typeScale.labelLg,
    color: colors.primaryDark,
  },
  cardTitleWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  cardTitle: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  cardMeta: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  needsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  needsText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.errorLight,
  },
  healthText: {
    ...typeScale.bodySm,
    color: colors.error,
    flexShrink: 1,
  },
  cardLine: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  cardNote: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  // 44dp tap targets, per the UI sweep rules.
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
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
