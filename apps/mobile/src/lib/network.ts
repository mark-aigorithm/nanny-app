import * as Network from 'expo-network';
import type { NetworkState } from 'expo-network';

/**
 * The only module that talks to `expo-network`. Everything else consumes the
 * one boolean the app cares about — "is the device offline?" — so the OS
 * state shape stays out of hooks and components.
 *
 * `isConnected`/`isInternetReachable` are `undefined` when the OS has not
 * reported yet (cold start) or cannot validate reachability (some emulators).
 * Both count as ONLINE: a false "you're offline" over a working app is worse
 * than a late one.
 */
export function isOfflineState(
  state: Pick<NetworkState, 'isConnected' | 'isInternetReachable'>,
): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/** One fresh read of the OS state. A failed read counts as online. */
export async function readIsOffline(): Promise<boolean> {
  try {
    return isOfflineState(await Network.getNetworkStateAsync());
  } catch {
    return false;
  }
}

/**
 * How long after a connectivity event to read the state again. Long enough for
 * Android to finish tearing the lost network down, short enough that the
 * offline screen still feels immediate.
 */
export const SETTLE_REREAD_MS = 1500;

/**
 * Calls `listener` on every OS connectivity change, then once more with a
 * fresh read shortly after. Returns the unsubscribe.
 *
 * The second read is not belt-and-braces. On Android, expo-network builds the
 * event it sends from `onLost` by asking for the *active* network at that
 * instant — and that can still name the network being lost. The event then
 * says "online", nothing follows it, and the app never notices it went
 * offline (seen on the emulator as airplane mode with no offline screen). By
 * the settled re-read the OS has caught up.
 */
export function subscribeIsOffline(listener: (isOffline: boolean) => void): () => void {
  let active = true;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const subscription = Network.addNetworkStateListener((state) => {
    listener(isOfflineState(state));
    clearTimeout(settle);
    settle = setTimeout(() => {
      void readIsOffline().then((offline) => {
        if (active) listener(offline);
      });
    }, SETTLE_REREAD_MS);
  });
  return () => {
    active = false;
    clearTimeout(settle);
    subscription.remove();
  };
}
