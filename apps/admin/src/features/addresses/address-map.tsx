import { useEffect, useRef, useState } from 'react';

import {
  AdvancedMarker,
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import type { GoogleAddressComponent } from '@nanny-app/shared';

import { mapsApiKey } from '@admin/lib/maps';

/** What a search pick or a pin drop hands back to the editor. */
export type PinPick = {
  latitude: number;
  longitude: number;
  /** Google's line for the spot; absent when only the pin moved and geocoding failed. */
  formattedAddress?: string;
  components?: GoogleAddressComponent[];
};

type AddressMapProps = {
  pin: { latitude: number; longitude: number } | null;
  onPick: (pick: PinPick) => void;
};

/** Cairo, for an address with no pin yet. */
const DEFAULT_CENTER = { lat: 30.0444, lng: 31.2357 };

/**
 * Places search plus a draggable pin. Search resolves to coordinates and
 * Google's address components; a pin drop or drag reverse-geocodes the same
 * way, preferring a real street address over the plus code Google lists
 * first, so the editor fills the same fields either way.
 */
export function AddressMap({ pin, onPick }: AddressMapProps) {
  return (
    <APIProvider apiKey={mapsApiKey()} libraries={['places']}>
      <div className="address-map">
        <PlacesSearch onPick={onPick} />
        <Map
          className="address-map-canvas"
          mapId="nannynow-address-editor"
          defaultCenter={pin ? { lat: pin.latitude, lng: pin.longitude } : DEFAULT_CENTER}
          defaultZoom={pin ? 16 : 11}
          gestureHandling="greedy"
          disableDefaultUI
          onClick={(e: MapMouseEvent) => {
            const latLng = e.detail.latLng;
            if (latLng) void geocodeAndPick(latLng.lat, latLng.lng, onPick);
          }}
        >
          {pin && (
            <AdvancedMarker
              position={{ lat: pin.latitude, lng: pin.longitude }}
              draggable
              onDragEnd={(e) => {
                const latLng = e.latLng;
                if (latLng) void geocodeAndPick(latLng.lat(), latLng.lng(), onPick);
              }}
            />
          )}
        </Map>
        <PanTo pin={pin} />
      </div>
    </APIProvider>
  );
}

/** Keeps the map on the pin when a search moves it. */
function PanTo({ pin }: { pin: AddressMapProps['pin'] }) {
  const map = useMap();
  useEffect(() => {
    if (map && pin) map.panTo({ lat: pin.latitude, lng: pin.longitude });
  }, [map, pin]);
  return null;
}

function isStreet(result: google.maps.GeocoderResult): boolean {
  return result.types.some((t) => t === 'street_address' || t === 'premise');
}

/** Reverse-geocodes a pin and reports the spot; falls back to bare coordinates. */
async function geocodeAndPick(lat: number, lng: number, onPick: (pick: PinPick) => void) {
  try {
    const geocoder = new google.maps.Geocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    const best = results.find(isStreet) ?? results[0];
    onPick({
      latitude: lat,
      longitude: lng,
      ...(best
        ? { formattedAddress: best.formatted_address, components: best.address_components }
        : {}),
    });
  } catch {
    onPick({ latitude: lat, longitude: lng });
  }
}

/** Google Places autocomplete, biased to Egypt, resolving a pick to a pin + components. */
function PlacesSearch({ onPick }: { onPick: (pick: PinPick) => void }) {
  const places = useMapsLibrary('places');
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!places || !inputRef.current) return;
    const autocomplete = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'eg' },
      fields: ['geometry', 'formatted_address', 'address_components'],
    });
    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const location = place.geometry?.location;
      if (!location) return;
      onPick({
        latitude: location.lat(),
        longitude: location.lng(),
        ...(place.formatted_address ? { formattedAddress: place.formatted_address } : {}),
        ...(place.address_components ? { components: place.address_components } : {}),
      });
      setQuery(place.formatted_address ?? '');
    });
    return () => listener.remove();
  }, [places, onPick]);

  return (
    <input
      ref={inputRef}
      className="input address-map-search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search for an address"
      aria-label="Search for an address"
    />
  );
}
