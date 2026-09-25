import { StyleSheet } from 'react-native';

import { borderRadius, colors, fontFamily, spacing, typeScale } from '@mobile/theme';
import { wizardBase } from './registration-wizard.styles';

export const styles = StyleSheet.create({
  ...wizardBase,

  emailHighlight: {
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },

  // Email code
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
  resendLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  resendLink: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
  resendLinkDisabled: {
    color: colors.textPlaceholder,
  },
  fieldErrorText: {
    ...typeScale.bodySm,
    color: colors.error,
    textAlign: 'center',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  verifiedText: {
    ...typeScale.bodyLg,
    color: colors.textPrimary,
    flexShrink: 1,
  },

  // Password
  form: {
    gap: spacing.xl,
  },
  requirementsCard: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
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
});
