import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import type {
  TextInputProps as RNTextInputProps,
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
  inputStyle?: StyleProp<ViewStyle>;
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
      <View style={[styles.inputContainer, error ? styles.inputError : undefined]}>
        <TextInput
          style={[styles.input, inputStyle]}
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
