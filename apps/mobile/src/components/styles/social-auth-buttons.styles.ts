import { StyleSheet } from 'react-native';

import { colors, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  // Matches Button's md height, so the two stack as a pair.
  appleButton: {
    width: '100%',
    height: 56,
  },
  // Stands in for Apple's button while a role is still to be picked.
  hint: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  error: {
    ...typeScale.bodySm,
    color: colors.error,
    textAlign: 'center',
  },
});
