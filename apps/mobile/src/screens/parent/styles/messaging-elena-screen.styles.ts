import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 64;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.sm,
    paddingBottom: 100,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(227,213,202,0.8)',
    zIndex: 100,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
  },
  headerNameCol: {
    gap: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerName: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  headerStatus: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.primary,
  },
  videoBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Booking context banner
  bannerWrap: {
    paddingVertical: spacing.xs,
  },
  banner: {
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bannerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTextCol: {
    gap: spacing.xxs,
  },
  bannerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.textDark,
  },
  bannerSub: {
    ...typeScale.caption,
    color: colors.textTertiary,
  },
  confirmedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(106,155,106,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  confirmedText: {
    ...typeScale.captionBold,
    color: colors.success,
  },

  // Date divider
  dateDividerWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dateDivider: {
    backgroundColor: colors.taupe,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  dateDividerText: {
    ...typeScale.captionBold,
    color: colors.textTertiary,
  },

  // Messages
  messageBubbleWrap: {
    maxWidth: '80%',
    gap: spacing.xs,
  },
  messageReceived: {
    alignSelf: 'flex-start',
  },
  messageSent: {
    alignSelf: 'flex-end',
  },
  messageBubble: {
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleReceived: {
    backgroundColor: colors.taupe,
  },
  bubbleSent: {
    backgroundColor: colors.primary,
  },
  messageText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextReceived: {
    color: colors.textDark,
  },
  messageTextSent: {
    color: colors.white,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeRowReceived: {
    alignSelf: 'flex-start',
    paddingLeft: spacing.xs,
  },
  timeRowSent: {
    alignSelf: 'flex-end',
    paddingRight: spacing.xs,
  },
  timeText: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Footer input bar
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.taupe,
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: spacing['4xl'],
    backgroundColor: 'rgba(227,213,202,0.4)',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
  },
  sendBtn: {
    width: spacing['4xl'],
    height: spacing['4xl'],
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
});
