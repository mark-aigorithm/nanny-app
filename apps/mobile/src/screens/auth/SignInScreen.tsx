import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { useSignIn } from '@mobile/hooks/useAuth';
import {
  validatePhone,
  validatePassword,
  toE164,
  phoneToPlaceholderEmail,
} from '@mobile/lib/validation';
import { Button, TextInputField } from '@mobile/components/ui';
import { styles } from './styles/sign-in-screen.styles';

export default function SignInScreen() {
  const [countryCode] = useState('+20');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const router = useRouter();
  const signIn = useSignIn();

  function clearErrors() {
    setPhoneError(null);
    setPasswordError(null);
    setFormError(null);
  }

  function handleSignIn() {
    clearErrors();

    const phoneValidation = validatePhone(phone);
    if (phoneValidation) {
      setPhoneError(phoneValidation);
      return;
    }
    const passwordValidation = validatePassword(password);
    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    // Sign-up is phone-only, backed by a phone-derived placeholder email in
    // Firebase — sign in against that same synthesized credential.
    const email = phoneToPlaceholderEmail(toE164(countryCode, phone));

    signIn.mutate(
      { email, password },
      {
        onSuccess: () => {
          // Bounce through the root gate so it can wait for /auth/me and
          // route based on profile state (handles orphan-session + role).
          router.replace('/');
        },
        onError: (err) => {
          if (err.field === 'password') setPasswordError(err.message);
          else if (err.field === 'phone') setPhoneError(err.message);
          // 'email'/'form' fields have no dedicated input here (phone-only
          // sign-in), so surface them as a form-level error.
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
            {/* Phone field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>{countryCode}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={(val: string) => {
                    setPhone(val);
                    if (phoneError) setPhoneError(null);
                    if (formError) setFormError(null);
                  }}
                  placeholder="(555) 000-0000"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
              {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
            </View>

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
            title={signIn.isPending ? 'Signing in…' : 'Sign in'}
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
