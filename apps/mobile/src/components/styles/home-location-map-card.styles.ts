import { StyleSheet } from 'react-native';

import { colors, typeScale, borderRadius, shadows } from '@mobile/theme';

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
  currentLocationButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
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
