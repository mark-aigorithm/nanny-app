import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, TextInput } from './text';
import type {
  TextInputProps as RNTextInputProps,
  TextStyle,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamily, borderRadius, spacing } from '@mobile/theme';

interface TextInputFieldProps extends Omit<RNTextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  rightIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export default function TextInputField({
  label,
  error,
  secureTextEntry,
  rightIcon,
  containerStyle,
  inputStyle,
  ...props
}: TextInputFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isSecure = secureTextEntry && !showPassword;

  return (
    <View style={containerStyle}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          props.multiline ? styles.inputContainerMultiline : undefined,
          error ? styles.inputError : undefined,
        ]}
      >
        <TextInput
          style={[styles.input, props.multiline ? styles.inputMultiline : undefined, inputStyle]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isSecure}
          {...props}
        />
        {secureTextEntry && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.iconButton}
            hitSlop={8}
          >
            <Ionicons
              name={showPassword ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.textTertiary}
            />
          </Pressable>
        )}
        {rightIcon && !secureTextEntry && (
          <View style={styles.iconButton}>{rightIcon}</View>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
  },
  // Multi-line text grows the field instead of being clipped at one row.
  inputContainerMultiline: {
    height: 'auto',
    minHeight: 56,
  },
  inputError: {
    borderWidth: 1,
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
    height: '100%',
  },
  inputMultiline: {
    height: 'auto',
    paddingVertical: spacing.md,
  },
  iconButton: {
    marginLeft: spacing.sm,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
