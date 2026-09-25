import { StyleSheet } from 'react-native';

import { borderRadius, colors, fontFamily, spacing, typeScale } from '@mobile/theme';
import { wizardBase } from './registration-wizard.styles';

export const styles = StyleSheet.create({
  ...wizardBase,

  phoneHighlight: {
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },

  // Number phase
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
    ...typeScale.bodyLg,
    color: colors.textPrimary,
  },
  // Mirrors TextInputField's error treatment, which the raw phone input
  // cannot use.
  phoneInputError: {
    borderWidth: 1,
    borderColor: colors.error,
  },
  fieldErrorText: {
    ...typeScale.bodySm,
    color: colors.error,
  },

  // "This number already has an account."
  takenCard: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  takenText: {
    ...typeScale.bodyMd,
    color: colors.error,
  },

  // Code and verified phases
  codeGroup: {
    gap: spacing.lg,
    alignItems: 'center',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timerText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  link: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
  linkDisabled: {
    color: colors.textPlaceholder,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  verifiedText: {
    ...typeScale.bodyLg,
    color: colors.textPrimary,
  },
});
