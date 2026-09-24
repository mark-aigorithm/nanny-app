import { StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing, borderRadius } from '@mobile/theme';

export const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Blobs
  blobTopLeft: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.warmBorder,
    opacity: 0.35,
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.primary,
    opacity: 0.15,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: 80,
    paddingBottom: spacing['4xl'],
    gap: spacing['3xl'],
  },

  // Header
  header: {
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

  // Collision banner — a Google/Apple identity waiting to be connected.
  linkBanner: {
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
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

  // "or" + Google/Apple, under the phone door.
  socialSection: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },

  // "Forgot password?" — reset works for every door, so it sits on this one
  forgotRow: {
    alignItems: 'center',
  },
  forgotLink: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primaryDark,
  },

  // "New to NannyNow?" + Sign up
  signUpSection: {
    gap: spacing.md,
  },

  // Guest browsing — deliberately quieter than every sign-in route above it
  guestRow: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  guestLink: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Form
  form: {
    gap: spacing.xl,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
  },

  // Phone row
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    height: 56,
  },
  countryCodeBox: {
    width: 64,
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  countryCodeText: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  fieldError: {
    ...typeScale.bodySm,
    color: colors.error,
  },

  // Resend row — verbatim from forgot-password-screen.styles.ts so the two
  // OTP panes (sign-in, password reset) look identical.
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resendLink: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
  resendLinkDisabled: {
    color: colors.textPlaceholder,
  },
  timerText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },

  // Form-level error banner
  formErrorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  formErrorText: {
    ...typeScale.bodyMd,
    color: colors.error,
  },
});
