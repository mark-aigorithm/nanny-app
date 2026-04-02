import { Pressable, Text, StyleSheet } from 'react-native';

import { colors, fontSizes, radii, spacing } from '@mobile/lib/theme';

type ChipProps = {
  label: string;
  active?: boolean;
  activeColor?: string;
  onPress?: () => void;
};

export function Chip({ label, active = false, activeColor = colors.primary, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active
          ? { backgroundColor: activeColor }
          : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.label, { color: active ? colors.white : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    marginRight: spacing.sm,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
});
