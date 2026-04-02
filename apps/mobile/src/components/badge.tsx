import { View, Text, StyleSheet } from 'react-native';

import { colors, fontSizes, radii, spacing } from '@mobile/lib/theme';

type BadgeProps = {
  label: string;
  color?: string;
  bgColor?: string;
  size?: 'sm' | 'md';
};

export function Badge({ label, color = colors.white, bgColor = colors.primary, size = 'md' }: BadgeProps) {
  const isSmall = size === 'sm';
  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingHorizontal: isSmall ? spacing.sm : spacing.md, paddingVertical: isSmall ? 2 : spacing.xs }]}>
      <Text style={[styles.label, { color, fontSize: isSmall ? fontSizes.xs : fontSizes.sm }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '600',
  },
});
