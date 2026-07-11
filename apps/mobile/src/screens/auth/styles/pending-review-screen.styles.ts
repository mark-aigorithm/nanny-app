import { StyleSheet } from 'react-native';

import { colors, spacing, screenPadding, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: screenPadding,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: spacing.xl,
  },
  footer: {
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
});
