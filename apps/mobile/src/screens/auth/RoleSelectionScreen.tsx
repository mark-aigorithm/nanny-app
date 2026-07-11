import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import type { Role } from '@mobile/types';
import { Button } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/role-selection-screen.styles';

export default function RoleSelectionScreen() {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const router = useRouter();
  const patchDraft = useRegistrationDraftStore((s) => s.patch);
  const resetDraft = useRegistrationDraftStore((s) => s.reset);

  function handleContinue() {
    if (!selectedRole) return;
    // Start a fresh draft for this registration attempt and seed the role.
    resetDraft();
    patchDraft({ role: selectedRole });
    router.push({ pathname: '/(auth)/register-step-1', params: { role: selectedRole } });
  }

  function handleSignIn() {
    router.push('/(auth)/sign-in');
  }

  const continueTitle =
    selectedRole === 'parent'
      ? 'Sign up as a mother'
      : selectedRole === 'nanny'
        ? 'Sign up as a nanny'
        : 'Continue';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Decorative background blobs */}
      <View style={styles.blobTopLeft} />
      <View style={styles.blobBottomRight} />

      {/* Main content */}
      <View style={styles.content}>
        <View style={styles.headingGroup}>
          <Text style={styles.headline}>Create your account</Text>
          <Text style={styles.subtitle}>
            Tell us who you are so we can set up the right experience for you.
          </Text>
        </View>

        <View style={styles.cards}>
          <RoleCard
            label="I'm a mother"
            description="I want to find trusted nannies for my children"
            icon="heart-outline"
            role="parent"
            selected={selectedRole === 'parent'}
            onPress={() => setSelectedRole('parent')}
          />
          <RoleCard
            label="I'm a nanny"
            description="I want to offer childcare and earn on my schedule"
            icon="briefcase-outline"
            role="nanny"
            selected={selectedRole === 'nanny'}
            onPress={() => setSelectedRole('nanny')}
          />
        </View>

        {!selectedRole && (
          <Text style={styles.helperText}>Select an option above to sign up</Text>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          title={continueTitle}
          onPress={handleContinue}
          variant="primary"
          fullWidth
          disabled={!selectedRole}
          style={styles.continueButton}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Already have an account?</Text>
          <View style={styles.dividerLine} />
        </View>

        <Button
          title="Sign in"
          onPress={handleSignIn}
          variant="outline"
          fullWidth
        />
      </View>
    </View>
  );
}

// ─── RoleCard ─────────────────────────────────────────────────────────────────

type RoleCardProps = {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  role: Role;
  selected: boolean;
  onPress: () => void;
};

function RoleCard({ label, description, icon, selected, onPress }: RoleCardProps) {
  return (
    <Pressable
      style={[styles.card, selected ? styles.cardSelected : styles.cardUnselected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.cardIcon, selected && styles.cardIconSelected]}>
        <Ionicons
          name={icon}
          size={22}
          color={selected ? colors.primaryDark : colors.textTertiary}
        />
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <View style={[styles.radio, selected ? styles.radioSelected : styles.radioUnselected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </Pressable>
  );
}
