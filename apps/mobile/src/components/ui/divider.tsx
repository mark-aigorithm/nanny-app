import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, fontFamily, spacing } from '@mobile/theme';

interface DividerProps {
  label?: string;
}

export default function Divider({ label }: DividerProps) {
  if (!label) {
    return <View style={styles.line} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.taupe,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
});
