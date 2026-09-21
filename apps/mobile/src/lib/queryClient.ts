import { QueryClient, onlineManager } from '@tanstack/react-query';

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
