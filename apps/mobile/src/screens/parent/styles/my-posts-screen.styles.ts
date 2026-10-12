import { StyleSheet } from 'react-native';

import {
  colors,
  screenPadding,
  spacing,
  typeScale,
  borderRadius as br,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
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

  // Empty state
  emptyCard: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing['2xl'],
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: br.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyButton: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },

  // Status summary
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: br.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warmBorder,
  },
  summaryCount: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  summaryLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },

  emptyTitle: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  emptyBody: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Post card
  postCard: {
    gap: spacing.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: br.md,
    backgroundColor: colors.primaryMuted,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.sm,
  },
  typeLabel: {
    ...typeScale.caption,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'uppercase',
  },
  postTitle: {
    ...typeScale.bodyMd,
    fontWeight: '600',
    color: colors.textDark,
  },
  postDetail: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },
  postTime: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Status chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: br.full,
  },
  chipPending: {
    backgroundColor: colors.surfaceMuted,
  },
  chipRejected: {
    backgroundColor: colors.errorLight,
  },
  chipLive: {
    backgroundColor: colors.successLight,
  },
  chipText: {
    ...typeScale.caption,
    fontWeight: '600',
  },
  chipTextPending: {
    color: colors.textTertiary,
  },
  chipTextRejected: {
    color: colors.error,
  },
  chipTextLive: {
    color: colors.successText,
  },

  reasonBox: {
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: br.md,
    backgroundColor: colors.errorLight,
  },
  reasonLabel: {
    ...typeScale.captionBold,
    color: colors.error,
  },
  reason: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },

  loadMore: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  loadMoreText: {
    ...typeScale.bodySm,
    fontWeight: '600',
    color: colors.primaryDark,
  },
});
