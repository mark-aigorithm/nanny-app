import { StyleSheet } from 'react-native';

import { borderRadius, colors, screenPadding, shadows, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing['4xl'],
    gap: spacing['2xl'],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadText: {
    flex: 1,
    gap: spacing.xxs,
  },
  children: {
    ...typeScale.labelLg,
    color: colors.primaryDark,
  },
  loggedBy: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  notes: {
    ...typeScale.bodyLg,
    color: colors.textSecondary,
  },
  muted: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  missing: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
});
