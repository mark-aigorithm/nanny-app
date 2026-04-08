import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSignIn } from '@mobile/hooks/useAuth';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const router = useRouter();
  const signIn = useSignIn();

  function handleSignIn() {
    setPasswordError(null);
    signIn.mutate(email, password, {
      onSuccess: () => {
        router.push('/(parent)/home');
      },
      onError: () => {
        setPasswordError('Incorrect password');
      },
    });
  }

  function handleForgotPassword() {
    router.push('/(auth)/forgot-password');
  }

  function handleSignUp() {
    router.push('/(auth)/role-selection');
  }

  const hasPasswordError = passwordError !== null;

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
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor="#b0a89e"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  hasPasswordError && styles.inputWrapperError,
                ]}
              >
                <TextInput
                  style={styles.inputInner}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="••••••••"
                  placeholderTextColor="#b0a89e"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color="#97a591"
                  />
                </Pressable>
              </View>

              {/* Error row */}
              <View style={styles.passwordMeta}>
                {hasPasswordError ? (
                  <Text style={styles.errorText}>Incorrect password</Text>
                ) : (
                  <View />
                )}
                <Pressable onPress={handleForgotPassword} hitSlop={8}>
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Sign in button */}
          <Pressable style={styles.signInButton} onPress={handleSignIn}>
            <Text style={styles.signInButtonText}>Sign in</Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social buttons */}
          <View style={styles.socialButtons}>
            <Pressable style={styles.socialButton}>
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </Pressable>
            <Pressable style={styles.socialButton}>
              <Text style={styles.socialButtonText}>Continue with Apple</Text>
            </Pressable>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },

  // Blobs
  blobTopLeft: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#ebddd2',
    opacity: 0.35,
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#97a591',
    opacity: 0.15,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
    gap: 32,
  },

  // Header
  header: {
    gap: 8,
  },
  headline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 28,
    letterSpacing: -0.7,
    color: '#1b1c1b',
  },
  subtitle: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#444842',
    lineHeight: 24,
  },

  // Form
  form: {
    gap: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#1b1c1b',
  },

  // Plain input (email)
  input: {
    height: 56,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Password input wrapper (for eye toggle)
  inputWrapper: {
    height: 56,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputWrapperError: {
    borderColor: '#c0634a',
  },
  inputInner: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },

  // Password meta row
  passwordMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
  },
  errorText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: '#c0634a',
  },
  forgotLink: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#97a591',
  },

  // Sign in button
  signInButton: {
    height: 56,
    borderRadius: 24,
    backgroundColor: '#97a591',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  signInButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#ffffff',
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e3d5ca',
  },
  dividerText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#97a591',
  },

  // Social buttons
  socialButtons: {
    gap: 12,
  },
  socialButton: {
    height: 56,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e3d5ca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Footer
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLabel: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#444842',
  },
  footerLink: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#556251',
  },
});
