import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  HEADER_HEIGHT,
  BOTTOM_NAV_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.lg,
    paddingHorizontal: screenPadding,
    paddingBottom: BOTTOM_NAV_HEIGHT + spacing.lg,
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

  // Conversation list
  conversationList: {
    gap: spacing['2xl'],
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  chatAvatarBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    flexShrink: 0,
  },
  chatAvatar: {
    width: 56,
    height: 56,
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
  chatContent: {
    flex: 1,
    gap: spacing.xxs,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
