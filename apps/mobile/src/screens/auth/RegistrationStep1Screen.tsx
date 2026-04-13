import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Image,
  Alert,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import TextInputField from '@mobile/components/ui/text-input';
import Button from '@mobile/components/ui/button';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { validateEmail, validatePhone } from '@mobile/lib/validation';
import { styles } from './styles/registration-step1-screen.styles';

/** Format a Date as 'mm/dd/yyyy' — the storage format expected by step 3. */
function formatDob(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Parse 'mm/dd/yyyy' back to a Date; returns a sensible default on bad input. */
function parseDob(str: string): Date {
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return new Date(new Date().getFullYear() - 25, 0, 1);
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

const MAX_DOB = new Date();
const MIN_DOB = new Date(new Date().getFullYear() - 100, 0, 1);

export default function RegistrationStep1Screen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);

  const [formError, setFormError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => parseDob(draft.dob));

  function handleBack() {
    router.back();
  }

  function openDatePicker() {
    setTempDate(parseDob(draft.dob));
    setShowDatePicker(true);
  }

  function handleAndroidDateChange(event: DateTimePickerEvent, date?: Date) {
    // On Android the picker is a modal dialog that dismisses itself on
    // either "set" (user tapped OK) or "dismissed" (cancel / tap-outside).
    setShowDatePicker(false);
    if (event.type === 'set' && date) {
      patch({ dob: formatDob(date) });
      if (formError) setFormError(null);
    }
  }

  function handleIosDateChange(_event: DateTimePickerEvent, date?: Date) {
    if (date) setTempDate(date);
  }

  function confirmIosDate() {
    patch({ dob: formatDob(tempDate) });
    setShowDatePicker(false);
    if (formError) setFormError(null);
  }

  async function handlePickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Please allow photo library access to pick a profile picture.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        patch({ photoUri: result.assets[0].uri });
      }
    } catch (err) {
      Alert.alert(
        'Could not open photos',
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    }
  }

  function handleContinue() {
    setFormError(null);
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setFormError('Please enter your first and last name.');
      return;
    }
    const emailErr = validateEmail(draft.email);
    if (emailErr) {
      setFormError(emailErr);
      return;
    }
    const phoneErr = validatePhone(draft.phone);
    if (phoneErr) {
      setFormError(phoneErr);
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(draft.dob)) {
      setFormError('Please select your date of birth.');
      return;
    }
    router.push({ pathname: '/(auth)/register-create-password', params: { role } });
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
          <Text style={styles.stepLabel}>STEP 1 OF 4 — PERSONAL INFO</Text>

          {/* Photo picker */}
          <View style={styles.photoSection}>
            <Pressable style={styles.avatarCircle} onPress={handlePickPhoto}>
              {draft.photoUri ? (
                <Image source={{ uri: draft.photoUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="camera-outline" size={28} color={colors.textTertiary} />
              )}
            </Pressable>
            <Pressable onPress={handlePickPhoto}>
              <Text style={styles.addPhotoLink}>
                {draft.photoUri ? 'Change photo' : 'Add photo'}
              </Text>
            </Pressable>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* First name */}
            <TextInputField
              label="First name"
              value={draft.firstName}
              onChangeText={(val) => patch({ firstName: val })}
              placeholder="Enter your first name"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Last name */}
            <TextInputField
              label="Last name"
              value={draft.lastName}
              onChangeText={(val) => patch({ lastName: val })}
              placeholder="Enter your last name"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Email */}
            <TextInputField
              label="Email"
              value={draft.email}
              onChangeText={(val) => patch({ email: val })}
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
                  <Text style={styles.countryCodeText}>{draft.countryCode}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={draft.phone}
                  onChangeText={(val) => patch({ phone: val })}
                  placeholder="(555) 000-0000"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Date of birth */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date of birth</Text>
              <Pressable style={styles.dateField} onPress={openDatePicker}>
                <Text
                  style={[
                    styles.dateFieldText,
                    !draft.dob && styles.dateFieldPlaceholder,
                  ]}
                >
                  {draft.dob || 'Select your date of birth'}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {formError && <Text style={styles.errorText}>{formError}</Text>}
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Button title="Continue" onPress={handleContinue} />
        </View>

        {/* Android: native modal dialog, no custom wrapper needed. */}
        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="default"
            maximumDate={MAX_DOB}
            minimumDate={MIN_DOB}
            onChange={handleAndroidDateChange}
          />
        )}

        {/* iOS: spinner inside a bottom-sheet Modal with Cancel/Done. */}
        {Platform.OS === 'ios' && (
          <Modal
            visible={showDatePicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowDatePicker(false)}
          >
            <Pressable
              style={styles.datePickerBackdrop}
              onPress={() => setShowDatePicker(false)}
            >
              <Pressable style={styles.datePickerSheet}>
                <View style={styles.datePickerHeader}>
                  <Pressable onPress={() => setShowDatePicker(false)} hitSlop={8}>
                    <Text style={styles.datePickerCancel}>Cancel</Text>
                  </Pressable>
                  <Text style={styles.datePickerTitle}>Date of birth</Text>
                  <Pressable onPress={confirmIosDate} hitSlop={8}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  maximumDate={MAX_DOB}
                  minimumDate={MIN_DOB}
                  onChange={handleIosDateChange}
                  themeVariant="light"
                  textColor={colors.textPrimary}
                  style={styles.iosDatePicker}
                />
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
