import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Refetch the given queries each time the screen comes back into focus. Tab
 * screens stay mounted, so a balance that changed elsewhere (a booking spent
 * package hours, a completed shift earned points) is otherwise shown stale
 * until the app restarts. The first focus is skipped: the screen just mounted
 * and its queries are already fetching.
 */
export function useRefetchOnFocus(refetches: Array<() => unknown>, enabled = true): void {
  const hasFocused = useRef(false);
  const latest = useRef(refetches);
  latest.current = refetches;

  useFocusEffect(
    useCallback(() => {
      if (!hasFocused.current) {
        hasFocused.current = true;
        return;
      }
      if (!enabled) return;
      for (const refetch of latest.current) void refetch();
    }, [enabled]),
  );
}
