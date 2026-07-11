import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';

import { colors } from '@mobile/theme';
import type { Child } from '@mobile/types';
import { AGE_OPTIONS, PREFERENCE_OPTIONS, APP_NAME } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import Chip from '@mobile/components/ui/chip';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useDeviceLocation } from '@mobile/hooks/useDeviceLocation';
import { styles } from './styles/registration-step2-screen.styles';

// Fallback map center when location permission is denied (Cairo).
const DEFAULT_REGION = {
  latitude: 30.0444,
  longitude: 31.2357,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function RegistrationStep2Screen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);

  // Index of the child whose age picker is open, or null when closed.
  const [agePickerIndex, setAgePickerIndex] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Center the map on the device once permission is granted; the first fix
  // also places the pin so most users never have to drag it.
  const deviceLocation = useDeviceLocation();
  const pinCoords =
    draft.latitude !== null && draft.longitude !== null
      ? { latitude: draft.latitude, longitude: draft.longitude }
      : deviceLocation.coords;
  useEffect(() => {
    if (draft.latitude === null && deviceLocation.coords) {
      patch({ ...deviceLocation.coords });
    }
  }, [draft.latitude, deviceLocation.coords, patch]);

  function handleBack() {
    router.back();
  }

  function handleContinue() {
    if (draft.latitude === null || draft.longitude === null) {
      setLocationError('Please set your home location on the map.');
      return;
    }
    setLocationError(null);
    router.push({ pathname: '/(auth)/register-step-3', params: { role } });
  }

  function handleAddChild() {
    patch({ children: [...draft.children, { name: '', age: '' }] });
  }

  function handleChildName(index: number, value: string) {
    const next: Child[] = draft.children.map((child, i) =>
      i === index ? { ...child, name: value } : child,
    );
    patch({ children: next });
  }

  function handleChildAge(index: number, value: string) {
    const next: Child[] = draft.children.map((child, i) =>
      i === index ? { ...child, age: value } : child,
    );
    patch({ children: next });
    setAgePickerIndex(null);
  }

  function togglePreference(pref: string) {
    const next = draft.preferences.includes(pref)
      ? draft.preferences.filter((p) => p !== pref)
      : [...draft.preferences, pref];
    patch({ preferences: next });
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
          <View style={styles.headerLeft}>
            <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.brandText}>{APP_NAME}</Text>
          </View>
          <View style={styles.miniProgressTrack}>
            <View style={styles.miniProgressFill} />
          </View>
        </View>

        {/* Full-width progress bar */}
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
          <Text style={styles.stepLabel}>STEP 3 OF 4 — LOCATION & PREFERENCES</Text>

          {/* Section title */}
          <Text style={styles.sectionTitle}>Where are you based?</Text>

          {/* Location inputs */}
          <View style={styles.locationGroup}>
            {/* Street address */}
            <View style={styles.iconInputWrapper}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <TextInput
                style={styles.iconInputInner}
                value={draft.address}
                onChangeText={(val) => patch({ address: val })}
                placeholder="Street address"
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* Neighbourhood */}
            <TextInput
              style={styles.inputShort}
              value={draft.neighbourhood}
              onChangeText={(val) => patch({ neighbourhood: val })}
              placeholder="Neighbourhood (optional)"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Home location map picker */}
            <View style={styles.mapCard}>
              <MapView
                style={styles.map}
                initialRegion={
                  pinCoords
                    ? { ...DEFAULT_REGION, ...pinCoords }
                    : DEFAULT_REGION
                }
                onPress={(e) => {
                  setLocationError(null);
                  patch({ ...e.nativeEvent.coordinate });
                }}
              >
                {pinCoords && (
                  <Marker
                    coordinate={pinCoords}
                    draggable
                    onDragEnd={(e) => {
                      setLocationError(null);
                      patch({ ...e.nativeEvent.coordinate });
                    }}
                  />
                )}
              </MapView>
            </View>
            <Text style={styles.mapHint}>
              Tap the map or drag the pin to your home location.
            </Text>
            {locationError && <Text style={styles.mapError}>{locationError}</Text>}
          </View>

          {/* Your children section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeader}>Your children</Text>

            {draft.children.map((child, index) => (
              <View key={index} style={styles.childCard}>
                <TextInput
                  style={styles.childNameInput}
                  value={child.name}
                  onChangeText={(val) => handleChildName(index, val)}
                  placeholder="Child's name"
                  placeholderTextColor={colors.textPlaceholder}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                <Pressable
                  style={styles.ageDropdown}
                  onPress={() => setAgePickerIndex(index)}
                >
                  <Text
                    style={[
                      styles.ageDropdownText,
                      child.age !== '' && styles.ageDropdownTextFilled,
                    ]}
                  >
                    {child.age !== '' ? child.age + ' yr' : 'Age'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </Pressable>
              </View>
            ))}

            <Pressable style={styles.addChildLink} onPress={handleAddChild}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.addChildLinkText}>Add another child</Text>
            </Pressable>
          </View>

          {/* What matters most section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeader}>What matters most?</Text>
            <View style={styles.chipsWrap}>
              {PREFERENCE_OPTIONS.map((pref) => {
                const isSelected = draft.preferences.includes(pref);
                return (
                  <Chip
                    key={pref}
                    label={pref}
                    active={isSelected}
                    onPress={() => togglePreference(pref)}
                    size="md"
                    style={styles.chip}
                  />
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Button title="Continue" onPress={handleContinue} />
        </View>

        {/* Age picker bottom-sheet modal */}
        <Modal
          visible={agePickerIndex !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setAgePickerIndex(null)}
        >
          <Pressable
            style={styles.ageModalBackdrop}
            onPress={() => setAgePickerIndex(null)}
          >
            <Pressable style={styles.ageModalSheet}>
              <View style={styles.ageModalHeader}>
                <Text style={styles.ageModalTitle}>Child&apos;s age</Text>
                <Pressable onPress={() => setAgePickerIndex(null)} hitSlop={8}>
                  <Text style={styles.ageModalCancel}>Cancel</Text>
                </Pressable>
              </View>
              <View style={styles.ageModalGrid}>
                {AGE_OPTIONS.map((age) => {
                  const isSelected =
                    agePickerIndex !== null &&
                    draft.children[agePickerIndex]?.age === age;
                  return (
                    <Pressable
                      key={age}
                      style={[styles.ageOption, isSelected && styles.ageOptionSelected]}
                      onPress={() =>
                        agePickerIndex !== null && handleChildAge(agePickerIndex, age)
                      }
                    >
                      <Text
                        style={[
                          styles.ageOptionText,
                          isSelected && styles.ageOptionTextSelected,
                        ]}
                      >
                        {age}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}
