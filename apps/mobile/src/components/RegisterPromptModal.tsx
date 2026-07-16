import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Button } from '@mobile/components/ui';
import { APP_NAME } from '@mobile/constants';
import { useRegisterPromptStore } from '@mobile/store/registerPromptStore';
import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  typeScale,
} from '@mobile/theme';

/**
 * Global "create your account" upsell shown when a guest taps an
 * account-only action. Mounted once in the parent layout; opened via
 * `useRegisterPromptStore` (usually through `useGuestGate`).
 */
export default function RegisterPromptModal() {
  const router = useRouter();
  const message = useRegisterPromptStore((s) => s.message);
  const dismissRegisterPrompt = useRegisterPromptStore((s) => s.dismissRegisterPrompt);

  if (message == null) return null;

  const goTo = (href: '/(auth)/role-selection' | '/(auth)/sign-in') => {
    dismissRegisterPrompt();
    router.push(href);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissRegisterPrompt}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={dismissRegisterPrompt} />

        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-add-outline" size={28} color={colors.primary} />
          </View>

          <Text style={styles.title}>Join {APP_NAME}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <Button
              title="Create free account"
              onPress={() => goTo('/(auth)/role-selection')}
              variant="primary"
            />
            <Button
              title="Sign in"
              onPress={() => goTo('/(auth)/sign-in')}
              variant="outline"
            />
            <Button
              title="Keep browsing"
              onPress={dismissRegisterPrompt}
              variant="text"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    backgroundColor: colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    marginBottom: spacing.xs,
  },
  title: {
    ...typeScale.headingSm,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
