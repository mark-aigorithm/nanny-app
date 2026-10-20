import { StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, shadows, typeScale, fontFamily } from '@mobile/theme';

export const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.lg,
  },
  cardRead: {
    padding: spacing.lg,
  },
  iconCircle: {
    marginTop: spacing.xxs,
  },
  cardTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  // Wraps, so a long title or a big font drops the timestamp onto its own line
  // instead of cutting the title short.
  cardTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: spacing.sm,
    rowGap: spacing.xxs,
  },
  cardTitle: {
    ...typeScale.headingSm,
    letterSpacing: 0,
    color: colors.textDark,
    flexShrink: 1,
  },
  cardTitleUnread: {
    fontFamily: fontFamily.bold,
  },
  cardTime: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  cardSubtitle: {
    ...typeScale.bodySm,
    lineHeight: 18,
    color: colors.textMuted,
  },
  cardSubtitleUnread: {
    color: colors.textDark,
  },
});
