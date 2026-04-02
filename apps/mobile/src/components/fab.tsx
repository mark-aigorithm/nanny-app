import { Pressable, Text, StyleSheet } from 'react-native';

import { colors, shadows } from '@mobile/lib/theme';

type FabProps = {
  onPress?: () => void;
  color?: string;
  icon?: string;
};

export function Fab({ onPress, color = colors.primary, icon = '+' }: FabProps) {
  return (
    <Pressable onPress={onPress} style={[styles.fab, { backgroundColor: color }]}>
      <Text style={styles.icon}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  icon: {
    fontSize: 28,
    color: colors.white,
    fontWeight: '300',
    lineHeight: 30,
  },
});
