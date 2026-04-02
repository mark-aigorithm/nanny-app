import { Pressable, Text, StyleSheet } from 'react-native';

import { colors, spacing } from '@mobile/lib/theme';

type IconButtonProps = {
  icon: string;
  label?: string;
  size?: number;
  onPress?: () => void;
  color?: string;
};

export function IconButton({ icon, label, size = 48, onPress, color = colors.textPrimary }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.container, { minWidth: size, minHeight: size }]}
    >
      <Text style={[styles.icon, { fontSize: size * 0.5, color }]}>{icon}</Text>
      {label && <Text style={[styles.label, { color }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {},
  label: {
    fontSize: 12,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
});
