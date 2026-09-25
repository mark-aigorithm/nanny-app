import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Image,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { AvailabilityResponse } from '@nanny-app/shared';
import { latestAllowedDob } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import TextInputField from '@mobile/components/ui/text-input';
import Button from '@mobile/components/ui/button';
import RegistrationHeader from '@mobile/components/RegistrationHeader';
import { useCheckAvailability } from '@mobile/hooks/useAuth';
import { getApiErrorMessage } from '@mobile/lib/api';
import { e2ePlaceholderImageUri } from '@mobile/lib/e2eImage';
import { abandonSocialSignUpForLink } from '@mobile/lib/pendingLink';
import { nextStep, stepInfo } from '@mobile/lib/registrationSteps';
import { SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { uploadImageToFirebase } from '@mobile/lib/storage';
import { toE164, validateDob, validateEmail } from '@mobile/lib/validation';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { uploadFor, useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-about-screen.styles';

/** Format a Date as 'mm/dd/yyyy' — the draft's storage format. */
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
const PHOTO_UPLOAD_FAILED_MESSAGE =
  "Couldn't upload your photo. Check your connection and try again.";

type FieldErrors = {
  photo?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  dob?: string;
};

/**
 * "About you": photo, name, email and date of birth. The phone was proved on
 * the step before, so she is signed in here.
 *
 * Every field's problem shows under that field at once, in screen order —
 * not one at a time in a banner at the bottom. The banner is only for what
 * no field owns (a network error, a failed upload).
 *
 * Continue checks the email with `/auth/availability`, then uploads the photo
 * (again only if it changed since the last upload). A Google/Apple sign-up
 * has its email fixed ("Verified by …"); if that email already has an
 * account, it is collision B — the new account is dropped and she is sent to
 * sign in with her number.
 */
export default function RegistrationAboutScreen() {
  const router = useRouter();
  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const step = stepInfo('about', draft);
  const isSocial = draft.authProvider !== 'phone';

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const checkAvailability = useCheckAvailability();
  // Collision B deletes or signs out the account this sign-up is working on.
  // Continue stays disabled from then until the move to sign-in.
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => parseDob(draft.dob));
  // The picker offers no date that would make them under 18 — the same rule
  // the API holds registration to. Computed per render so a screen left open
  // past midnight doesn't keep yesterday's bound.
  const maxDob = latestAllowedDob();

  function clearError(field: keyof FieldErrors) {
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function setDob(date: Date) {
    patch({ dob: formatDob(date) });
    clearError('dob');
  }

  function openDatePicker() {
    setTempDate(parseDob(draft.dob));
    setShowDatePicker(true);
  }

  function handleAndroidDateChange(event: DateTimePickerEvent, date?: Date) {
    // On Android the picker is a modal dialog that dismisses itself on
    // either "set" (user tapped OK) or "dismissed" (cancel / tap-outside).
    setShowDatePicker(false);
    if (event.type === 'set' && date) setDob(date);
  }

  function handleIosDateChange(_event: DateTimePickerEvent, date?: Date) {
    if (date) setTempDate(date);
  }

  function confirmIosDate() {
    setDob(tempDate);
    setShowDatePicker(false);
  }

  async function handlePickPhoto() {
    try {
      // E2E: skip the system picker + crop and use a bundled placeholder.
      const e2eUri = await e2ePlaceholderImageUri();
      if (e2eUri) {
        patch({ photoUri: e2eUri });
        clearError('photo');
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
        clearError('photo');
      }
    } catch (err) {
      noticeDialog({ title: 'Could not open photos', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!draft.photoUri) found.photo = 'A profile photo is required.';
    if (!draft.firstName.trim()) found.firstName = 'Please enter your first name.';
    if (!draft.lastName.trim()) found.lastName = 'Please enter your last name.';
    // The address is verified on the next screen, so a typo has to be caught
    // here — the code would otherwise go somewhere she can't read.
    const emailError = validateEmail(draft.email);
    if (emailError) found.email = emailError;
    const dobError = validateDob(draft.dob);
    if (dobError) found.dob = dobError;
    return found;
  }

  async function handleContinue() {
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const email = draft.email.trim().toLowerCase();
    const phone = draft.accountPhone ?? toE164(draft.countryCode, draft.phone);

    // Refuse an email that already belongs to an account while the field is
    // still on screen. Fail closed on a network error: the next step needs
    // the same connection.
    let availability: AvailabilityResponse;
    try {
      availability = await checkAvailability.mutateAsync({ email, phone });
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not check your details. Please try again.'));
      return;
    }
    if (availability.emailTaken || availability.phoneTaken) {
      if (isSocial) {
        // Collision B: this person already has an account. Drop the
        // Google/Apple account just created, keep the credential, and have
        // her sign in with her number — the credential is linked once she does.
        setIsHandingOff(true);
        await abandonSocialSignUpForLink(phone);
        router.dismissTo('/(auth)/sign-in');
        return;
      }
      // The phone was free on "Your number"; taken now means someone
      // registered it in between.
      if (availability.phoneTaken) setFormError(PHONE_TAKEN_MESSAGE);
      if (availability.emailTaken) setErrors({ email: EMAIL_TAKEN_MESSAGE });
      return;
    }

    // A code already verified for a different address no longer proves this one.
    if (draft.verifiedEmail !== email) patch({ emailVerificationToken: null, verifiedEmail: null });

    // She is signed in (the phone step did that), so the photo can be filed
    // under her uid now rather than at the very end.
    const photoUri = draft.photoUri;
    if (photoUri && !uploadFor(draft.avatarUpload, photoUri)) {
      setIsUploading(true);
      try {
        const url = await uploadImageToFirebase(photoUri, 'avatars');
        patch({ avatarUpload: { uri: photoUri, url } });
      } catch {
        setFormError(PHOTO_UPLOAD_FAILED_MESSAGE);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    const next = nextStep('about', useRegistrationDraftStore.getState());
    if (next) router.push(next);
  }

  const busy = checkAvailability.isPending || isUploading || isHandingOff;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <RegistrationHeader step={step} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepLabel}>{step.label}</Text>

          {/* Photo picker */}
          <View style={styles.photoSection}>
            <Pressable
              style={[styles.avatarCircle, errors.photo !== undefined && styles.avatarCircleError]}
              onPress={handlePickPhoto}
              accessibilityRole="button"
              accessibilityLabel={draft.photoUri ? 'Change photo' : 'Add photo'}
            >
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
            {errors.photo && <Text style={styles.fieldErrorText}>{errors.photo}</Text>}
          </View>

          {/* Form */}
          <View style={styles.form}>
            <TextInputField
              label="First name"
              value={draft.firstName}
              onChangeText={(val) => {
                patch({ firstName: val });
                clearError('firstName');
              }}
              error={errors.firstName ?? null}
              placeholder="Enter your first name"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <TextInputField
              label="Last name"
              value={draft.lastName}
              onChangeText={(val) => {
                patch({ lastName: val });
                clearError('lastName');
              }}
              error={errors.lastName ?? null}
              placeholder="Enter your last name"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Verified on the next step; it is where receipts and account
                recovery reach her. */}
            <TextInputField
              label="Email"
              value={draft.email}
              onChangeText={(val) => {
                patch({ email: val });
                clearError('email');
              }}
              error={errors.email ?? null}
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

            {/* Date of birth */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date of birth</Text>
              <Pressable
                style={[styles.dateField, errors.dob !== undefined && styles.dateFieldError]}
                onPress={openDatePicker}
              >
                <Text style={[styles.dateFieldText, !draft.dob && styles.dateFieldPlaceholder]}>
                  {draft.dob || 'Select your date of birth'}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </Pressable>
              {errors.dob && <Text style={styles.fieldErrorText}>{errors.dob}</Text>}
            </View>
          </View>

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={
              checkAvailability.isPending
                ? 'Checking…'
                : isUploading
                  ? 'Uploading photo…'
                  : 'Continue'
            }
            onPress={() => void handleContinue()}
            disabled={busy}
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
