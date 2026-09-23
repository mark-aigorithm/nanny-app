import { StyleSheet } from 'react-native';

import { borderRadius, colors, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  input: {
    ...typeScale.bodyMd,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
