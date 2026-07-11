import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

export interface DeviceCoords {
  latitude: number;
  longitude: number;
}

export type DeviceLocationStatus = 'loading' | 'granted' | 'denied' | 'error';

interface DeviceLocationState {
  coords: DeviceCoords | null;
  status: DeviceLocationStatus;
  /** Re-request permission and fetch the current position again. */
  refresh: () => void;
}

/**
 * Requests foreground location permission once on mount and reads the device's
 * current coordinates. Purely a device concern (not server state), so it lives
 * outside React Query. Callers should treat `coords === null` as "location
 * unavailable" and fall back gracefully — e.g. rating-only nanny ordering.
 */
export function useDeviceLocation(): DeviceLocationState {
  const [coords, setCoords] = useState<DeviceCoords | null>(null);
  const [status, setStatus] = useState<DeviceLocationStatus>('loading');

  const load = useCallback(async (isMounted: () => boolean) => {
    try {
      setStatus('loading');
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (!isMounted()) return;
      if (permission !== 'granted') {
        setStatus('denied');
        setCoords(null);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!isMounted()) return;
      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setStatus('granted');
    } catch {
      if (!isMounted()) return;
      setStatus('error');
      setCoords(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void load(() => mounted);
    return () => {
      mounted = false;
    };
  }, [load]);

  const refresh = useCallback(() => {
    void load(() => true);
  }, [load]);

  return { coords, status, refresh };
}
