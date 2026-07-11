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
    gap: spacing['2xl'],
  },
  headingGroup: {
    gap: spacing.sm,
  },
  headline: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cards: {
    gap: spacing.lg,
  },
  helperText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Role card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  cardUnselected: {
    borderColor: colors.warmBorder,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconSelected: {
    backgroundColor: colors.surface,
  },
  cardTextWrap: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  cardDescription: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
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
    gap: spacing.lg,
    alignItems: 'stretch',
  },
  continueButton: {
    ...shadows.lg,
    shadowColor: colors.primaryDark,
  },

  // "Already have an account?" divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.warmBorder,
  },
  dividerText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
