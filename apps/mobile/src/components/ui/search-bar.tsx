import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamily, borderRadius, spacing, shadows } from '@mobile/theme';

interface SearchBarProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  placeholder?: string;
  editable?: boolean;
  rightElement?: React.ReactNode;
  showClearButton?: boolean;
  onClear?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  autoFocus?: boolean;
  variant?: 'filled' | 'elevated';
  size?: 'default' | 'compact';
  style?: StyleProp<ViewStyle>;
}

const SIZE_STYLES = {
  default: { height: 48, fontSize: 15, iconSize: 18 },
  compact: { height: 40, fontSize: 14, iconSize: 16 },
} as const;

export default function SearchBar({
  value,
  onChangeText,
  onPress,
  placeholder = 'Search...',
  editable = true,
  rightElement,
  showClearButton = false,
  onClear,
  returnKeyType = 'search',
  autoFocus = false,
  variant = 'filled',
  size = 'default',
  style,
}: SearchBarProps) {
  const Wrapper = onPress && !editable ? Pressable : View;
  const canClear = showClearButton && (value?.length ?? 0) > 0;
  const sizeStyle = SIZE_STYLES[size];

  return (
    <Wrapper
      onPress={onPress}
      style={[
        styles.container,
        { height: sizeStyle.height },
        variant === 'elevated' && styles.elevated,
        style,
      ]}
    >
      <Ionicons name="search-outline" size={sizeStyle.iconSize} color={colors.textMuted} />
      <TextInput
        style={[styles.input, { fontSize: sizeStyle.fontSize }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        editable={editable && !onPress}
        returnKeyType={returnKeyType}
        autoFocus={autoFocus}
        clearButtonMode="never"
      />
      {canClear && (
        <Pressable
          onPress={onClear ?? (() => onChangeText?.(''))}
          hitSlop={8}
          accessibilityLabel="Clear search"
          accessibilityRole="button"
        >
          <Ionicons name="close-circle" size={sizeStyle.iconSize} color={colors.textMuted} />
        </Pressable>
      )}
      {rightElement}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  elevated: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    ...shadows.sm,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
    height: '100%',
    paddingVertical: 0,
  },
});
