import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';

import { colors, fontSizes, radii, spacing } from '@mobile/lib/theme';

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  color?: string;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  color = colors.primary,
  fullWidth = false,
  loading = false,
  disabled = false,
  size = 'md',
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  const height = size === 'sm' ? 40 : size === 'lg' ? 56 : 48;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { height, minHeight: height },
        fullWidth && styles.fullWidth,
        isPrimary && { backgroundColor: color },
        isOutline && { borderWidth: 1.5, borderColor: color },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : color} />
      ) : (
        <Text
          style={[
            styles.label,
            { fontSize: size === 'sm' ? fontSizes.sm : fontSizes.base },
            isPrimary && { color: colors.white },
            (isOutline || variant === 'ghost') && { color },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii['2xl'],
    paddingHorizontal: spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
  label: {
    fontWeight: '700',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
