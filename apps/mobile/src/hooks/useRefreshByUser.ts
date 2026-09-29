import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Pull-to-refresh state that stays visible for the full duration of a user-initiated
 * refetch and never flips on background refetches.
 *
 * Binding `RefreshControl`'s `refreshing` prop directly to React Query's `isRefetching`
 * causes the spinner to appear inconsistently: a fast response flips `isRefetching`
 * true→false within a frame, so the native spinner never paints. It can also appear
 * without a pull whenever a background refetch runs (polling, `invalidateQueries`,
 * window-focus refetch).
 *
 * This hook tracks a local boolean set synchronously on pull and cleared only when the
 * refetch promise resolves, so the spinner is stable and tied to the user gesture.
 *
 * Pass the query's `refetch` (or a function that awaits several refetches, e.g.
 * `() => Promise.all([refetchA(), refetchB()])`).
 */
export function useRefreshByUser(onRefresh: () => Promise<unknown>) {
  const [isRefreshingByUser, setIsRefreshingByUser] = useState(false);

  const refreshByUser = useCallback(async () => {
    setIsRefreshingByUser(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshingByUser(false);
    }
  }, [onRefresh]);

  return { isRefreshingByUser, refreshByUser };
}

/**
 * `useRefreshByUser` for a screen whose data lives in several cards, each with its own
 * query (a list plus banners above it). A pull refetches every query mounted right now
 * rather than naming them, so a card added to the screen later is covered too.
 */
export function useRefreshScreenByUser() {
  const queryClient = useQueryClient();
  const refetchActive = useCallback(
    () => queryClient.refetchQueries({ type: 'active' }),
    [queryClient],
  );
  return useRefreshByUser(refetchActive);
}
