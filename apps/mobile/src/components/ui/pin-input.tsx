import React, { useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

import { colors, fontFamily, borderRadius, spacing } from '@mobile/theme';

interface PinInputProps {
  value: string;
  onChangeText: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  error?: boolean;
  /** Called once the last digit is entered. */
  onComplete?: (value: string) => void;
}

/**
 * Segmented numeric PIN entry. A single hidden numeric TextInput drives the
 * value; the visible cells render each digit. Tapping anywhere refocuses the
 * input so the keypad reopens.
 */
export default function PinInput({
  value,
  onChangeText,
  length = 4,
  autoFocus = true,
  error = false,
  onComplete,
}: PinInputProps) {
  const inputRef = useRef<TextInput>(null);
  const cells = Array.from({ length });

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, length);
    onChangeText(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  const focusedIndex = Math.min(value.length, length - 1);

  return (
    <Pressable
      style={styles.row}
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
    >
      {cells.map((_, i) => {
        const filled = i < value.length;
        const isFocused = i === focusedIndex;
        return (
          <View
            key={i}
            style={[
              styles.cell,
              isFocused && styles.cellFocused,
              error && styles.cellError,
            ]}
          >
            <Text style={styles.cellText}>{filled ? value[i] : ''}</Text>
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        // Off-screen but focusable — drives the visible cells above.
        style={styles.hiddenInput}
        caretHidden
        accessibilityLabel={`${length}-digit PIN`}
      />
    </Pressable>
  );
}

const CELL_SIZE = 60;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.taupeLight,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  cellError: {
    borderColor: colors.error,
  },
  cellText: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    color: colors.textPrimary,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
