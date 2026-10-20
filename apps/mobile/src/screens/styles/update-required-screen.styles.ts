import { StyleSheet } from 'react-native';

import { STATUS_BAR_HEIGHT, colors, spacing, screenPadding, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  // No header, in a status-bar-translucent Modal: the scroll starts below the
  // clock itself, and its content keeps clear of both ends when it overflows.
  scroll: { marginTop: STATUS_BAR_HEIGHT },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.xl,
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
  notesLong: { alignSelf: 'stretch', textAlign: 'left' },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  storeError: { ...typeScale.bodyMd, color: colors.textSecondary, textAlign: 'center' },
});
