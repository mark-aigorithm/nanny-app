import React, { useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';

import { Button } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { useE2eGooglePickerStore } from '@mobile/store/e2eGooglePickerStore';
import { styles } from './styles/e2e-google-picker-host.styles';

/**
 * The E2E lab's stand-in for Google's account sheet. The root layout mounts it
 * only when the app points at the Auth emulator (lib/socialAuth.ts
 * `isAuthEmulator`), so no real build ever renders it. A Maestro flow types an
 * address here the way a person would pick an account.
 */
export default function E2eGooglePickerHost() {
  const pending = useE2eGooglePickerStore((s) => s.pending);
  const settle = useE2eGooglePickerStore((s) => s.settle);
  const [email, setEmail] = useState('');

  function finish(value: string | null) {
    setEmail('');
    settle(value);
  }

  return (
    <Modal visible={pending} transparent animationType="fade" onRequestClose={() => finish(null)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Choose a test Google account</Text>
          <TextInput
            testID="e2eGooglePicker.email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            placeholderTextColor={colors.textPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Button
            title="Use this Google account"
            onPress={() => finish(email.trim() || null)}
            fullWidth
            disabled={!email.trim()}
          />
          <Button title="Cancel" variant="text" onPress={() => finish(null)} fullWidth />
        </View>
      </View>
    </Modal>
  );
}
