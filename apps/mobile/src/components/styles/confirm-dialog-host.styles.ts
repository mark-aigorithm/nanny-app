import { StyleSheet } from 'react-native';

import { colors, typeScale, spacing, borderRadius, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.lg,
    ...shadows.xl,
  },
  title: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
});
