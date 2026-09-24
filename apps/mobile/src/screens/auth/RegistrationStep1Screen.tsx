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
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { e2ePlaceholderImageUri } from '@mobile/lib/e2eImage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { AvailabilityResponse } from '@nanny-app/shared';
import { latestAllowedDob } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import TextInputField from '@mobile/components/ui/text-input';
import Button from '@mobile/components/ui/button';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useCheckAvailability } from '@mobile/hooks/useAuth';
import { getApiErrorMessage } from '@mobile/lib/api';
import { abandonSocialSignUpForLink } from '@mobile/lib/pendingLink';
import { SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { validateEmail, validatePhone, validateDob, toE164 } from '@mobile/lib/validation';
import { styles } from './styles/registration-step1-screen.styles';
import { noticeDialog } from '@mobile/store/confirmDialogStore';

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

const MIN_DOB = new Date(new Date().getFullYear() - 100, 0, 1);

// The backend's own wording, so the two surfaces read the same.
const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists.';
const PHONE_TAKEN_MESSAGE = 'An account with this phone number already exists.';

/**
 * Step 1 of every wizard: photo, name, email, phone and date of birth, checked
 * against /auth/availability before moving on.
 *
 * A Google/Apple sign-up has its email fixed ("Verified by …") and skips the
 * email-code and password steps, so it counts fewer steps; if its email or
 * phone already has an account, that is collision B — the new account is
 * dropped and she is sent to sign in with the number she typed. A resumed
 * account that already carries a phone shows it locked ("Already verified on
 * your account"), and step 3 then skips the SMS for it.
 */
export default function RegistrationStep1Screen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  // Nannies get one extra step — register-nanny-details before the final one —
  // so their progress indicator counts "OF 6" instead of "OF 5".
  const isNanny = role === 'nanny';

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);

  // A Google/Apple sign-up: the provider verified the email, so it is fixed,
  // and the email-code and password steps are skipped.
  const isSocial = draft.authProvider !== 'phone';
  const stepLabel = isSocial
    ? isNanny ? 'STEP 1 OF 5' : 'STEP 1 OF 3'
    : isNanny ? 'STEP 1 OF 6' : 'STEP 1 OF 5';

  const [formError, setFormError] = useState<string | null>(null);
  // Per-field "already taken" errors from the availability check. Kept apart
  // from formError so each sits under the field it is about, and so editing
  // that field — and only that field — clears it.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const checkAvailability = useCheckAvailability();
  // Collision B deletes or signs out the account this sign-up is working on.
  // Continue stays disabled from then until the replace to sign-in, so a
  // second tap can't run against that account.
  const [isHandingOff, setIsHandingOff] = useState(false);
  // The "photo required" hint stays hidden until the first Continue attempt —
  // showing it on arrival, before the user has done anything, reads as an error.
  const [showPhotoError, setShowPhotoError] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => parseDob(draft.dob));
  // The picker offers no date that would make them under 18 — the same rule
  // the API holds registration to. Computed per render so a screen left open
  // past midnight doesn't keep yesterday's bound.
  const maxDob = latestAllowedDob();

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
      // E2E: skip the system picker + crop and use a bundled placeholder.
      const e2eUri = await e2ePlaceholderImageUri();
      if (e2eUri) {
        patch({ photoUri: e2eUri });
        setShowPhotoError(false);
        return;
      }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        noticeDialog({ title: 'Permission needed', message: 'Please allow photo library access to pick a profile picture.' });
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
        setShowPhotoError(false);
      }
    } catch (err) {
      noticeDialog({ title: 'Could not open photos', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  async function handleContinue() {
    setFormError(null);
    if (!draft.photoUri) {
      setShowPhotoError(true);
      return;
    }
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setFormError('Please enter your first and last name.');
      return;
    }
    const phoneErr = validatePhone(draft.phone);
    if (phoneErr) {
      setFormError(phoneErr);
      return;
    }
    // The address is verified on the very next screen, so a typo has to be
    // caught here — the code would otherwise be sent somewhere they can't
    // read, with no way back but the back button.
    const emailErr = validateEmail(draft.email);
    if (emailErr) {
      setFormError(emailErr);
      return;
    }
    const dobError = validateDob(draft.dob);
    if (dobError) {
      setFormError(dobError);
      return;
    }

    // Refuse an email or phone that already belongs to an account here, while
    // the fields are still on screen — not on the code screen after it (where
    // the OTP send used to be the first to notice the email) and not at the
    // very end of the wizard (where /auth/register was the first to notice the
    // phone). Fail closed on a network error: the next screen's OTP send needs
    // the same connectivity, so letting them through only moves the failure.
    let availability: AvailabilityResponse;
    try {
      availability = await checkAvailability.mutateAsync({
        email: draft.email.trim().toLowerCase(),
        phone: toE164(draft.countryCode, draft.phone),
      });
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not check your details. Please try again.'));
      return;
    }
    if (isSocial && (availability.emailTaken || availability.phoneTaken)) {
      // Collision B: this person already has an account. Drop the Google/Apple
      // account just created, keep the credential, and have them sign in with
      // the number they typed — the credential is linked once they do.
      setIsHandingOff(true);
      await abandonSocialSignUpForLink(toE164(draft.countryCode, draft.phone));
      router.dismissTo('/(auth)/sign-in');
      return;
    }
    setEmailError(availability.emailTaken ? EMAIL_TAKEN_MESSAGE : null);
    setPhoneError(availability.phoneTaken ? PHONE_TAKEN_MESSAGE : null);
    if (availability.emailTaken || availability.phoneTaken) return;

    if (isSocial) {
      // Both roles set a home location next, as CreatePasswordScreen routes
      // the phone wizard.
      router.push({
        pathname: isNanny ? '/(auth)/register-nanny-location' : '/(auth)/register-step-2',
        params: { role },
      });
      return;
    }
    router.push({ pathname: '/(auth)/register-email', params: { role } });
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
          <View
            style={[
              styles.progressBarFill,
              isNanny && styles.progressBarFillNanny,
              isSocial && (isNanny ? styles.progressBarFillSocialNanny : styles.progressBarFillSocialMother),
            ]}
          />
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step label */}
          <Text style={styles.stepLabel}>
            {stepLabel} — PERSONAL INFO
          </Text>

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
            {showPhotoError && !draft.photoUri && (
              <Text style={styles.photoRequiredHint}>A profile photo is required</Text>
            )}
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

            {/* Email — both roles. Verified on the next step, and it is where
                receipts and account recovery reach them; sign-in stays the
                phone number. */}
            <TextInputField
              label="Email"
              value={draft.email}
              onChangeText={(val) => {
                patch({ email: val });
                if (emailError) setEmailError(null);
              }}
              error={emailError}
              placeholder="you@example.com"
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              editable={!isSocial}
            />
            {draft.authProvider !== 'phone' && (
              <Text style={styles.verifiedHint}>
                {`Verified by ${SOCIAL_PROVIDER_LABEL[draft.authProvider]}`}
              </Text>
            )}

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>{draft.countryCode}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </View>
                {/* Placeholder is an Egyptian mobile with the leading 0
                    dropped — the country-code box already carries the +20. */}
                <TextInput
                  style={[styles.phoneInput, phoneError ? styles.phoneInputError : undefined]}
                  value={draft.phone}
                  onChangeText={(val) => {
                    patch({ phone: val });
                    if (phoneError) setPhoneError(null);
                  }}
                  placeholder="100 000 0000"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  // A resumed account that already carries a phone keeps it:
                  // step 3 skips the SMS for exactly that number.
                  editable={!draft.accountPhone}
                />
              </View>
              {phoneError && <Text style={styles.fieldErrorText}>{phoneError}</Text>}
              {draft.accountPhone && !phoneError && (
                <Text style={[styles.verifiedHint, styles.verifiedHintInGroup]}>
                  Already verified on your account
                </Text>
              )}
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
          <Button
            title={checkAvailability.isPending ? 'Checking…' : 'Continue'}
            onPress={() => void handleContinue()}
            disabled={checkAvailability.isPending || isHandingOff}
          />
        </View>

        {/* Android: native modal dialog, no custom wrapper needed. */}
        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="default"
            maximumDate={maxDob}
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
                  maximumDate={maxDob}
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
