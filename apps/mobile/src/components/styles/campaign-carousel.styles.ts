import { StyleSheet } from 'react-native';

import { borderRadius, colors, screenPadding, shadows, spacing, typeScale } from '@mobile/theme';

export const CARD_GAP = spacing.md;

export const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  // Home's scroll view already pads by screenPadding. Pull the rail back out to
  // the screen edge and pad its content in, so the first banner lines up with
  // the cards above and the last one can scroll fully into view.
  list: {
    marginHorizontal: -screenPadding,
  },
  listContent: {
    paddingHorizontal: screenPadding,
    gap: CARD_GAP,
  },
  card: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadows.sm,
  },
  // Its aspectRatio comes from the upload size, set in CampaignCarousel.
  image: {
    width: '100%',
    backgroundColor: colors.neutralLight,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
  },
  pillText: {
    ...typeScale.captionBold,
    color: colors.primaryDark,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primaryDark,
  },
});
