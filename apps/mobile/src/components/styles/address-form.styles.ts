import { StyleSheet } from 'react-native';

import { colors, typeScale, spacing, borderRadius } from '@mobile/theme';

export const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  hint: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },

  // Label chips: Home / Work / Other.
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },

  // Structured parts.
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowField: {
    flex: 1,
  },

  // "Set as default" toggle row.
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
  },
  toggleText: {
    flex: 1,
    gap: spacing.xxs,
  },
  toggleTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  toggleSub: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  error: {
    ...typeScale.bodySm,
    color: colors.error,
  },
});
