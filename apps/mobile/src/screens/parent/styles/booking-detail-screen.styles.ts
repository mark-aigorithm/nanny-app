import { StyleSheet } from 'react-native';
import { colors, typeScale, spacing, screenPadding, borderRadius, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing['4xl'],
    gap: spacing['3xl'],
  },
  // The booking card and whatever it is waiting on (payment, PIN, extension)
  // read as one group, so they sit closer than the sections below.
  top: {
    gap: spacing.md,
  },

  // "Something wrong? Contact support"
  support: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.warmSubtle,
    ...shadows.sm,
  },
  supportIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportText: {
    flex: 1,
    gap: spacing.xxs,
  },
  supportTitle: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  supportSub: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
});
