import { StyleSheet } from 'react-native';
import { borderRadius, colors, spacing, typeScale, screenPadding, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    gap: spacing.lg,
  },
  // The survey's title stands where a screen title would (StackHeader's size).
  title: { ...typeScale.displaySm, color: colors.textPrimary, marginBottom: spacing.xs },
  // One card per question: where it sits in the survey, the prompt, the answer.
  question: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  questionMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  // textMuted was 4.13:1 on cream; meta text needs 4.5.
  step: { ...typeScale.labelSm, color: colors.textSecondary },
  optional: {
    ...typeScale.caption,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    overflow: 'hidden',
  },
  prompt: { ...typeScale.headingMd, letterSpacing: -0.4, color: colors.textPrimary },
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
  // End states (thank you, closed, couldn't open) sit in the middle of the
  // screen; the scroll still lets a small phone at 1.3x reach the button.
  message: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing['2xl'],
    gap: spacing.xl,
  },
  messageText: { ...typeScale.bodyLg, color: colors.textSecondary, textAlign: 'center' },
  messageAction: { alignSelf: 'stretch' },
  thanksText: { gap: spacing.sm, alignItems: 'center' },
  thanksTitle: { ...typeScale.displaySm, color: colors.textPrimary, textAlign: 'center' },
});
