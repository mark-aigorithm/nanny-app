import { StyleSheet } from 'react-native';

import { colors, typeScale, borderRadius } from '@mobile/theme';

export const styles = StyleSheet.create({
  mapCard: {
    height: 220,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.taupeLight,
  },
  map: {
    flex: 1,
  },
  mapHint: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  mapError: {
    ...typeScale.labelMd,
    color: colors.error,
  },
});
