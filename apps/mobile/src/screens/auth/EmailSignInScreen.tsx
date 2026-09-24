import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { Button, TextInputField } from '@mobile/components/ui';
import { useSignInWithEmail } from '@mobile/hooks/useAuth';
import { validateEmail, validateSignInPassword } from '@mobile/lib/validation';
import { styles } from './styles/email-sign-in-screen.styles';

/**
 * The secondary door. Firebase keys a password by email, so this is the only
 * place the address is a credential rather than a contact detail — and the
 * only place "Forgot password?" makes sense. It's also where a Google/Apple
 * user is told how to get a password of her own.
 */
export default function EmailSignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const signIn = useSignInWithEmail();

  function handleSignIn() {
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);

    const emailValidation = validateEmail(email);
    if (emailValidation) {
      setEmailError(emailValidation);
      return;
    }
    const passwordValidation = validateSignInPassword(password);
    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    signIn.mutate(
      { email, password },
      {
        // The hook has already connected a pending Google/Apple identity, if
        // one brought her here and the account proved real.
        onSuccess: () => router.replace('/'),
        onError: (err) => {
          if (err.field === 'password') setPasswordError(err.message);
          else if (err.field === 'email') setEmailError(err.message);
          else setFormError(err.message);
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.headerBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headline}>Sign in with email</Text>
            <Text style={styles.subtitle}>Use the email address on your account.</Text>
          </View>

          <View style={styles.form}>
            <TextInputField
              testID="emailSignIn.email"
              label="Email"
              value={email}
              onChangeText={(val: string) => {
                setEmail(val);
                if (emailError) setEmailError(null);
                if (formError) setFormError(null);
              }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={emailError}
            />
            <TextInputField
              testID="emailSignIn.password"
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
            <View style={styles.passwordMeta}>
              <View />
              <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>
            </View>

            {/* A Google/Apple sign-up has no password until the SMS reset
                creates one on that same account — the email link works too,
                but it unlinks Google/Apple, so this steers her to SMS. */}
            <Text style={styles.socialHint}>
              Signed up with Google or Apple? Use that button, or tap Forgot password and choose "Text me a code" to add a password.
            </Text>
          </View>

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          <Button
            title={signIn.isPending ? 'Signing in…' : 'Sign in'}
            onPress={handleSignIn}
            variant="primary"
            fullWidth
            disabled={signIn.isPending}
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
