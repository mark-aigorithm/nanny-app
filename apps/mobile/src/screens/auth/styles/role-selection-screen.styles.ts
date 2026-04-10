import { StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing, borderRadius, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing['2xl'],
    paddingTop: 80,
    paddingBottom: spacing['4xl'],
  },

  // Blobs
  blobTopLeft: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.warmBorder,
    opacity: 0.4,
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.primary,
    opacity: 0.18,
  },

  // Content
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 40,
  },
  headline: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cards: {
    gap: spacing.lg,
  },

  // Role card
  card: {
    height: 72,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  cardSelected: {
    borderColor: colors.primary,
  },
  cardUnselected: {
    borderColor: colors.warmBorder,
  },
  cardLabel: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },

  // Radio
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioUnselected: {
    borderColor: colors.warmBorder,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },

  // Footer
  footer: {
    gap: spacing['2xl'],
    alignItems: 'center',
  },
  continueButton: {
    ...shadows.lg,
    shadowColor: colors.primaryDark,
  },

  // Sign in footer
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signInLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  signInLink: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primaryDark,
  },
});
