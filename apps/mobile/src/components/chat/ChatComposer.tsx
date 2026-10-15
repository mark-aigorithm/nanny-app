import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TextInput } from '@mobile/components/ui/text';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useKeyboardVisible } from '@mobile/hooks/useKeyboardVisible';
import { colors, spacing } from '@mobile/theme';
import { styles } from './chat.styles';

interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder?: string;
  maxLength?: number;
}

/**
 * The message box pinned under a chat. The keyboard covers the system bar, so
 * it clears that bar only while the keyboard is down.
 */
export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sending,
  placeholder = 'Write a message...',
  maxLength,
}: ChatComposerProps) {
  const keyboardVisible = useKeyboardVisible();
  const restingPadding = useBottomBarPadding(spacing.md);
  const canSend = value.trim().length > 0 && !sending;

  return (
    <View style={[styles.footer, { paddingBottom: keyboardVisible ? spacing.sm : restingPadding }]}>
      <TextInput
        testID="chatThread.message"
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        value={value}
        onChangeText={onChangeText}
        multiline
        maxLength={maxLength}
        editable={!sending}
        accessibilityLabel="Message"
      />
      <Pressable
        testID="chatThread.send"
        style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
        onPress={() => {
          if (canSend) onSend();
        }}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
      >
        <Ionicons name="send" size={20} color={colors.white} />
      </Pressable>
    </View>
  );
}
