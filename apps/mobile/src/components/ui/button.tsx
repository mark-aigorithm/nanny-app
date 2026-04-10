import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamily, borderRadius, shadows, spacing } from '@mobile/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text' | 'destructive';
type ButtonSize = 'md' | 'sm';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary, text: colors.white },
  secondary: { bg: colors.warmBorder, text: colors.textPrimary },
  outline: { bg: colors.transparent, text: colors.primary, border: colors.primary },
  text: { bg: colors.transparent, text: colors.primaryDark },
  destructive: { bg: colors.error, text: colors.white },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
}: ButtonProps) {
  const variantStyle = VARIANT_STYLES[variant];
  const height = size === 'md' ? 56 : 40;
  const fontSize = size === 'md' ? 16 : 14;
  const iconSize = size === 'md' ? 20 : 16;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: variantStyle.bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        variantStyle.border ? { borderWidth: 1.5, borderColor: variantStyle.border } : undefined,
        variant === 'primary' ? shadows.md : undefined,
        fullWidth ? styles.fullWidth : undefined,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons
              name={icon}
              size={iconSize}
              color={variantStyle.text}
              style={{ marginRight: spacing.sm }}
            />
          )}
          <Text
            style={[
              styles.label,
              { color: variantStyle.text, fontSize },
            ]}
          >
            {title}
          </Text>
          {icon && iconPosition === 'right' && (
            <Ionicons
              name={icon}
              size={iconSize}
              color={variantStyle.text}
              style={{ marginLeft: spacing.sm }}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.xl,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    fontFamily: fontFamily.bold,
  },
});
