import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForgotPassword } from '@mobile/hooks/useAuth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const mutation = useForgotPassword();

  const handleSendReset = () => {
    mutation.mutate(email, {
      onSuccess: () => {
        setEmailSent(true);
      },
    });
  };

  const handleBackToSignIn = () => {
    router.push('/(auth)/sign-in');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Status bar spacer */}
      <View style={styles.statusBarSpacer} />

      {/* ── Center content ── */}
      <View style={styles.centerContent}>

        {/* Mail icon circle */}
        <View style={styles.iconCircle}>
          <Ionicons name="mail-outline" size={28} color="#556251" />
        </View>

        {/* Headline */}
        <Text style={styles.headline}>Reset your password</Text>

        {/* Body */}
        <Text style={styles.body}>
          Enter your email address and we'll send you a link to get back into
          your account.
        </Text>

        {/* Success banner */}
        {emailSent && (
          <View style={styles.successBanner}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={20} color="#4a8a4a" />
            </View>
            <View style={styles.successTextWrap}>
              <Text style={styles.successTitle}>Check your inbox</Text>
              <Text style={styles.successBody}>
                We've sent a recovery link to your email.
              </Text>
            </View>
          </View>
        )}

        {/* Email input */}
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor="#a89e97"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!emailSent}
        />

        {/* Send reset link button */}
        <Pressable
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && styles.ctaButtonPressed,
            emailSent && styles.ctaButtonDisabled,
          ]}
          onPress={handleSendReset}
          disabled={emailSent || mutation.isPending}
        >
          <Text style={styles.ctaButtonText}>
            {mutation.isPending ? 'Sending…' : 'Send reset link'}
          </Text>
        </Pressable>

        {/* Error message */}
        {mutation.isError && (
          <Text style={styles.errorText}>
            Something went wrong. Please try again.
          </Text>
        )}
      </View>

      {/* ── Footer: back to sign in ── */}
      <Pressable style={styles.footer} onPress={handleBackToSignIn}>
        <Ionicons name="arrow-back" size={16} color="#97a591" />
        <Text style={styles.footerText}>Back to sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingBottom: 48,
  },

  statusBarSpacer: {
    height: 44,
  },

  // ── Center content ────────────────────────────────────────────────────────────
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#d8e7d1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  headline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 24,
    letterSpacing: -0.6,
    color: '#1b1c1b',
    textAlign: 'center',
    lineHeight: 32,
  },

  body: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    lineHeight: 26,
    color: '#444842',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  // Success banner
  successBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#d4e8d4',
    borderWidth: 1,
    borderColor: 'rgba(106,155,106,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  successIconWrap: {
    marginTop: 1,
  },
  successTextWrap: {
    flex: 1,
    gap: 2,
  },
  successTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#2e5e2e',
    lineHeight: 20,
  },
  successBody: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#3d6e3d',
    lineHeight: 18,
  },

  // Email input
  input: {
    width: '100%',
    height: 56,
    backgroundColor: 'rgba(235,221,210,0.5)',
    borderRadius: 12,
    paddingHorizontal: 18,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // CTA button
  ctaButton: {
    width: '100%',
    height: 56,
    borderRadius: 9999,
    backgroundColor: '#97a591',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  ctaButtonPressed: {
    opacity: 0.88,
  },
  ctaButtonDisabled: {
    opacity: 0.55,
  },
  ctaButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#ffffff',
    lineHeight: 24,
  },

  // Error
  errorText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#c0634a',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 16,
  },
  footerText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#97a591',
    lineHeight: 20,
  },
});
