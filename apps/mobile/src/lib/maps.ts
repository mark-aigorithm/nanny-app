import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Whether this build can render a map.
 *
 * On Android `react-native-maps` throws a native `RuntimeException: API key not
 * found` the instant a `MapView` is *constructed* — not a blank tile, but an
 * unrecoverable crash that takes the whole screen with it. The key is written
 * into the manifest at prebuild time from `GOOGLE_MAPS_API_KEY`, so a build made
 * without that variable set has no key at all, and every screen carrying a map
 * (the booking flow's "Where" step, the registration location picker) dies on
 * arrival.
 *
 * Callers use this to leave the map out rather than crash. Those screens stay
 * usable without it: an address can still be set by search or by the device's
 * own location.
 *
 * iOS is always true — the config deliberately omits `googleMapsApiKey` there,
 * so `react-native-maps` renders Apple Maps and needs no key. A build with a key
 * configured is therefore unchanged on both platforms.
 */
export function isMapAvailable(): boolean {
  if (Platform.OS !== 'android') return true;
  const apiKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey;
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}
