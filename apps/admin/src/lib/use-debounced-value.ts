import { useEffect, useState } from 'react';

/**
 * `value`, but only after it has stopped changing for `delayMs` — so a live
 * count is asked for once the admin pauses, not on every tick or keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
