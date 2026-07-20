import { StyleSheet } from 'react-native';

import { colors, spacing, typeScale, borderRadius as br, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.md,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },

  center: {
    paddingVertical: spacing['4xl'],
    alignItems: 'center',
  },
  errorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  // Hero
  hero: {
    backgroundColor: colors.warmLight,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: br.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  heroTitle: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  heroBody: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Paused notice, when admins switch referrals off
  pausedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  pausedText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  // Code card
  codeCard: {
    gap: spacing.lg,
  },
  codeLabel: {
    ...typeScale.overline,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: br.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  codeText: {
    ...typeScale.headingLg,
    color: colors.primaryDark,
    letterSpacing: 2,
  },
  copiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  copiedText: {
    ...typeScale.caption,
    color: colors.successDark,
  },
  copyHint: {
    ...typeScale.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // How it works
  stepsCard: {
    gap: spacing.lg,
  },
  stepsTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepIndex: {
    width: 28,
    height: 28,
    borderRadius: br.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: {
    ...typeScale.captionBold,
    color: colors.primaryDark,
  },
  stepBody: {
    flex: 1,
    minWidth: 0,
    paddingTop: spacing.xs,
  },
  stepTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  stepText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    marginTop: 1,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: br.lg,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  statValue: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Invite list
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  emptyTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  emptyBody: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowAvatar: {
    width: 40,
    height: 40,
    borderRadius: br.full,
    backgroundColor: colors.taupeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  rowDate: {
    ...typeScale.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: br.full,
  },
  statusChipPending: {
    backgroundColor: colors.surfaceMuted,
  },
  statusChipEarned: {
    backgroundColor: colors.successLight,
  },
  statusText: {
    ...typeScale.captionBold,
  },
  statusTextPending: {
    color: colors.textTertiary,
  },
  statusTextEarned: {
    color: colors.successDark,
  },
});
