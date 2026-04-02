import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

import { colors, radii, shadows, spacing } from '@mobile/lib/theme';

type CardProps = {
  children: ReactNode;
  style?: object;
};

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
});
