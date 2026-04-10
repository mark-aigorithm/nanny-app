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
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import TextInputField from '@mobile/components/ui/text-input';
import Button from '@mobile/components/ui/button';
import { styles } from './styles/registration-step1-screen.styles';

export default function RegistrationStep1Screen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

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
    router.push({ pathname: '/(auth)/register-step-2', params: { role } });
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
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
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
                <Ionicons name="camera-outline" size={28} color={colors.textTertiary} />
              )}
            </Pressable>
            <Pressable onPress={() => {}}>
              <Text style={styles.addPhotoLink}>Add photo</Text>
            </Pressable>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* First name */}
            <TextInputField
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Enter your first name"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Last name */}
            <TextInputField
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Enter your last name"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Email */}
            <TextInputField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="hello@example.com"
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>+1</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(555) 000-0000"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Date of birth */}
            <TextInputField
              label="Date of birth"
              value={dob}
              onChangeText={setDob}
              placeholder="mm/dd/yyyy"
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="numeric"
              autoCorrect={false}
              rightIcon={
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              }
            />
          </View>
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Button title="Continue" onPress={handleContinue} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

