import { StyleSheet } from 'react-native';

import { colors, typeScale, spacing, borderRadius, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  list: {
    gap: spacing.sm,
  },

  // One saved address, selectable.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surface,
    ...shadows.sm,
  },
  cardSelected: {
    borderColor: colors.primary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.taupe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  cardTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  cardAddress: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  cardLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  changeLink: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },

  // Prompt when the address book is empty.
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySub: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
});
