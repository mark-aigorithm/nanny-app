import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import TextInputField from '@mobile/components/ui/text-input';
import Button from '@mobile/components/ui/button';
import { styles } from './styles/create-password-screen.styles';

type Requirement = {
  key: string;
  label: string;
  met: boolean;
};

export default function CreatePasswordScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const requirements: Requirement[] = [
    {
      key: 'length',
      label: 'At least 8 characters',
      met: password.length >= 8,
    },
    {
      key: 'uppercase',
      label: 'Contains an uppercase letter',
      met: /[A-Z]/.test(password),
    },
    {
      key: 'number',
      label: 'Contains a number',
      met: /\d/.test(password),
    },
    {
      key: 'match',
      label: 'Passwords match',
      met: password.length > 0 && password === confirmPassword,
    },
  ];

  const canContinue = requirements.every((r) => r.met);

  function handleBack() {
    router.back();
  }

  function handleContinue() {
    if (!canContinue) return;
    router.push({ pathname: '/(auth)/register-step-2', params: { role } });
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Fixed header bar */}
        <View style={styles.headerBar}>
          <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Create account</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarTrack}>
          <View style={styles.progressBarFill} />
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step label */}
          <Text style={styles.stepLabel}>STEP 2 OF 4 — SET PASSWORD</Text>

          {/* Intro */}
          <View style={styles.introGroup}>
            <Text style={styles.headline}>Create a secure password</Text>
            <Text style={styles.subtitle}>
              Choose a password you&apos;ll remember. You&apos;ll use it to sign in to
              your account.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <TextInputField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter a password"
              placeholderTextColor={colors.textPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
            />

            <TextInputField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter your password"
              placeholderTextColor={colors.textPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
            />

            {/* Requirements checklist */}
            <View style={styles.requirementsCard}>
              <Text style={styles.requirementsTitle}>Your password must include:</Text>
              {requirements.map((req) => (
                <View key={req.key} style={styles.requirementRow}>
                  <Ionicons
                    name={req.met ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={req.met ? colors.success : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.requirementText,
                      req.met && styles.requirementTextMet,
                    ]}
                  >
                    {req.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Button title="Continue" onPress={handleContinue} disabled={!canContinue} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
