import { StyleSheet } from 'react-native';

import { colors, screenPadding, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  center: {
    paddingVertical: spacing['4xl'],
    alignItems: 'center',
    gap: spacing.lg,
  },
  updatedAt: {
    ...typeScale.labelMd,
    color: colors.textMuted,
  },
  body: {
    ...typeScale.bodyLg,
    color: colors.textSecondary,
  },
  errorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
});
