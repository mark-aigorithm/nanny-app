import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
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
  statusBar: {
    backgroundColor: colors.taupeHeader,
  },

  // Header
  header: {
    backgroundColor: colors.taupeHeader,
    zIndex: 3,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  headerTitle: {
    ...typeScale.headingMd,
    letterSpacing: -0.45,
    color: colors.primary,
    lineHeight: 28,
  },
  headerAvatarBg: {
    width: 32,
    height: 32,
    borderRadius: spacing.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  headerAvatar: {
    width: 32,
    height: 32,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing['2xl'],
    paddingBottom: 96,
    gap: spacing['3xl'],
  },

  // Search bar
  searchBar: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
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

  // FAB
  fab: {
    position: 'absolute',
    right: screenPadding,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
    zIndex: 2,
  },

});
