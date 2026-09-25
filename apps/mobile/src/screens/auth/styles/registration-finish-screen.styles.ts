import { StyleSheet } from 'react-native';

import { borderRadius, colors, fontFamily, spacing, typeScale } from '@mobile/theme';
import { wizardBase } from './registration-wizard.styles';

export const styles = StyleSheet.create({
  ...wizardBase,

  // "Signed in as +20 …"
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryText: {
    ...typeScale.bodyMd,
    color: colors.successText,
  },

  // Terms card
  termsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: colors.taupeLight,
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
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: -spacing.md,
  },
  termsLink: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.semiBold,
    color: colors.primaryDark,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    ...typeScale.labelMd,
    color: colors.textMuted,
  },
});
