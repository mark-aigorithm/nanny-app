import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';

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
        <Pressable
          style={[styles.continueButton, !selectedRole && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!selectedRole}
        >
          <View style={styles.gradient}>
            <Text style={styles.continueText}>Continue</Text>
          </View>
        </Pressable>

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },

  // Blobs
  blobTopLeft: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#ebddd2',
    opacity: 0.4,
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#97a591',
    opacity: 0.18,
  },

  // Content
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 40,
  },
  headline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 28,
    letterSpacing: -0.7,
    color: '#1b1c1b',
    textAlign: 'center',
  },
  cards: {
    gap: 16,
  },

  // Role card
  card: {
    height: 72,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  cardSelected: {
    borderColor: '#97a591',
  },
  cardUnselected: {
    borderColor: '#ebddd2',
  },
  cardLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Radio
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#97a591',
  },
  radioUnselected: {
    borderColor: '#ebddd2',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#97a591',
  },

  // Footer
  footer: {
    gap: 24,
    alignItems: 'center',
  },
  continueButton: {
    width: '100%',
    height: 56,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#556251',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#97a591',
  },
  continueText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#ffffff',
  },

  // Sign in footer
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signInLabel: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#444842',
  },
  signInLink: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#556251',
  },
});
