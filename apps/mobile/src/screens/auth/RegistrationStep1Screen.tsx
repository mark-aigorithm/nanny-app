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

export default function RegistrationStep1Screen() {
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  function handleBack() {
    router.back();
  }

  function handleContinue() {
    router.push('/(auth)/register-step-2' as any);
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
            <Ionicons name="arrow-back" size={22} color="#1b1c1b" />
          </Pressable>
          <Text style={styles.headerTitle}>Create account</Text>
          {/* Spacer to center the title */}
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
          <Text style={styles.stepLabel}>STEP 1 OF 3 — PERSONAL INFO</Text>

          {/* Photo picker */}
          <View style={styles.photoSection}>
            <Pressable style={styles.avatarCircle} onPress={() => {}}>
              {photo ? null : (
                <Ionicons name="camera-outline" size={28} color="#6b6158" />
              )}
            </Pressable>
            <Pressable onPress={() => {}}>
              <Text style={styles.addPhotoLink}>Add photo</Text>
            </Pressable>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* First name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>First name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter your first name"
                placeholderTextColor="#b0a89e"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* Last name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Last name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter your last name"
                placeholderTextColor="#b0a89e"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="hello@example.com"
                placeholderTextColor="#b0a89e"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>+1</Text>
                  <Ionicons name="chevron-down" size={14} color="#6b6158" />
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(555) 000-0000"
                  placeholderTextColor="#b0a89e"
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Date of birth */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date of birth</Text>
              <View style={styles.iconInputWrapper}>
                <TextInput
                  style={styles.iconInputInner}
                  value={dob}
                  onChangeText={setDob}
                  placeholder="mm/dd/yyyy"
                  placeholderTextColor="#b0a89e"
                  keyboardType="numeric"
                  autoCorrect={false}
                />
                <Ionicons name="calendar-outline" size={20} color="#97a591" />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Pressable style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 56;
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
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
    paddingBottom: 12,
    backgroundColor: '#fdfaf8',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    color: '#1b1c1b',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 36,
  },

  // Progress bar
  progressBarTrack: {
    position: 'absolute',
    top: STATUS_BAR_HEIGHT + HEADER_HEIGHT,
    left: 0,
    right: 0,
    zIndex: 100,
    height: 6,
    backgroundColor: '#e3d5ca',
  },
  progressBarFill: {
    width: '33%',
    height: 6,
    backgroundColor: '#97a591',
    borderRadius: 3,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: STATUS_BAR_HEIGHT + HEADER_HEIGHT + 6 + 24,
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 24,
  },

  // Step label
  stepLabel: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    letterSpacing: 0.65,
    color: '#7a7a7a',
    textTransform: 'uppercase',
  },

  // Photo picker
  photoSection: {
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e3d5ca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoLink: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#556251',
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
    color: '#444842',
  },

  // Plain input
  input: {
    height: 56,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Phone row
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    height: 56,
  },
  countryCodeBox: {
    width: 64,
    height: 56,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  countryCodeText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
    color: '#1b1c1b',
  },
  phoneInput: {
    flex: 1,
    height: 56,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Icon input (date of birth)
  iconInputWrapper: {
    height: 56,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  iconInputInner: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    backgroundColor: '#fdfaf8',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e3d5ca',
  },
  continueButton: {
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
  continueButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#ffffff',
  },
});
