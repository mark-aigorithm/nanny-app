import { StyleSheet } from 'react-native';

import { borderRadius, colors, fontFamily, shadows, spacing, typeScale } from '@mobile/theme';

/** Bubbles, day dividers and the composer shared by every chat in the app. */
export const styles = StyleSheet.create({
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
    backgroundColor: colors.primaryAction,
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
  // minHeight, not height, so 1.3× text and a second line aren't clipped.
  input: {
    flex: 1,
    minHeight: spacing['4xl'],
    maxHeight: spacing['4xl'] * 3,
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
  },
  sendBtn: {
    width: spacing['4xl'],
    height: spacing['4xl'],
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
