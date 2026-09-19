/**
 * Google Maps for the console. The address editor needs a browser key
 * (VITE_GOOGLE_MAPS_API_KEY, HTTP-referrer restricted) to show a map and
 * Places search; without one it degrades to the structured fields plus typed
 * coordinates, so an environment that has no key can still fix an address.
 */
export function mapsApiKey(): string {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

export function isMapsAvailable(): boolean {
  return mapsApiKey() !== '';
}
