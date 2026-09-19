/**
 * Minimal web stub for expo-location used during Vite preview builds. The
 * real module pulls in expo-modules-core, whose .ts declaration files fail to
 * bundle; a preview never has a GPS fix anyway, so permission is denied and
 * the map card renders its "set the pin" state.
 */
export const Accuracy = { Balanced: 3 };

export async function requestForegroundPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'denied' };
}

export async function getCurrentPositionAsync(): Promise<never> {
  throw new Error('Location is not available in the web preview.');
}
