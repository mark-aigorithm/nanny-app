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

import { Button, TextInputField, Divider } from '@mobile/components/ui';
import { styles } from './styles/sign-in-screen.styles';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const router = useRouter();
  const signIn = useSignIn();

  function handleSignIn() {
    setPasswordError(null);
    // TODO: Replace with real Firebase auth once backend is ready
    router.replace('/(parent)/home');
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
              onChangeText={setEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Password field */}
            <View style={styles.fieldGroup}>
              <TextInputField
                label="Password"
                value={password}
                onChangeText={(val: string) => {
                  setPassword(val);
                  if (passwordError) setPasswordError(null);
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

          {/* Sign in button */}
          <Button
            title="Sign in"
            onPress={handleSignIn}
            variant="primary"
            fullWidth
          />

          {/* Divider */}
          <Divider label="or" />

          {/* Social buttons */}
          <View style={styles.socialButtons}>
            <Button
              title="Continue with Google"
              onPress={() => {}}
              variant="outline"
              fullWidth
              style={styles.socialButton}
            />
            <Button
              title="Continue with Apple"
              onPress={() => {}}
              variant="outline"
              fullWidth
              style={styles.socialButton}
            />
          </View>

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
