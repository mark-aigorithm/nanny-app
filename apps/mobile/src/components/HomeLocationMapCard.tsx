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

  useEffect(() => {
    if (coords === null && deviceLocation.coords) {
      onChange(deviceLocation.coords);
      // initialRegion is only read on mount, and the GPS fix usually arrives
      // after that — move the camera explicitly or the map stays on the
      // fallback region with the pin off-screen.
      mapRef.current?.animateToRegion(
        { ...DEFAULT_REGION, ...deviceLocation.coords },
        600,
      );
    }
  }, [coords, deviceLocation.coords, onChange]);

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
          onPress={(e) => onChange(e.nativeEvent.coordinate)}
        >
          {pinCoords && (
            <Marker
              coordinate={pinCoords}
              draggable
              onDragEnd={(e) => onChange(e.nativeEvent.coordinate)}
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
