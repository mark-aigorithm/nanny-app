import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import { OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import { styles } from './styles/registration-step3-screen.styles';

export default function RegistrationStep3Screen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; role?: string }>();

  const phoneDisplay = params.phone ?? '+1 (555) 000-0000';

  const [otp, setOtp] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  const inputRef = useRef<TextInput>(null);

  // Countdown timer
  useEffect(() => {
    if (!isTimerRunning) return;
    if (resendTimer <= 0) {
      setIsTimerRunning(false);
      return;
    }
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, resendTimer]);

  function handleBack() {
    router.back();
  }

  function handleResend() {
    if (resendTimer > 0) return;
    setOtp('');
    setResendTimer(RESEND_SECONDS);
    setIsTimerRunning(true);
  }

  function handleCompleteSetup() {
    if (otp.length < OTP_LENGTH || !termsAccepted) return;
    router.push('/(auth)/notification-permission');
  }

  function handleOtpChange(value: string) {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setOtp(cleaned);
  }

  function formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const canSubmit = otp.length === OTP_LENGTH && termsAccepted;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Fixed header bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.brandText}>NannyMom</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress section */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
            <Text style={styles.completionLabel}>100% Complete</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={styles.progressBarFill} />
          </View>
        </View>

        {/* Headline */}
        <View style={styles.headlineGroup}>
          <Text style={styles.headline}>Verify your phone number</Text>
          <Text style={styles.subtitle}>
            {'We sent a 6-digit code to '}
            <Text style={styles.phoneHighlight}>{phoneDisplay}</Text>
          </Text>
        </View>

        {/* OTP input */}
        <View style={styles.otpSection}>
          {/* Hidden real input */}
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={otp}
            onChangeText={handleOtpChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            caretHidden
          />

          {/* Visual OTP boxes */}
          <Pressable
            style={styles.otpBoxRow}
            onPress={() => inputRef.current?.focus()}
          >
            {Array.from({ length: OTP_LENGTH }).map((_, i) => {
              const isActive = i === otp.length && otp.length < OTP_LENGTH;
              const digit = otp[i] ?? '';
              return (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    isActive && styles.otpBoxActive,
                  ]}
                >
                  {digit !== '' ? (
                    <Text style={styles.otpDigit}>{digit}</Text>
                  ) : isActive ? (
                    <View style={styles.cursor} />
                  ) : null}
                </View>
              );
            })}
          </Pressable>

          {/* Resend row */}
          <View style={styles.resendRow}>
            <Pressable
              onPress={handleResend}
              disabled={resendTimer > 0}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.resendLink,
                  resendTimer > 0 && styles.resendLinkDisabled,
                ]}
              >
                Resend code
              </Text>
            </Pressable>
            {resendTimer > 0 && (
              <Text style={styles.timerText}>in {formatTimer(resendTimer)}</Text>
            )}
          </View>
        </View>

        {/* Terms card */}
        <Pressable
          style={styles.termsCard}
          onPress={() => setTermsAccepted((prev) => !prev)}
        >
          <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
            {termsAccepted && (
              <Ionicons name="checkmark" size={14} color={colors.white} />
            )}
          </View>
          <Text style={styles.termsText}>
            {'I agree to '}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {' and '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </Pressable>

        {/* Complete setup button */}
        <Button
          title="Complete setup"
          onPress={handleCompleteSetup}
          disabled={!canSubmit}
        />
      </ScrollView>
    </View>
  );
}

