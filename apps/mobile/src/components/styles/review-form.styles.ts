import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  shadows,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  form: {
    gap: spacing['3xl'],
  },

  // Nanny info
  nannySection: {
    alignItems: 'center',
    gap: spacing.md,
  },
  nannyPhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceMuted,
  },
  nannyPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  nannyName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },

  // Star rating
  starsSection: {
    alignItems: 'center',
    gap: spacing.md,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  starButton: {
    padding: spacing.xs,
  },
  ratingLabel: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Review text
  reviewSection: {
    gap: spacing.sm,
  },
  reviewLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  reviewInput: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    height: 140,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  charCount: {
    ...typeScale.caption,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },

  // Submit
  submitButton: {
    height: 56,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  submitButtonText: {
    ...typeScale.labelLg,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
