import { StyleSheet } from 'react-native';

import { borderRadius, colors, screenPadding, shadows, spacing, typeScale } from '@mobile/theme';

const CARD_WIDTH = 280;

export const CARD_WIDTH_PX = CARD_WIDTH;

export const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    paddingHorizontal: screenPadding,
  },
  listContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadows.sm,
  },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: colors.neutralLight,
  },
  body: {
    padding: spacing.md,
  },
  title: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
