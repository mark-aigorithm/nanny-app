import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: screenPadding,
    paddingTop: 80,
    paddingBottom: spacing['4xl'],
  },

  // Decorative blurred blobs
  blobTopRight: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.warmBorder,
    opacity: 0.4,
  },
  blobBottomLeft: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.primary,
    opacity: 0.18,
  },

  // Content
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },

  // Bell icon circle
  iconCircle: {
    marginBottom: spacing.sm,
  },

  headline: {
    ...typeScale.displaySm,
    letterSpacing: -0.5,
    color: colors.textPrimary,
    textAlign: 'center',
  },

  body: {
    ...typeScale.bodyLg,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },

  // Benefits
  benefitsList: {
    width: '100%',
    gap: 14,
    marginTop: spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  benefitText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    flex: 1,
  },

  // Footer
  footer: {
    gap: spacing.lg,
    alignItems: 'center',
  },

  // Primary CTA
  primaryButton: {
    width: '100%',
    height: 56,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  gradientFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  primaryButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.white,
  },

  // Secondary CTA
  secondaryButton: {
    paddingVertical: spacing.sm,
  },
  secondaryButtonPressed: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textTertiary,
  },
});
