import { StyleSheet } from 'react-native';
import { colors, spacing, typeScale, screenPadding, borderRadius } from '@mobile/theme';

export const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  rowText: { flex: 1, flexShrink: 1, gap: spacing.xs },
  title: { ...typeScale.labelMd, color: colors.textPrimary },
  meta: { ...typeScale.bodyMd, color: colors.textSecondary },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagText: { ...typeScale.labelMd, color: colors.textSecondary },
  center: { alignItems: 'stretch', gap: spacing.lg, paddingVertical: spacing.lg },
  empty: { ...typeScale.bodyLg, color: colors.textSecondary },
});
