import { StyleSheet } from 'react-native';

import { borderRadius, colors, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  // Same height and rounding as Button's md size.
  tile: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.sm,
  },
  tileDisabled: {
    opacity: 0.5,
  },
});
