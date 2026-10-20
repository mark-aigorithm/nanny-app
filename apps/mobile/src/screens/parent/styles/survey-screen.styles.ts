import { StyleSheet } from 'react-native';
import { colors, spacing, typeScale, screenPadding, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.xl,
  },
  title: { ...typeScale.headingLg, color: colors.textPrimary },
  description: { ...typeScale.bodyLg, color: colors.textSecondary },
  question: { gap: spacing.md },
  prompt: { ...typeScale.headingSm, color: colors.textPrimary },
  // textMuted was 4.13:1 on cream; meta text needs 4.5.
  optional: { ...typeScale.bodyMd, color: colors.textSecondary },
  footer: {
    backgroundColor: colors.background,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  footerKeyboard: { shadowOpacity: 0, elevation: 0 },
  hint: { ...typeScale.bodyMd, color: colors.textSecondary, textAlign: 'center' },
  skipButton: { minHeight: 44 },
  message: {
    flexGrow: 1,
    paddingHorizontal: screenPadding,
    paddingTop: spacing['2xl'],
    gap: spacing.lg,
  },
  messageText: { ...typeScale.bodyLg, color: colors.textSecondary },
});
