import Constants from 'expo-constants';

// Raw Google Places / Geocoding web-service layer. Pure async functions over
// `fetch` — no React. Every function is defensive: a missing key, a network
// failure, or a non-OK Google status resolves to an empty result (never throws),
// so the UI degrades gracefully to "no suggestions" / "address unchanged".

const PLACES_BASE = 'https://maps.googleapis.com/maps/api';

export type PlacePrediction = {
  placeId: string;
  description: string;
};

export type PlaceDetails = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
};

type LatLng = {
  latitude: number;
  longitude: number;
};

function getApiKey(): string {
  const key = Constants.expoConfig?.extra?.['googlePlacesApiKey'];
  return typeof key === 'string' ? key : '';
}

// Google is happy with any opaque session token string; it only uses it to group
// autocomplete + details calls for billing. No uuid dependency needed.
export function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function logDev(context: string, error: unknown): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[googlePlaces] ${context}`, error);
  }
}

/**
 * Autocomplete predictions for a partial address, biased to Egypt. Returns an
 * empty array on any failure (missing key, network, non-OK status).
 */
export async function placeAutocomplete(
  input: string,
  sessionToken: string,
): Promise<PlacePrediction[]> {
  const key = getApiKey();
  if (!key || input.trim() === '') return [];

  const url =
    `${PLACES_BASE}/place/autocomplete/json` +
    `?input=${encodeURIComponent(input)}` +
    `&key=${key}` +
    `&sessiontoken=${sessionToken}` +
    `&components=country:eg` +
    `&language=en`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      status?: string;
      predictions?: { place_id?: string; description?: string }[];
    };
    if (data.status !== 'OK') return [];
    return (data.predictions ?? [])
      .filter(
        (p): p is { place_id: string; description: string } =>
          typeof p.place_id === 'string' && typeof p.description === 'string',
      )
      .map((p) => ({ placeId: p.place_id, description: p.description }));
  } catch (error) {
    logDev('placeAutocomplete failed', error);
    return [];
  }
}

/**
 * Resolve a prediction's place_id to coordinates + a formatted address. Returns
 * null on any failure. Pass the same session token used for the autocomplete
 * request that produced this place_id so Google closes the billing session.
 */
export async function placeDetails(
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  const key = getApiKey();
  if (!key || placeId === '') return null;

  const url =
    `${PLACES_BASE}/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=geometry,formatted_address` +
    `&key=${key}` +
    `&sessiontoken=${sessionToken}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      result?: {
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      };
    };
    const location = data.result?.geometry?.location;
    if (
      data.status !== 'OK' ||
      typeof location?.lat !== 'number' ||
      typeof location?.lng !== 'number'
    ) {
      return null;
    }
    return {
      latitude: location.lat,
      longitude: location.lng,
      formattedAddress: data.result?.formatted_address ?? '',
    };
  } catch (error) {
    logDev('placeDetails failed', error);
    return null;
  }
}

/**
 * Reverse-geocode coordinates to a human-readable address. Returns the first
 * formatted address, or null if none / on failure.
 */
export async function reverseGeocode(coords: LatLng): Promise<string | null> {
  const key = getApiKey();
  if (!key) return null;

  const url =
    `${PLACES_BASE}/geocode/json` +
    `?latlng=${coords.latitude},${coords.longitude}` +
    `&key=${key}` +
    `&language=en`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: { formatted_address?: string }[];
    };
    if (data.status !== 'OK') return null;
    const first = data.results?.[0]?.formatted_address;
    return typeof first === 'string' ? first : null;
  } catch (error) {
    logDev('reverseGeocode failed', error);
    return null;
  }
}
