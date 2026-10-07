import { StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing, borderRadius, screenPadding, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },

  // Soft background shapes — a sage one off the top-right corner and a warm
  // one behind the headline.
  blobTopRight: {
    position: 'absolute',
    top: -160,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.primary,
    opacity: 0.13,
  },
  blobLeft: {
    position: 'absolute',
    top: 120,
    left: -140,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.warmBorder,
    opacity: 0.45,
  },

  // Scroll — grows to the screen so the sign-up line can sit at the foot.
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },

  // Brand + "Skip for now"
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandName: {
    ...typeScale.headingMd,
    letterSpacing: -0.3,
    color: colors.primaryDark,
  },
  // Guest browsing — deliberately quieter than every sign-in route.
  skipLink: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
    paddingVertical: spacing.sm,
  },

  // Header
  header: {
    marginTop: spacing['4xl'],
    gap: spacing.sm,
  },
  headline: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.bodyLg,
    color: colors.textSecondary,
  },
  subtitleStrong: {
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
  // "Change" — inline in the code-phase subtitle.
  inlineLink: {
    fontFamily: fontFamily.bold,
    color: colors.primaryDark,
  },
  linkDisabled: {
    color: colors.textPlaceholder,
  },

  // Collision banner — a Google/Apple identity waiting to be connected.
  linkBanner: {
    marginTop: spacing['2xl'],
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  linkBannerText: {
    ...typeScale.bodyMd,
    color: colors.textPrimary,
  },
  linkBannerDismiss: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primaryDark,
  },

  // Form — the field (or code boxes), any error, and the one primary button.
  form: {
    marginTop: spacing['3xl'],
    gap: spacing.xl,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
  },

  // Phone field — one white field with the country code inside it.
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    ...shadows.sm,
  },
  phoneRowFocused: {
    borderColor: colors.primary,
  },
  phoneRowError: {
    borderColor: colors.error,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 30,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.warmBorder,
  },
  countryCodeText: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.medium,
    fontSize: 17,
    color: colors.textPrimary,
  },
  fieldError: {
    ...typeScale.bodySm,
    color: colors.error,
  },

  // "Didn't get it? Resend in 24s"
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resendText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  resendLink: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
  },

  // "or continue with" + the logo tiles.
  socialSection: {
    marginTop: spacing['3xl'],
    gap: spacing.xl,
  },

  // "New to NannyNow? Create an account" — pinned to the foot.
  signUpRow: {
    marginTop: 'auto',
    paddingTop: spacing['3xl'],
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  signUpText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textSecondary,
  },
  signUpLink: {
    fontFamily: fontFamily.bold,
    color: colors.primaryDark,
  },

  // Form-level error banner
  formErrorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  formErrorText: {
    ...typeScale.bodyMd,
    color: colors.error,
  },
});
