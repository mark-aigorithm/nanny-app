import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, typeScale, borderRadius, spacing } from '@mobile/theme';

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Rendered after the value, e.g. "h" → "4h". Ignored when `formatValue` is set. */
  suffix?: string;
  /** Full control of the readout, e.g. 270 → "4h 30m". */
  formatValue?: (value: number) => string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Numeric −/+ stepper on a warm pill track. Clamps to [min, max] internally so
 * callers only need to hand it the bounds, not guard every press.
 */
export default function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  suffix = '',
  formatValue,
  size = 'md',
  disabled = false,
  style,
}: StepperProps) {
  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && value < max;

  const btnSize = size === 'md' ? 36 : 30;
  const iconSize = size === 'md' ? 18 : 16;

  const press = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };

  return (
    <View style={[styles.track, style]}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          { width: btnSize, height: btnSize },
          !canDecrement && styles.buttonDisabled,
          pressed && canDecrement && styles.buttonPressed,
        ]}
        onPress={() => press(-step)}
        disabled={!canDecrement}
        hitSlop={4}
      >
        <Ionicons
          name="remove"
          size={iconSize}
          color={canDecrement ? colors.textPrimary : colors.textPlaceholder}
        />
      </Pressable>

      <Text style={[styles.value, size === 'sm' && styles.valueSm]} numberOfLines={1}>
        {formatValue ? formatValue(value) : `${value}${suffix}`}
      </Text>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          { width: btnSize, height: btnSize },
          !canIncrement && styles.buttonDisabled,
          pressed && canIncrement && styles.buttonPressed,
        ]}
        onPress={() => press(step)}
        disabled={!canIncrement}
        hitSlop={4}
      >
        <Ionicons
          name="add"
          size={iconSize}
          color={canIncrement ? colors.textPrimary : colors.textPlaceholder}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.full,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  button: {
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.transparent,
  },
  buttonPressed: {
    backgroundColor: colors.warmSubtle,
  },
  value: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
    minWidth: 68,
    textAlign: 'center',
  },
  valueSm: {
    ...typeScale.labelMd,
    minWidth: 56,
  },
});
