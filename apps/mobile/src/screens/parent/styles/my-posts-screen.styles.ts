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
    paddingBottom: spacing['4xl'],
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
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: br.md,
    backgroundColor: colors.surfaceMuted,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBody: {
    flex: 1,
    gap: spacing.xxs,
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
    ...typeScale.bodySm,
    fontWeight: '700',
    color: colors.primary,
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
