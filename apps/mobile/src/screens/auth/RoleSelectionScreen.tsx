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
import { Button, Divider } from '@mobile/components/ui';
import SocialAuthButtons from '@mobile/components/SocialAuthButtons';
import { useDiscardUnfinishedAccount } from '@mobile/hooks/useAuth';
import { colors } from '@mobile/theme';
import { SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/role-selection-screen.styles';

export default function RoleSelectionScreen() {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const router = useRouter();
  const patchDraft = useRegistrationDraftStore((s) => s.patch);
  const resetDraft = useRegistrationDraftStore((s) => s.reset);
  // Arrived from "Continue with Google/Apple" on sign-in as a new person: she
  // is already signed in with that provider and her draft holds what it gave.
  const authProvider = useRegistrationDraftStore((s) => s.authProvider);
  const draftEmail = useRegistrationDraftStore((s) => s.email);
  // Or arrived from the app root with an account that has no row yet — a
  // sign-up that stopped part-way; the draft was seeded from that account.
  const isResume = useRegistrationDraftStore((s) => s.isResume);
  const countryCode = useRegistrationDraftStore((s) => s.countryCode);
  const phone = useRegistrationDraftStore((s) => s.phone);
  const isSocial = authProvider !== 'phone';
  const isAccountBacked = isSocial || isResume;
  const discardUnfinishedAccount = useDiscardUnfinishedAccount();

  function handleContinue() {
    if (!selectedRole) return;
    if (isAccountBacked) {
      // Keep what the signed-in account supplied; only the role is new.
      patchDraft({ role: selectedRole });
    } else {
      // Start a fresh draft for this registration attempt and seed the role.
      resetDraft();
      patchDraft({ role: selectedRole });
    }
    router.push({ pathname: '/(auth)/register-step-1', params: { role: selectedRole } });
  }

  function handleSignIn() {
    // Sign-in is the front door, so it is already underneath — go back to it.
    router.dismissTo('/(auth)/sign-in');
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
          <Text style={styles.headline}>
            {isResume ? 'Finish setting up your account' : 'Create your account'}
          </Text>
          <Text style={styles.subtitle}>
            {isResume
              ? `Signed in as ${draftEmail || `${countryCode} ${phone}`}. Tell us who you are to finish setting up.`
              : isSocial
                ? `Signed in with ${SOCIAL_PROVIDER_LABEL[authProvider]} as ${draftEmail}. Tell us who you are to finish setting up.`
                : 'Tell us who you are so we can set up the right experience for you.'}
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

        {isAccountBacked ? (
          // A way back to the phone sign-up (and the other provider) for
          // someone signed in to an account without a row who meant another
          // method. The server deletes the account only if no row points at it.
          <Pressable
            style={styles.differentMethodRow}
            onPress={() => discardUnfinishedAccount.mutate()}
            disabled={discardUnfinishedAccount.isPending}
            hitSlop={8}
          >
            <Text style={styles.differentMethodLink}>Use a different sign-up method</Text>
          </Pressable>
        ) : (
          <View style={styles.socialSection}>
            <Divider label="or" />
            <SocialAuthButtons
              context="sign-up"
              role={selectedRole ?? undefined}
              disabled={!selectedRole}
            />
          </View>
        )}

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
