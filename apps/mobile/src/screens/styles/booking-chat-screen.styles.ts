import { StyleSheet } from 'react-native';

import { borderRadius, colors, screenPadding, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sendError: {
    ...typeScale.bodySm,
    color: colors.error,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
  },
  closedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: screenPadding,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
  },
  closedNoteText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
