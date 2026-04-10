import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamily, borderRadius, spacing } from '@mobile/theme';

interface SearchBarProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  placeholder?: string;
  editable?: boolean;
  rightElement?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function SearchBar({
  value,
  onChangeText,
  onPress,
  placeholder = 'Search...',
  editable = true,
  rightElement,
  style,
}: SearchBarProps) {
  const Wrapper = onPress && !editable ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={[styles.container, style]}
    >
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        editable={editable && !onPress}
      />
      {rightElement}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
    height: '100%',
  },
});
