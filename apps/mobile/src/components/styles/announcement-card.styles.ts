import { StyleSheet } from 'react-native';

import { borderRadius, colors, shadows, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  // The shadow sits on a wrapper: the card itself clips (so the Android ripple
  // and the image keep the rounded corners), and a clipping view loses its own
  // iOS shadow.
  shadow: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  //
  // The left border is always 3 wide and only its colour marks unread. On
  // Android a clipping, rounded view whose border width changes on a re-render
  // drew blank, so the card went empty the moment a tap marked it read (UI
  // sweep s20-04). A fixed width also keeps the text from shifting on read.
  card: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.surface,
  },
  // Same unread marker as NotificationRow, so the two kinds read as one list.
  cardUnread: {
    borderLeftColor: colors.primaryDark,
  },
  // iOS has no ripple; a dim is its standard press feedback. Opacity only, so
  // the card never moves or resizes under her finger.
  cardPressedIos: {
    opacity: 0.7,
  },
  // Its aspectRatio comes from the upload size, set in AnnouncementCard. The
  // background is the placeholder until (or if never) the image paints.
  imageBox: {
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.xs,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  // Wraps, so a long title or a big font drops the time onto its own line
  // instead of cutting the title short (UI-sweep rule).
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: spacing.sm,
    rowGap: spacing.xxs,
  },
  // An Arabic title starts at the right edge, with the time on the left.
  titleRowRtl: {
    flexDirection: 'row-reverse',
  },
  title: {
    ...typeScale.headingSm,
    letterSpacing: 0,
    color: colors.textDark,
    flexShrink: 1,
  },
  time: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  actionText: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
    flexShrink: 1,
  },
});
