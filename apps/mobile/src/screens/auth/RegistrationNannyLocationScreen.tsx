import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';

import Button from '@mobile/components/ui/button';
import HomeLocationMapCard, {
  type HomeCoords,
} from '@mobile/components/HomeLocationMapCard';
import LocationSearchInput from '@mobile/components/LocationSearchInput';
import RegistrationHeader from '@mobile/components/RegistrationHeader';
import { reverseGeocode } from '@mobile/lib/googlePlaces';
import { nextStep, stepInfo } from '@mobile/lib/registrationSteps';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-nanny-location-screen.styles';

/**
 * A nanny's "Home location": the address and map pin (the register API needs
 * coordinates for both roles). The counterpart of RegistrationLocationScreen,
 * without a mother's preferences. Each error sits by what it's about: the
 * street address under the address field, the pin under the map.
 */
export default function RegistrationNannyLocationScreen() {
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
    // The street line is required for every account — a pin alone doesn't
    // tell anyone which door.
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

          <View style={styles.headlineGroup}>
            <Text style={styles.headline}>Where are you based?</Text>
            <Text style={styles.subtitle}>
              Families search for nannies near them, so we need your home
              location to show you in the right results.
            </Text>
          </View>

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
            {addressError && <Text style={styles.addressErrorText}>{addressError}</Text>}

            {/* Home location map picker */}
            <HomeLocationMapCard
              coords={pinCoords}
              onChange={handlePinChange}
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
