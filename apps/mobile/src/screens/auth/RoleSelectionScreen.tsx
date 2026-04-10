import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@mobile/components/ui';
import { styles } from './styles/role-selection-screen.styles';

type Role = 'parent' | 'nanny';

export default function RoleSelectionScreen() {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const router = useRouter();

  function handleContinue() {
    if (!selectedRole) return;
    router.push({ pathname: '/(auth)/register-step-1', params: { role: selectedRole } });
  }

  function handleSignIn() {
    router.push('/(auth)/sign-in');
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Decorative background blobs */}
      <View style={styles.blobTopLeft} />
      <View style={styles.blobBottomRight} />

      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.headline}>I am a...</Text>

        <View style={styles.cards}>
          <RoleCard
            label="I'm a mother"
            role="parent"
            selected={selectedRole === 'parent'}
            onPress={() => setSelectedRole('parent')}
          />
          <RoleCard
            label="I'm a nanny"
            role="nanny"
            selected={selectedRole === 'nanny'}
            onPress={() => setSelectedRole('nanny')}
          />
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          title="Continue"
          onPress={handleContinue}
          variant="primary"
          fullWidth
          disabled={!selectedRole}
          style={styles.continueButton}
        />

        <Pressable style={styles.signInRow} onPress={handleSignIn}>
          <Text style={styles.signInLabel}>Already have an account? </Text>
          <Text style={styles.signInLink}>Sign in</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── RoleCard ─────────────────────────────────────────────────────────────────

type RoleCardProps = {
  label: string;
  role: Role;
  selected: boolean;
  onPress: () => void;
};

function RoleCard({ label, selected, onPress }: RoleCardProps) {
  return (
    <Pressable
      style={[styles.card, selected ? styles.cardSelected : styles.cardUnselected]}
      onPress={onPress}
    >
      <Text style={styles.cardLabel}>{label}</Text>
      <View style={[styles.radio, selected ? styles.radioSelected : styles.radioUnselected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </Pressable>
  );
}

