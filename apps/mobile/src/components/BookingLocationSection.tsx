import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

import { colors } from '@mobile/theme';
import { Button } from '@mobile/components/ui';
import HomeLocationMapCard, { type HomeCoords } from '@mobile/components/HomeLocationMapCard';
import LocationSearchInput from '@mobile/components/LocationSearchInput';
import { reverseGeocode } from '@mobile/lib/googlePlaces';
import { getApiErrorMessage } from '@mobile/lib/api';
import { isMapAvailable } from '@mobile/lib/maps';
import { useUpdateProfile } from '@mobile/hooks/useMe';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { styles } from './styles/booking-location-section.styles';

/** Static-camera region padding around the saved pin for the preview map. */
const PREVIEW_DELTA = 0.01;

/**
 * "Where" step of the booking flow: a compact confirmation of the mother's saved
 * home, so she can see the nanny is being sent to the right place before she
 * commits. The booking itself always uses her saved home location (the server
 * snapshots it at creation), so "Change" here edits that saved home via
 * `PATCH /auth/me` rather than carrying a per-booking address.
 */
export default function BookingLocationSection() {
  const profile = useUserProfileStore((s) => s.profile);
  const updateProfile = useUpdateProfile();

  const savedCoords: HomeCoords | null =
    profile?.latitude != null && profile?.longitude != null
      ? { latitude: profile.latitude, longitude: profile.longitude }
      : null;
  const savedAddress = profile?.address?.trim() ?? '';

  const [editing, setEditing] = useState(false);
  const [draftAddress, setDraftAddress] = useState('');
  const [draftCoords, setDraftCoords] = useState<HomeCoords | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openEditor = () => {
    setDraftAddress(savedAddress);
    setDraftCoords(savedCoords);
    setSaveError(null);
    updateProfile.reset();
    setEditing(true);
  };

  const closeEditor = () => setEditing(false);

  // Pin moved on the map: store the coords, then reverse-geocode to keep the
  // address field in step — same handshake the registration screen uses.
  const handlePinChange = (coords: HomeCoords) => {
    setSaveError(null);
    setDraftCoords(coords);
    void reverseGeocode(coords).then((address) => {
      if (address) setDraftAddress(address);
    });
  };

  const handleSave = () => {
    if (!draftCoords) {
      setSaveError('Set your home location on the map.');
      return;
    }
    setSaveError(null);
    updateProfile.mutate(
      {
        address: draftAddress.trim() ? draftAddress.trim() : null,
        latitude: draftCoords.latitude,
        longitude: draftCoords.longitude,
      },
      {
        onSuccess: () => setEditing(false),
        onError: (err) =>
          setSaveError(getApiErrorMessage(err, 'Could not save your location. Please try again.')),
      },
    );
  };

  // Until the profile hydrates we can't tell "no home on file" from "still
  // loading" — showing the empty prompt then would falsely alarm her. Wait.
  if (!profile) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Where</Text>

      {savedCoords ? (
        <Pressable style={styles.card} onPress={openEditor}>
          {/* The preview is the one part of this card that needs a map key.
              Without one the address alone still says where the nanny is
              going — see isMapAvailable. */}
          {isMapAvailable() && (
            <View style={styles.mapPreview}>
              <MapView
                style={styles.previewMap}
                pointerEvents="none"
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                liteMode
                region={{
                  ...savedCoords,
                  latitudeDelta: PREVIEW_DELTA,
                  longitudeDelta: PREVIEW_DELTA,
                }}
              >
                <Marker coordinate={savedCoords} />
              </MapView>
            </View>
          )}
          <View style={styles.cardBody}>
            <Text style={styles.cardLabel}>Your nanny comes to</Text>
            <Text style={styles.cardAddress} numberOfLines={2}>
              {savedAddress || 'Saved home location'}
            </Text>
          </View>
          <Text style={styles.changeLink}>Change</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.emptyCard} onPress={openEditor}>
          <View style={styles.emptyIcon}>
            <Ionicons name="location-outline" size={20} color={colors.primaryDark} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardLabel}>Add your address</Text>
            <Text style={styles.emptySub}>
              Your nanny needs to know where to go before you can book.
            </Text>
          </View>
          <Text style={styles.changeLink}>Set</Text>
        </Pressable>
      )}

      <Modal
        visible={editing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <StatusBar barStyle="dark-content" />
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalIconBtn} onPress={closeEditor} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Confirm your location</Text>
            <View style={styles.modalIconBtn} />
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalHint}>
              This is where your nanny will meet you. Search for your address or drag the pin.
            </Text>

            <LocationSearchInput
              value={draftAddress}
              onChangeText={setDraftAddress}
              onSelectPlace={(coords, address) => {
                setSaveError(null);
                setDraftCoords(coords);
                setDraftAddress(address);
              }}
              placeholder="Street address"
            />

            <HomeLocationMapCard
              coords={draftCoords}
              onChange={handlePinChange}
              errorText={saveError}
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button
              title="Save location"
              onPress={handleSave}
              loading={updateProfile.isPending}
              disabled={updateProfile.isPending}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
