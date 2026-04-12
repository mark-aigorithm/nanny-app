import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

const HEADER_CONTENT_HEIGHT = 56;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header bar
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: spacing.lg,
    height: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    ...typeScale.headingMd,
    color: colors.primary,
    letterSpacing: -0.5,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT + screenPadding,
    paddingHorizontal: screenPadding,
    paddingBottom: Platform.OS === 'ios' ? 56 : 40,
    gap: spacing['3xl'],
  },

  // Progress section
  progressSection: {
    gap: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepLabel: {
    ...typeScale.overline,
    letterSpacing: 0.65,
    color: colors.textMuted,
  },
  completionLabel: {
    ...typeScale.labelSm,
    color: colors.primary,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: colors.taupe,
    borderRadius: 3,
  },
  progressBarFill: {
    width: '100%',
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  // Headline
  headlineGroup: {
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
  phoneHighlight: {
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },

  // OTP section
  otpSection: {
    gap: spacing.lg,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  otpBoxRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  otpBox: {
    width: 48,
    height: 56,
    backgroundColor: colors.warmBorder,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.transparent,
  },
  otpBoxActive: {
    borderColor: colors.primary,
  },
  otpDigit: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  cursor: {
    width: 2,
    height: 22,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },

  // Resend row
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

  // Terms card
  termsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: 'rgba(235,221,210,0.5)',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textPlaceholder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  termsText: {
    flex: 1,
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  termsLink: {
    fontFamily: fontFamily.semiBold,
    color: colors.primaryDark,
  },
});
