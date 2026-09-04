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
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: spacing.lg,
    height: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingBottom: Platform.OS === 'ios' ? 56 : 40,
    gap: spacing['3xl'],
  },

  // Headline
  headlineGroup: {
    gap: spacing.sm,
  },
  headline: {
    ...typeScale.displaySm,
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

  // Phase 1 — phone field
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
  },
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

  // Phase 2 — verify + new password
  form: {
    gap: spacing.xl,
  },
  otpSection: {
    gap: spacing.lg,
  },
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

  // Password requirements checklist
  requirementsCard: {
    backgroundColor: colors.taupeLight,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  requirementsTitle: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requirementText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  requirementTextMet: {
    fontFamily: fontFamily.medium,
    color: colors.successDark,
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
