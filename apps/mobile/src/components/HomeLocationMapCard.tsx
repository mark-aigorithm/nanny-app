import React, { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { useDeviceLocation } from '@mobile/hooks/useDeviceLocation';
import { styles } from './styles/home-location-map-card.styles';

// Fallback map center when location permission is denied (Cairo).
const DEFAULT_REGION = {
  latitude: 30.0444,
  longitude: 31.2357,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export type HomeCoords = {
  latitude: number;
  longitude: number;
};

type HomeLocationMapCardProps = {
  /** Current pin position; null until the user (or first GPS fix) sets it. */
  coords: HomeCoords | null;
  onChange: (coords: HomeCoords) => void;
  errorText?: string | null;
};

/**
 * Draggable-pin map picker for the registration home location. Centers on the
 * device once permission is granted; the first fix also places the pin so
 * most users never have to drag it.
 */
export default function HomeLocationMapCard({
  coords,
  onChange,
  errorText,
}: HomeLocationMapCardProps) {
  const deviceLocation = useDeviceLocation();
  const pinCoords = coords ?? deviceLocation.coords;

  const mapRef = useRef<MapView>(null);
  // Coords the map itself last emitted via a tap/drag. Used to distinguish a
  // user-driven change (camera already there — don't move it) from an external
  // one (first GPS fix or a search selection — recenter the camera).
  const lastEmittedRef = useRef<HomeCoords | null>(null);

  const emitChange = (next: HomeCoords) => {
    lastEmittedRef.current = next;
    onChange(next);
  };

  useEffect(() => {
    if (coords === null && deviceLocation.coords) {
      // First GPS fix seeds the pin; camera animates below via the external-
      // change effect since these coords didn't originate from the map.
      onChange(deviceLocation.coords);
    }
  }, [coords, deviceLocation.coords, onChange]);

  useEffect(() => {
    if (!coords) return;
    const emitted = lastEmittedRef.current;
    const isSelfEmitted =
      emitted !== null &&
      emitted.latitude === coords.latitude &&
      emitted.longitude === coords.longitude;
    // Recenter only when the change came from outside the map (search select or
    // GPS fix) — never fight the user's own drag/tap.
    if (!isSelfEmitted) {
      mapRef.current?.animateToRegion({ ...DEFAULT_REGION, ...coords }, 600);
    }
  }, [coords]);

  return (
    <>
      <View style={styles.mapCard}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={
            pinCoords ? { ...DEFAULT_REGION, ...pinCoords } : DEFAULT_REGION
          }
          showsUserLocation={deviceLocation.status === 'granted'}
          onPress={(e) => emitChange(e.nativeEvent.coordinate)}
        >
          {pinCoords && (
            <Marker
              coordinate={pinCoords}
              draggable
              onDragEnd={(e) => emitChange(e.nativeEvent.coordinate)}
            />
          )}
        </MapView>
      </View>
      <Text style={styles.mapHint}>
        Tap the map or drag the pin to your home location.
      </Text>
      {errorText && <Text style={styles.mapError}>{errorText}</Text>}
    </>
  );
}
