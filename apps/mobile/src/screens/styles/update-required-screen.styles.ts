import { StyleSheet } from 'react-native';

import { colors, spacing, screenPadding, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding,
  },
  iconCircle: {
    marginBottom: spacing.xl,
  },
  headline: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    ...typeScale.bodyLg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  notes: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  footer: {
    paddingHorizontal: screenPadding,
  },
});
