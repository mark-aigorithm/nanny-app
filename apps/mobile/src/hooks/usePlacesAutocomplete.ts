import { useCallback, useEffect, useRef, useState } from 'react';

import {
  newSessionToken,
  placeAutocomplete,
  placeDetails,
  type PlaceDetails,
  type PlacePrediction,
} from '@mobile/lib/googlePlaces';

// Minimum characters before we hit the Places API — avoids noisy 1–2 char
// requests and keeps billing down.
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

interface PlacesAutocompleteState {
  predictions: PlacePrediction[];
  isLoading: boolean;
  /** Resolve a prediction to coordinates + address, then reset the session. */
  selectPlace: (placeId: string) => Promise<PlaceDetails | null>;
  /** Clear predictions without a selection (e.g. on blur). */
  clear: () => void;
}

/**
 * Debounced Google Places autocomplete keyed off a query string the caller
 * controls. Manages a billing session token (rotated after each selection) and
 * guards against out-of-order responses so the dropdown never flickers stale
 * results.
 */
export function usePlacesAutocomplete(query: string): PlacesAutocompleteState {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sessionTokenRef = useRef<string>(newSessionToken());
  // Monotonic id: only the most recently issued request may commit its result.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestIdRef.current += 1; // invalidate any in-flight request
      setPredictions([]);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    const timer = setTimeout(() => {
      void placeAutocomplete(trimmed, sessionTokenRef.current).then((results) => {
        if (requestId !== requestIdRef.current) return; // superseded
        setPredictions(results);
        setIsLoading(false);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const selectPlace = useCallback(async (placeId: string) => {
    requestIdRef.current += 1; // cancel any pending autocomplete
    const details = await placeDetails(placeId, sessionTokenRef.current);
    // Rotate the session token: the autocomplete+details billing session is
    // now closed, so the next keystrokes start a fresh one.
    sessionTokenRef.current = newSessionToken();
    setPredictions([]);
    setIsLoading(false);
    return details;
  }, []);

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    setPredictions([]);
    setIsLoading(false);
  }, []);

  return { predictions, isLoading, selectPlace, clear };
}
