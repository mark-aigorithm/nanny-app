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
import { APP_NAME } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import HomeLocationMapCard from '@mobile/components/HomeLocationMapCard';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-nanny-location-screen.styles';

// Nanny counterpart of RegistrationStep2Screen: collects only the home
// location (address + map pin). Children and preferences are mother-only.
// The pin is required — the register API needs coordinates for both roles.
export default function RegistrationNannyLocationScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);

  const [locationError, setLocationError] = useState<string | null>(null);

  const pinCoords =
    draft.latitude !== null && draft.longitude !== null
      ? { latitude: draft.latitude, longitude: draft.longitude }
      : null;

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
          <Text style={styles.stepLabel}>STEP 3 OF 4 — HOME LOCATION</Text>

          {/* Section title */}
          <Text style={styles.sectionTitle}>Where are you based?</Text>
          <Text style={styles.sectionSubtitle}>
            Families search for nannies near them, so we need your home
            location to show you in the right results.
          </Text>

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

            {/* Home location map picker */}
            <HomeLocationMapCard
              coords={pinCoords}
              onChange={(coords) => {
                setLocationError(null);
                patch(coords);
              }}
              errorText={locationError}
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
