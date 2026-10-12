import { StyleSheet } from 'react-native';
import { colors, typeScale, spacing, screenPadding, borderRadius } from '@mobile/theme';

export const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.warmBorder,
  },
  body: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
  },
  notFoundTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  notFoundBody: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },

  messageSellerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryDark,
  },
  messageSellerButtonText: {
    ...typeScale.labelLg,
    color: colors.white,
  },

  // ── Comments ────────────────────────────────────────────────────────────────
  commentsSection: {
    gap: spacing.md,
  },
  commentsTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  noComments: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  noCommentsText: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  loadMorePressable: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadMoreText: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
  },

  // ── Composer (pinned under the thread, above the keyboard) ─────────────────
  composer: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.warmBorder,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  replyBannerText: {
    ...typeScale.caption,
    color: colors.textMuted,
    flex: 1,
  },
  replyBannerName: {
    ...typeScale.captionBold,
    color: colors.textSecondary,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  // Grows with the text up to about five lines, then scrolls inside itself.
  composerInput: {
    ...typeScale.bodyMd,
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.surfaceMuted,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.neutralLight,
  },
});
