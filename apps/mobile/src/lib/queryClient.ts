import { AppState } from 'react-native';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60, // 1 minute
    },
  },
});

/**
 * Point React Query's online/offline awareness at the OS instead of its
 * default (`navigator.onLine`, meaningless on a device). Queries that fail
 * while offline pause instead of burning their retries, and refetch by
 * themselves (`refetchOnReconnect`) the moment `subscribe` reports the
 * network is back. Called once at app start with `subscribeIsOffline`.
 */
export function bindOnlineManager(
  subscribe: (listener: (isOffline: boolean) => void) => () => void,
): void {
  onlineManager.setEventListener((setOnline) =>
    subscribe((isOffline) => setOnline(!isOffline)),
  );
}

/**
 * Point React Query's focus awareness at the app coming to the foreground. Its
 * default listens for browser `visibilitychange`, which never fires on a
 * device — so without this a screen kept mounted (a tab) shows whatever it
 * fetched first, however long the app sat in the background. With it, stale
 * queries refetch the moment the app is active again. Called once at app start
 * with `subscribeAppActive`.
 */
export function bindFocusManager(
  subscribe: (listener: (isActive: boolean) => void) => () => void,
): void {
  focusManager.setEventListener((setFocused) => subscribe((isActive) => setFocused(isActive)));
}

/** Calls `listener` with whether the app is in the foreground, on every change. */
export function subscribeAppActive(listener: (isActive: boolean) => void): () => void {
  const subscription = AppState.addEventListener('change', (state) => listener(state === 'active'));
  return () => subscription.remove();
}
