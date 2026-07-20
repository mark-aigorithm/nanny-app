import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useValidateReferralCode } from '@mobile/hooks/useReferrals';
import {
  colors,
  fontFamily,
  spacing,
  borderRadius as br,
  typeScale,
} from '@mobile/theme';

interface Props {
  value: string;
  onChange: (code: string) => void;
}

/**
 * Optional referral code entry on the final signup step. Collapsed behind a
 * text prompt so it never competes with the primary flow, and validated live
 * once something is typed — the validate endpoint is optional-auth precisely
 * so this can run before the account exists.
 */
export default function ReferralCodeField({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(value.length > 0);
  const check = useValidateReferralCode(value);

  if (!expanded) {
    return (
      <Pressable
        style={styles.prompt}
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
      >
        <Ionicons name="gift-outline" size={16} color={colors.primaryDark} />
        <Text style={styles.promptText}>Have a referral code?</Text>
      </Pressable>
    );
  }

  const trimmed = value.trim();
  const result = check.data;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Referral code (optional)</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) => onChange(text.toUpperCase())}
          placeholder="SARAH-4K2P"
          placeholderTextColor={colors.textPlaceholder}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={32}
        />
        {trimmed.length > 0 && check.isFetching && <ActivityIndicator color={colors.primary} />}
        {trimmed.length > 0 && !check.isFetching && result?.valid && (
          <Ionicons name="checkmark-circle" size={20} color={colors.successDark} />
        )}
      </View>

      {trimmed.length > 0 && !check.isFetching && result?.valid && (
        <Text style={styles.successText}>
          Invited by {result.referrerFirstName} — you’ll start with {result.refereePoints} Care
          Points.
        </Text>
      )}
      {trimmed.length > 0 && !check.isFetching && result && !result.valid && (
        <Text style={styles.errorText}>
          We don’t recognise that code. You can still finish signing up without it.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  promptText: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
  },
  wrap: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: br.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warmBorder,
  },
  label: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: br.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.warmBorder,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    letterSpacing: 1,
    color: colors.textPrimary,
    padding: 0,
  },
  successText: {
    ...typeScale.bodySm,
    color: colors.successDark,
  },
  errorText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
});
