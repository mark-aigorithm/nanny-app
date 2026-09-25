import { StyleSheet } from 'react-native';

import { borderRadius, colors, fontFamily, spacing, typeScale } from '@mobile/theme';
import { wizardBase } from './registration-wizard.styles';

export const styles = StyleSheet.create({
  ...wizardBase,

  // Location group
  locationGroup: {
    gap: spacing.md,
  },
  // Street address error — mirrors HomeLocationMapCard's own mapError, so a
  // required-field message reads the same whichever side of the pin it's about.
  addressErrorText: {
    ...typeScale.labelMd,
    color: colors.error,
  },
  // Short input (neighbourhood)
  inputShort: {
    height: 44,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },

  // What matters most
  sectionBlock: {
    gap: spacing.lg,
  },
  sectionHeader: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
    letterSpacing: -0.9,
  },
  sectionHint: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
  },
});
