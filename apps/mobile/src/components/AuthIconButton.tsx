import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { PressableScale } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { styles } from './styles/auth-icon-button.styles';

type AuthIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Read out in place of a visible label — and what E2E flows tap by. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

/**
 * One tile in the sign-in screen's "or continue with" row: a logo, no text.
 * The tiles share the row equally, so two (Android) or three (iOS, with
 * Apple) stay the same height as the primary button above them.
 */
export default function AuthIconButton({ icon, label, onPress, disabled = false, testID }: AuthIconButtonProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.tile, disabled && styles.tileDisabled]}
    >
      <Ionicons name={icon} size={22} color={colors.textPrimary} />
    </PressableScale>
  );
}
