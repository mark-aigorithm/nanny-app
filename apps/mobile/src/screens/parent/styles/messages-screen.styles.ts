import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  PARENT_TAB_CONTENT_TOP_WITH_SEARCH,
  PARENT_TAB_SCROLL_BOTTOM,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: PARENT_TAB_CONTENT_TOP_WITH_SEARCH,
    paddingBottom: PARENT_TAB_SCROLL_BOTTOM,
  },

  emptyText: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  loader: {
    marginTop: spacing.lg,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  avatarInitial: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.primary,
  },
  listingSubtitle: {
    ...typeScale.caption,
    color: colors.textTertiary,
  },

  // Conversation list
  conversationList: {
    gap: spacing['2xl'],
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  chatAvatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  chatAvatarBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  chatAvatar: {
    width: 56,
    height: 56,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.background,
  },
  chatContent: {
    flex: 1,
    gap: spacing.xxs,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  chatNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chatName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  chatTime: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  chatTimeUnread: {
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  chatPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatPreview: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    paddingRight: spacing.sm,
  },
  chatPreviewUnread: {
    fontFamily: fontFamily.semiBold,
    color: colors.textDark,
  },
  unreadBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  unreadBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.white,
    lineHeight: 15,
  },
});
