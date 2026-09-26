import { StyleSheet } from 'react-native';

import { borderRadius, colors, spacing, typeScale } from '@mobile/theme';
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
