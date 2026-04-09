import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 42;

export default function RegistrationStep3Screen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; role?: string }>();

  const phoneDisplay = params.phone ?? '+1 (555) 000-0000';
  const role = params.role ?? 'parent';

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
    router.push('/(auth)/notification-permission' as never);
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
            <Ionicons name="arrow-back" size={22} color="#1b1c1b" />
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
              <Ionicons name="checkmark" size={14} color="#ffffff" />
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
        <Pressable
          style={[styles.completeButton, !canSubmit && styles.completeButtonDisabled]}
          onPress={handleCompleteSetup}
          disabled={!canSubmit}
        >
          <Text style={styles.completeButtonText}>Complete setup</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_CONTENT_HEIGHT = 56;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },

  // Header bar
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: 16,
    height: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    backgroundColor: '#fdfaf8',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    color: '#97a591',
    letterSpacing: -0.5,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT + 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 56 : 40,
    gap: 32,
  },

  // Progress section
  progressSection: {
    gap: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepLabel: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    letterSpacing: 0.65,
    color: '#7a7a7a',
    textTransform: 'uppercase',
  },
  completionLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#97a591',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#e3d5ca',
    borderRadius: 3,
  },
  progressBarFill: {
    width: '100%',
    height: 6,
    backgroundColor: '#97a591',
    borderRadius: 3,
  },

  // Headline
  headlineGroup: {
    gap: 8,
  },
  headline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 28,
    color: '#1b1c1b',
    letterSpacing: -0.7,
  },
  subtitle: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#444842',
    lineHeight: 24,
  },
  phoneHighlight: {
    fontFamily: 'Manrope_700Bold',
    color: '#1b1c1b',
  },

  // OTP section
  otpSection: {
    gap: 16,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  otpBoxRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  otpBox: {
    width: 48,
    height: 56,
    backgroundColor: '#ebddd2',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  otpBoxActive: {
    borderColor: '#97a591',
  },
  otpDigit: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
    color: '#1b1c1b',
  },
  cursor: {
    width: 2,
    height: 22,
    backgroundColor: '#97a591',
    borderRadius: 1,
  },

  // Resend row
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resendLink: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#97a591',
  },
  resendLinkDisabled: {
    color: '#b0a89e',
  },
  timerText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    color: '#747871',
  },

  // Terms card
  termsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: 'rgba(235,221,210,0.5)',
    borderRadius: 16,
    padding: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#c4b5a8',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#97a591',
    borderColor: '#97a591',
  },
  termsText: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#444842',
    lineHeight: 22,
  },
  termsLink: {
    fontFamily: 'Manrope_600SemiBold',
    color: '#556251',
  },

  // Complete setup button
  completeButton: {
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
  completeButtonDisabled: {
    backgroundColor: '#c4d0c1',
    shadowOpacity: 0,
    elevation: 0,
  },
  completeButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#ffffff',
  },
});
