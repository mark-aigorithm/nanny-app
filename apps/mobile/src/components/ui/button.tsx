import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from './text';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamily, borderRadius, shadows, spacing } from '@mobile/theme';
import PressableScale from './pressable-scale';

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
  /** Read after the label, e.g. why a disabled button is disabled. */
  accessibilityHint?: string;
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primaryAction, text: colors.onPrimaryAction },
  secondary: { bg: colors.warmBorder, text: colors.textPrimary },
  // The sage `primary` is 2.49:1 on cream, so an outline label read as disabled.
  outline: { bg: colors.transparent, text: colors.primaryDark, border: colors.primaryDark },
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
  accessibilityHint,
}: ButtonProps) {
  // A disabled primary gets its own neutral fill and label instead of a faded
  // sage one, which looked almost the same as enabled. Others still fade.
  // A form that is submitting passes `disabled` and `loading` together; that is
  // busy, not unavailable, so it keeps the enabled fill behind the spinner.
  const primaryDisabled = variant === 'primary' && disabled && !loading;
  const variantStyle = primaryDisabled
    ? { bg: colors.actionDisabled, text: colors.onActionDisabled, border: undefined }
    : VARIANT_STYLES[variant];
  const minHeight = size === 'md' ? 56 : 40;
  const fontSize = size === 'md' ? 16 : 14;
  const iconSize = size === 'md' ? 20 : 16;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      // While loading the label is a spinner; the button keeps its name.
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      haptic={variant === 'primary' || variant === 'destructive' ? 'tap' : undefined}
      style={[
        styles.base,
        {
          minHeight,
          backgroundColor: variantStyle.bg,
          opacity: disabled && variant !== 'primary' ? 0.5 : 1,
        },
        variantStyle.border ? { borderWidth: 1.5, borderColor: variantStyle.border } : undefined,
        variant === 'primary' && !primaryDisabled ? shadows.md : undefined,
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
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.xl,
    // A long label wraps (narrow phone, large text) and the button grows with it.
    paddingVertical: spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    fontFamily: fontFamily.bold,
    flexShrink: 1,
    textAlign: 'center',
  },
});
