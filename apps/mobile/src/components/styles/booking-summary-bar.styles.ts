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
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  summaryLeft: {
    flex: 1,
    gap: spacing.xxs,
  },
  summaryLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  summaryValue: {
    ...typeScale.labelSm,
    color: colors.textPrimary,
  },
  summaryValueMuted: {
    color: colors.textPlaceholder,
  },
  totalWrap: {
    alignItems: 'flex-end',
  },
  totalStrike: {
    ...typeScale.caption,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  total: {
    ...typeScale.headingLg,
    color: colors.primaryDark,
  },
  // The label can carry a price; it wraps on a narrow phone and the CTA grows.
  cta: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaDisabled: {
    backgroundColor: colors.taupe,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    ...typeScale.labelLg,
    fontFamily: fontFamily.bold,
    color: colors.white,
    textAlign: 'center',
  },
});
