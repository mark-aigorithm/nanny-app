import { StyleSheet } from 'react-native';

import { spacing } from '@mobile/theme';

export const styles = StyleSheet.create({
  fields: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
  },
  // The street name needs the room; a building number is a few characters.
  wideField: {
    flex: 2,
  },
});
