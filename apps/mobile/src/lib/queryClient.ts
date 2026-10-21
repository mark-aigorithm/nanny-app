import { AppState } from 'react-native';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

import { clearPromptedSurveys } from '@mobile/store/surveyPromptStore';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60, // 1 minute
    },
  },
});

/** Root key of the app-version check, which must outlive sign-in/out (see clearUserQueries). */
export const APP_VERSION_CHECK_KEY = 'app-version-check';

/**
 * Drop every cached server query and mutation on an account change, except the
 * app-version check. UpdateGate is mounted once at the root and does not
 * re-render on auth changes, so removing its query would orphan its observer
 * (it would never refetch on reopen). The check is not user data.
 */
export function clearUserQueries(): void {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== APP_VERSION_CHECK_KEY });
  queryClient.getMutationCache().clear();
  // Which surveys were prompted is per account too.
  clearPromptedSurveys();
}

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
