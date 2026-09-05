import React, { useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

import { OTP_LENGTH } from '@mobile/constants';
import { colors, borderRadius, fontFamily, spacing } from '@mobile/theme';

interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Number of boxes; defaults to the app-wide OTP_LENGTH. */
  length?: number;
  /** Grey the boxes out while a code is being checked. */
  disabled?: boolean;
  testID?: string;
}

/**
 * The row of single-digit boxes used wherever a one-time code is entered —
 * the wizard's email verification step and the forced verify screen an older
 * account lands on.
 *
 * There is one real `TextInput`, hidden offscreen and holding the whole code;
 * the boxes are just a drawing of its value. That is what lets the caret,
 * autofill and the number pad behave normally while the boxes stay purely
 * presentational — per-box inputs fight the keyboard over focus.
 */
export default function OtpCodeInput({
  value,
  onChange,
  length = OTP_LENGTH,
  disabled = false,
  testID,
}: OtpCodeInputProps) {
  const inputRef = useRef<TextInput>(null);

  function handleChange(next: string) {
    onChange(next.replace(/[^0-9]/g, '').slice(0, length));
  }

  return (
    <View>
      <TextInput
        testID={testID}
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        editable={!disabled}
        caretHidden
      />

      <Pressable
        // The real input is offscreen and 1×1, so Android prunes it from the
        // accessibility tree and a device driver (Maestro) cannot find it by
        // `testID` to focus it. The visible boxes are what a person taps, so
        // they carry a findable id too — tapping them focuses the input, and
        // typed text lands in the hidden field the same way.
        testID={testID ? `${testID}.boxes` : undefined}
        style={styles.boxRow}
        onPress={() => inputRef.current?.focus()}
        disabled={disabled}
      >
        {Array.from({ length }).map((_, i) => {
          const isActive = i === value.length && value.length < length;
          const digit = value[i] ?? '';
          return (
            <View key={i} style={[styles.box, isActive && styles.boxActive]}>
              {digit !== '' ? (
                <Text style={styles.digit}>{digit}</Text>
              ) : isActive ? (
                <View style={styles.cursor} />
              ) : null}
            </View>
          );
        })}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  boxRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  box: {
    width: 48,
    height: 56,
    backgroundColor: colors.warmBorder,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.transparent,
  },
  boxActive: {
    borderColor: colors.primary,
  },
  digit: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  cursor: {
    width: 2,
    height: 22,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
});
