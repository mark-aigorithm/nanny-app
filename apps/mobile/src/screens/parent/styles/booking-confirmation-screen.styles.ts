import { StyleSheet } from 'react-native';

import {
  colors,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing['4xl'],
    gap: spacing.lg,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },

  // Hero
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroCore: {
    width: 104,
    height: 104,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    // Shadow lives on the wrapper: on the Image itself it would widen the
    // style to a ViewStyle and stop type-checking against ImageStyle.
    ...shadows.md,
  },
  heroAvatar: {
    width: 104,
    height: 104,
    borderRadius: borderRadius.full,
    borderWidth: 4,
    borderColor: colors.surface,
  },
  heroAvatarPlaceholder: {
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  subtitle: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    minHeight: 44,
  },
  elapsedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupeLight,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  elapsedText: {
    ...typeScale.caption,
    color: colors.textTertiary,
  },

  // Booking card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    ...shadows.md,
  },
  nannyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  photoWrapper: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  nannyPhoto: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
  },
  nannyPhotoPlaceholder: {
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nannyHeaderBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  nannyName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  nannyMeta: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.lg,
  },

  detailsList: {
    gap: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailLabel: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  detailValue: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },

  // What happens next
  timeline: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.sm,
  },
  timelineTitle: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
    marginBottom: spacing.xxs,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineRail: {
    alignItems: 'center',
    width: 20,
  },
  timelineDot: {
    width: 18,
    height: 18,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotReached: {
    backgroundColor: colors.primary,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 20,
    backgroundColor: colors.taupeLight,
    marginVertical: spacing.xxs,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: spacing.md,
    gap: spacing.xxs,
  },
  timelineStep: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  timelineStepActive: {
    color: colors.textPrimary,
  },
  timelineDetail: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Actions — the shared Button component owns the visuals now
  actions: {
    width: '100%',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  actionsHint: {
    ...typeScale.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  cancelLink: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelLinkText: {
    ...typeScale.labelSm,
    color: colors.error,
  },

  // Care Points redemption card
  rewardCard: {
    width: '100%',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  rewardCardApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.successLight,
  },
  rewardAppliedBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  rewardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    width: '100%',
  },
  rewardTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    flex: 1,
  },
  rewardBalance: {
    ...typeScale.captionBold,
    color: colors.bronze,
  },
  rewardSub: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  rewardControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    width: '100%',
  },
  rewardApplyBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  rewardApplyText: {
    ...typeScale.labelMd,
    color: colors.white,
  },
  rewardRemove: {
    ...typeScale.labelMd,
    color: colors.error,
  },
});
