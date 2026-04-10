import { StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing, borderRadius, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing['2xl'],
    justifyContent: 'space-between',
    paddingBottom: spacing['4xl'],
  },

  statusBarSpacer: {
    height: 44,
  },

  // ── Center content ────────────────────────────────────────────────────────────
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
  },

  iconCircle: {
    width: 64,
    height: 64,
    marginBottom: spacing.xs,
  },

  headline: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.6,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
  },

  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 26,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },

  // Success banner
  successBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: 'rgba(106,155,106,0.1)', // one-off success border — could be added to theme
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  successIconWrap: {
    marginTop: 1,
  },
  successTextWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  successTitle: {
    ...typeScale.labelMd,
    color: colors.successText,
    lineHeight: 20,
  },
  successBody: {
    ...typeScale.bodySm,
    color: colors.successDark,
    lineHeight: 18,
  },

  // Email input
  inputContainer: {
    width: '100%',
  },

  // CTA button
  ctaButton: {
    borderRadius: borderRadius.full,
    ...shadows.md,
  },

  // Error
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  footerText: {
    ...typeScale.labelMd,
    color: colors.primary,
    lineHeight: 20,
  },
});
