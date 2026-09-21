import { useCallback, useEffect, useState } from 'react';

import { readIsOffline, subscribeIsOffline } from '@mobile/lib/network';

/**
 * "Is the device offline?" for the offline gate. Starts optimistic (online)
 * until the first OS read lands, then follows OS events.
 *
 * `recheck` backs the "Try again" button: one fresh read, applied to the hook
 * and returned, so the caller can act on the outcome without waiting for a
 * re-render.
 */
export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readIsOffline().then((offline) => {
      if (!cancelled) setIsOffline(offline);
    });
    const unsubscribe = subscribeIsOffline(setIsOffline);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const recheck = useCallback(async () => {
    const offline = await readIsOffline();
    setIsOffline(offline);
    return offline;
  }, []);

  return { isOffline, recheck };
}
