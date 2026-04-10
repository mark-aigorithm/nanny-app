import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.background,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing['4xl'],
  },

  // ── Post Card ───────────────────────────────────────────────────────────────
  postCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
    gap: spacing.md,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warmBorder,
  },
  authorInfo: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textDark,
    lineHeight: 20,
  },
  authorTime: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  tagPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagPillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
  postBody: {
    ...typeScale.bodyLg,
    color: colors.textDark,
    lineHeight: 24,
  },

  // ── Post image (marketplace / event) ────────────────────────────────────────
  postImageContainer: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: 200,
  },
  priceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.goldWarm,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
  },
  priceBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },
  postTitle: {
    ...typeScale.headingMd,
    color: colors.textDark,
  },

  // ── Event details ───────────────────────────────────────────────────────────
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventDetailText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  attendeesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stackedAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.warmBorder,
  },
  attendeeCount: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },

  // ── Action bar ──────────────────────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: spacing.md,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCount: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  actionItemActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCountActive: {
    ...typeScale.labelSm,
    color: colors.primary,
  },

  // ── Comments section ────────────────────────────────────────────────────────
  commentsSection: {
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  commentsTitle: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  commentCard: {
    gap: spacing.sm,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warmBorder,
  },
  commentAuthorName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textDark,
  },
  commentTime: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  commentBody: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    marginLeft: 32 + spacing.sm,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginLeft: 32 + spacing.sm,
  },
  commentAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  commentActionText: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  commentDivider: {
    height: 1,
    backgroundColor: colors.surfaceMuted,
    marginVertical: spacing.xs,
  },

  // ── Replies ─────────────────────────────────────────────────────────────────
  repliesContainer: {
    marginLeft: 32 + spacing.sm,
    marginTop: spacing.sm,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.surfaceMuted,
    gap: spacing.md,
  },
  replyCard: {
    gap: spacing.xs,
  },
  replyAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  replyAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warmBorder,
  },
  replyAuthorName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textDark,
  },
  replyTime: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  replyBody: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    marginLeft: 24 + spacing.sm,
  },

  // ── Sticky reply input ──────────────────────────────────────────────────────
  replyInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    gap: spacing.sm,
  },
  replyAvatar2: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warmBorder,
  },
  replyInput: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textDark,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.neutralLight,
  },
});
