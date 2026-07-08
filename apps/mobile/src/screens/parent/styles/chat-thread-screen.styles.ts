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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.sm,
    paddingBottom: 100,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.taupe,
    zIndex: 100,
    ...shadows.sm,
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
    flex: 1,
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
    flex: 1,
  },
  headerName: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  listingWrap: {
    paddingVertical: spacing.xs,
  },
  listingCard: {
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  listingImage: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  listingTextCol: {
    flex: 1,
    gap: spacing.xxs,
  },
  listingTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
  },
  listingPrice: {
    ...typeScale.captionBold,
    color: colors.primary,
  },
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
    ...shadows.sm,
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
  input: {
    flex: 1,
    height: spacing['4xl'],
    backgroundColor: colors.taupe,
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
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
