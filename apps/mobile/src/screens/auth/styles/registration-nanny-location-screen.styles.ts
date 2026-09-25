import { StyleSheet } from 'react-native';

import { colors, spacing, typeScale } from '@mobile/theme';
import { wizardBase } from './registration-wizard.styles';

export const styles = StyleSheet.create({
  ...wizardBase,

  locationGroup: {
    gap: spacing.md,
  },
  // Street address error — mirrors HomeLocationMapCard's own mapError, so a
  // required-field message reads the same whichever side of the pin it's about.
  addressErrorText: {
    ...typeScale.labelMd,
    color: colors.error,
  },
});
