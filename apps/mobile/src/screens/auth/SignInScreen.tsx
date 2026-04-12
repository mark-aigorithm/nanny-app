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
import { useRouter } from 'expo-router';

import { useSignIn } from '@mobile/hooks/useAuth';
import { validateEmailAndPassword } from '@mobile/lib/validation';
import { Button, TextInputField } from '@mobile/components/ui';
import { styles } from './styles/sign-in-screen.styles';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const router = useRouter();
  const signIn = useSignIn();

  function clearErrors() {
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
  }

  function handleSignIn() {
    clearErrors();

    const validation = validateEmailAndPassword(email, password);
    if (validation.email) {
      setEmailError(validation.email);
      return;
    }
    if (validation.password) {
      setPasswordError(validation.password);
      return;
    }

    signIn.mutate(
      { email, password },
      {
        onSuccess: () => {
          // Bounce through the root gate so it can wait for /auth/me and
          // route based on profile state (handles orphan-session + role).
          router.replace('/');
        },
        onError: (err) => {
          if (err.field === 'email') setEmailError(err.message);
          else if (err.field === 'password') setPasswordError(err.message);
          else setFormError(err.message);
        },
      },
    );
  }

  function handleForgotPassword() {
    router.push('/(auth)/forgot-password');
  }

  function handleSignUp() {
    router.push('/(auth)/role-selection');
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Decorative glow blobs */}
        <View style={styles.blobTopLeft} />
        <View style={styles.blobBottomRight} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headline}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Sign in to continue your childcare journey.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email field */}
            <TextInputField
              label="Email"
              value={email}
              onChangeText={(val: string) => {
                setEmail(val);
                if (emailError) setEmailError(null);
                if (formError) setFormError(null);
              }}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={emailError}
            />

            {/* Password field */}
            <View style={styles.fieldGroup}>
              <TextInputField
                label="Password"
                value={password}
                onChangeText={(val: string) => {
                  setPassword(val);
                  if (passwordError) setPasswordError(null);
                  if (formError) setFormError(null);
                }}
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                error={passwordError}
              />

              {/* Forgot password link */}
              <View style={styles.passwordMeta}>
                <View />
                <Pressable onPress={handleForgotPassword} hitSlop={8}>
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Form-level error banner */}
          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          {/* Sign in button */}
          <Button
            title={signIn.isPending ? 'Signing in\u2026' : 'Sign in'}
            onPress={handleSignIn}
            variant="primary"
            fullWidth
            disabled={signIn.isPending}
          />

          {/* Footer */}
          <Pressable style={styles.footerRow} onPress={handleSignUp}>
            <Text style={styles.footerLabel}>Don't have an account? </Text>
            <Text style={styles.footerLink}>Sign up</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
