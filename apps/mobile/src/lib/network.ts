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

/** Calls `listener` on every OS connectivity change. Returns the unsubscribe. */
export function subscribeIsOffline(listener: (isOffline: boolean) => void): () => void {
  const subscription = Network.addNetworkStateListener((state) => {
    listener(isOfflineState(state));
  });
  return () => subscription.remove();
}
