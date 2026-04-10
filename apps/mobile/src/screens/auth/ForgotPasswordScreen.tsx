import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForgotPassword } from '@mobile/hooks/useAuth';

import { colors } from '@mobile/theme';
import { Button, TextInputField, IconCircle } from '@mobile/components/ui';
import { styles } from './styles/forgot-password-screen.styles';

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
        <IconCircle
          icon="mail-outline"
          size="lg"
          backgroundColor={colors.successLight} // one-off green tint — could be added to theme
          iconColor={colors.primaryDark}
          style={styles.iconCircle}
        />

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
              <Ionicons name="checkmark-circle" size={20} color={colors.success} /> {/* one-off success icon color — could be added to theme */}
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
        <TextInputField
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!emailSent}
          containerStyle={styles.inputContainer}
        />

        {/* Send reset link button */}
        <Button
          title={mutation.isPending ? 'Sending\u2026' : 'Send reset link'}
          onPress={handleSendReset}
          variant="primary"
          fullWidth
          disabled={emailSent || mutation.isPending}
          style={styles.ctaButton}
        />

        {/* Error message */}
        {mutation.isError && (
          <Text style={styles.errorText}>
            Something went wrong. Please try again.
          </Text>
        )}
      </View>

      {/* ── Footer: back to sign in ── */}
      <Pressable style={styles.footer} onPress={handleBackToSignIn}>
        <Ionicons name="arrow-back" size={16} color={colors.primary} />
        <Text style={styles.footerText}>Back to sign in</Text>
      </Pressable>
    </View>
  );
}
