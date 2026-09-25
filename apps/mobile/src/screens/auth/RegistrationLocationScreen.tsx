import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { PREFERENCE_OPTIONS } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import Chip from '@mobile/components/ui/chip';
import HomeLocationMapCard, {
  type HomeCoords,
} from '@mobile/components/HomeLocationMapCard';
import LocationSearchInput from '@mobile/components/LocationSearchInput';
import RegistrationHeader from '@mobile/components/RegistrationHeader';
import { reverseGeocode } from '@mobile/lib/googlePlaces';
import { nextStep, stepInfo } from '@mobile/lib/registrationSteps';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-location-screen.styles';

/**
 * A mother's "Location & preferences": her home address and map pin (the
 * register API needs coordinates), and what matters most to her in a nanny.
 * Nothing is pre-ticked. A nanny has her own location step
 * (RegistrationNannyLocationScreen).
 */
export default function RegistrationLocationScreen() {
  const router = useRouter();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const step = stepInfo('location', draft);

  const [locationError, setLocationError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);

  const pinCoords =
    draft.latitude !== null && draft.longitude !== null
      ? { latitude: draft.latitude, longitude: draft.longitude }
      : null;

  function handleContinue() {
    if (draft.latitude === null || draft.longitude === null) {
      setLocationError('Please set your home location on the map.');
      return;
    }
    // The street line is required for every account — it becomes the first
    // address-book entry, and a pin alone doesn't tell a nanny which door.
    if (!draft.address.trim()) {
      setAddressError('Please enter your street address.');
      return;
    }
    setLocationError(null);
    setAddressError(null);
    const next = nextStep('location', draft);
    if (next) router.push(next);
  }

  // Pin moved on the map (tap/drag): store the coords, then reverse-geocode to
  // fill the address input so the two stay in sync.
  function handlePinChange(coords: HomeCoords) {
    setLocationError(null);
    patch(coords);
    void reverseGeocode(coords).then((address) => {
      if (address) {
        patch({ address });
        setAddressError(null);
      }
    });
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
        <RegistrationHeader step={step} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepLabel}>{step.label}</Text>

          <Text style={styles.headline}>Where are you based?</Text>

          {/* Location inputs */}
          <View style={styles.locationGroup}>
            {/* Street address with map-search autocomplete */}
            <LocationSearchInput
              value={draft.address}
              onChangeText={(val) => {
                setAddressError(null);
                patch({ address: val });
              }}
              onSelectPlace={(coords, address) => {
                setLocationError(null);
                setAddressError(null);
                patch({ ...coords, address });
              }}
              placeholder="Street address"
            />
            {/* The pin error renders next to the map via HomeLocationMapCard's
                errorText below; the street-address error is specific to this
                field, so it renders only here. */}
            {addressError && <Text style={styles.addressErrorText}>{addressError}</Text>}

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
            <HomeLocationMapCard
              coords={pinCoords}
              onChange={handlePinChange}
              errorText={locationError}
            />
          </View>

          {/* What matters most section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeader}>What matters most?</Text>
            <Text style={styles.sectionHint}>Optional — pick any that apply.</Text>
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

      </View>
    </KeyboardAvoidingView>
  );
}
