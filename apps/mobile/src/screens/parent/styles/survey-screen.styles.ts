import { StyleSheet } from 'react-native';
import { colors, spacing, typeScale, screenPadding, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.xl,
  },
  description: { ...typeScale.bodyLg, color: colors.textSecondary },
  question: { gap: spacing.md },
  prompt: { ...typeScale.headingSm, color: colors.textPrimary },
  optional: { ...typeScale.bodyMd, color: colors.textMuted },
  footer: {
    backgroundColor: colors.background,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  skipButton: { minHeight: 44 },
  message: {
    flexGrow: 1,
    paddingHorizontal: screenPadding,
    paddingTop: spacing['2xl'],
    gap: spacing.lg,
  },
  messageText: { ...typeScale.bodyLg, color: colors.textSecondary },
});
