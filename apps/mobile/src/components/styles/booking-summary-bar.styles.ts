import { StyleSheet, Platform } from 'react-native';
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
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing['2xl'],
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
  total: {
    ...typeScale.headingLg,
    color: colors.primaryDark,
  },
  cta: {
    height: 56,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  ctaPressed: {
    backgroundColor: colors.primaryDark,
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
  },
});
