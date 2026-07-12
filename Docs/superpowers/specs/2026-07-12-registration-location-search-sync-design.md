# Registration Location Search ↔ Map Sync — Design

**Date:** 2026-07-12
**Status:** Approved (pending spec review)
**Area:** `apps/mobile` — registration flow (nanny + mother)

## Problem

On the registration "Where are you based?" step, the address **text input** and
the **map pin** are completely disconnected:

- Typing in the "Street address" field only stores free text (`draft.address`);
  it does nothing to the map.
- The pin is set solely by tapping/dragging the map, and never fills the address
  field.

Result: a user can type "Ago…" while the pin sits on a default Cairo location,
and the two never reconcile.

This affects both registration screens, which share the same pattern:

- `RegistrationNannyLocationScreen.tsx` (nanny — the screen in the report)
- `RegistrationStep2Screen.tsx` (mother)

## Goal

Make the search input and the map two-way synced:

1. **Type → search → map.** Typing an address shows Google Places autocomplete
   suggestions. Selecting one drops the pin there and recenters the map.
2. **Pin → input.** Tapping the map or dragging the pin reverse-geocodes the new
   coordinates and writes a human-readable address back into the input.

The pin remains the source of truth for the required `latitude`/`longitude`; the
address is a convenience/display field. The flow must still work (Continue still
enabled once a pin exists) even if geocoding is unavailable.

## Scope

- **In:** both nanny and mother registration location screens.
- **In:** Egypt-biased autocomplete (`components=country:eg`), matching the Cairo
  default map center and the `+20` default country code.
- **Out:** backend proxy for the Places key (see "Approach" — deferred hardening).
- **Out:** changing what is persisted/sent to the backend. Only `address`,
  `latitude`, `longitude` (already in the store) are affected.

## Approach

**Direct client-side Google Places calls** (chosen over a backend proxy).

- Consistent with the existing pattern: the react-native-maps `GOOGLE_MAPS_API_KEY`
  is already read from `expo` config and shipped in the client.
- Zero backend work, fastest path.
- Trade-off: Places **web-service** API keys cannot be restricted by app bundle
  ID (only by IP or unrestricted). Mitigate by restricting the key to the Places
  API + Geocoding API and setting quotas in Google Cloud. A backend proxy
  (`/geo/autocomplete`, `/geo/details`) is the future hardening step if key
  exposure becomes a concern; it is intentionally out of scope here.

**Provider:** Google Places API (Autocomplete + Details) for search; Google
Geocoding API for reverse geocoding. All three share one key.

## Architecture / Components

New and changed units, each with a single clear purpose:

### 1. Config wiring — `app.config.ts`

Add to the `extra` block:

```ts
googlePlacesApiKey:
  process.env['GOOGLE_PLACES_API_KEY'] ??
  process.env['GOOGLE_MAPS_API_KEY'] ??
  '',
```

Falling back to `GOOGLE_MAPS_API_KEY` means that if the Places API + Geocoding API
are enabled on the existing Maps key, no new env var is required. Provide a
dedicated `GOOGLE_PLACES_API_KEY` if you prefer a separate, quota-restricted key.

A tiny typed accessor (co-located in `lib/googlePlaces.ts`) reads
`Constants.expoConfig?.extra?.['googlePlacesApiKey']` once, so `extra` access is
not scattered across files.

### 2. `src/lib/googlePlaces.ts` — raw API layer

Three pure async functions over `fetch`, no React:

- `placeAutocomplete(input: string, sessionToken: string): Promise<PlacePrediction[]>`
  - `PlacePrediction = { placeId: string; description: string }`
  - Calls Places Autocomplete with `components=country:eg`, `language=en`,
    `sessiontoken`.
- `placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails>`
  - `PlaceDetails = { latitude: number; longitude: number; formattedAddress: string }`
  - Requests only `fields=geometry,formatted_address` (cost control), passes the
    same `sessiontoken` (closes the billing session).
- `reverseGeocode(coords: { latitude: number; longitude: number }): Promise<string | null>`
  - Google Geocoding API `latlng=…`; returns the first `formatted_address` or
    `null` on empty/error.

Behavior:
- Missing key → functions resolve to empty/`null` (never throw); autocomplete
  simply shows nothing.
- Non-OK HTTP or a non-`OK`/`ZERO_RESULTS` Google `status` → treated as empty
  result, logged once (dev only). Errors never propagate to the UI.

### 3. `src/hooks/usePlacesAutocomplete.ts` — search state

Owns the interactive search lifecycle:

- Input: current query string (controlled by caller).
- Debounces the query ~300ms before calling `placeAutocomplete`.
- Holds a **session token** (generated with a small uuid helper), regenerated
  after each successful selection so billing groups autocomplete + details
  correctly.
- Exposes: `predictions`, `isLoading`, and
  `selectPlace(placeId): Promise<PlaceDetails | null>` (calls `placeDetails`,
  then rotates the session token and clears predictions).
- Cancels stale in-flight requests (ignore results whose query no longer matches
  / whose request was superseded) to avoid out-of-order dropdown flicker.
- Queries shorter than 3 chars produce no request and empty predictions.

### 4. `src/components/LocationSearchInput.tsx` (+ `styles/location-search-input.styles.ts`)

Self-contained search field with dropdown. Reuses the existing
`iconInputWrapper` / `iconInputInner` visual style (moved/duplicated into its own
style file, using only theme tokens).

Props:

```ts
type LocationSearchInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSelectPlace: (
    coords: { latitude: number; longitude: number },
    address: string,
  ) => void;
  placeholder?: string;
};
```

- Renders the icon + `TextInput` (value/onChangeText controlled by the parent so
  it mirrors `draft.address`).
- Uses `usePlacesAutocomplete` internally.
- Renders an absolutely-positioned suggestions list directly beneath the input
  (`position: 'absolute'`, high `zIndex` + Android `elevation`) so it overlays the
  map below rather than pushing layout. Each row is a `Pressable` showing the
  prediction `description`.
- On row press: calls `selectPlace`, and on success calls
  `onSelectPlace(coords, formattedAddress)`, then dismisses the keyboard and
  clears the dropdown.
- Dropdown hidden when: no predictions, input blurred (with a small delay so a
  tap registers), or after selection. Parent ScrollViews already use
  `keyboardShouldPersistTaps="handled"`, so taps land while the keyboard is open.

### 5. `src/components/HomeLocationMapCard.tsx` — recenter on external change

Add recenter-on-search behavior without fighting user drags:

- Keep a `lastEmittedRef` of the coords the map itself last emitted via
  `onChange` (tap/drag).
- In an effect on `coords`: if incoming `coords` differ from `lastEmittedRef`
  (i.e. the change came from outside — GPS first-fix or a search selection),
  `animateToRegion` to it. If they match (self-originated drag), do nothing.
- The existing first-GPS-fix effect is folded into this same mechanism.

This keeps `coords` as the single source of truth while letting search selections
move the camera.

### 6. Screen wiring — both registration screens

In `RegistrationNannyLocationScreen.tsx` and `RegistrationStep2Screen.tsx`,
replace the inline "Street address" `View + Ionicons + TextInput` block with:

```tsx
<LocationSearchInput
  value={draft.address}
  onChangeText={(val) => patch({ address: val })}
  onSelectPlace={(coords, address) => {
    setLocationError(null);
    patch({ ...coords, address });
  }}
  placeholder="Street address"
/>
```

And extend the map `onChange` to reverse-geocode:

```tsx
onChange={(coords) => {
  setLocationError(null);
  patch(coords);
  void reverseGeocode(coords).then((address) => {
    if (address) patch({ address });
  });
}}
```

(Extracted into a small `handlePinChange` helper in each screen to keep JSX
clean.) The mother screen keeps its separate optional "Neighbourhood" field
unchanged.

## Data Flow

Single source of truth: `useRegistrationDraftStore` (`address`, `latitude`,
`longitude`).

```
Type in input ──▶ onChangeText ──▶ patch({ address })         (mirrors text)
                     │
                     └─▶ usePlacesAutocomplete (debounced) ──▶ predictions dropdown
Select suggestion ──▶ selectPlace → placeDetails
                     └─▶ patch({ address, latitude, longitude })
                                     │
                                     ▼
                         HomeLocationMapCard sees external coords change
                                     └─▶ animateToRegion + pin moves

Tap map / drag pin ──▶ onChange(coords) ──▶ patch(coords)
                             └─▶ reverseGeocode(coords) ──▶ patch({ address })
                                                              (input text updates)
```

## Error Handling

- **No API key / network failure / quota:** autocomplete shows no suggestions;
  reverse geocode leaves the current address untouched. No error UI, no thrown
  exceptions. The map pin still sets the required coords, so Continue works.
- **Out-of-order responses:** dropped by the hook's staleness guard.
- **Reverse geocode returns null:** address field is simply left as-is.

## Testing

React Native Testing Library, following existing `__tests__` conventions.

- `lib/googlePlaces.ts`: mock `fetch`; assert URL/params (country bias, fields,
  session token) and parsing; assert empty/`null` on missing key, HTTP error, and
  `ZERO_RESULTS`.
- `hooks/usePlacesAutocomplete.ts`: debounce fires one request; short queries
  make none; `selectPlace` returns details and rotates the token; stale results
  ignored.
- `components/LocationSearchInput.tsx`: typing renders predictions; pressing a row
  calls `onSelectPlace` with parsed coords/address and clears the dropdown.
- `HomeLocationMapCard.tsx`: external `coords` change triggers `animateToRegion`;
  a self-emitted drag does not.
- Coverage stays within the enforced 80% threshold.

## Env / Ops Notes

- Set `GOOGLE_PLACES_API_KEY` (or reuse `GOOGLE_MAPS_API_KEY`) locally in the
  untracked `.env` and as an EAS secret for builds.
- In Google Cloud: enable **Places API** and **Geocoding API**; restrict the key
  and set daily quotas (web-service keys can't be bundle-restricted).

## Files

**New**
- `apps/mobile/src/lib/googlePlaces.ts`
- `apps/mobile/src/hooks/usePlacesAutocomplete.ts`
- `apps/mobile/src/components/LocationSearchInput.tsx`
- `apps/mobile/src/components/styles/location-search-input.styles.ts`
- Corresponding `__tests__` files

**Changed**
- `apps/mobile/app.config.ts` — `googlePlacesApiKey` in `extra`
- `apps/mobile/src/components/HomeLocationMapCard.tsx` — recenter on external coords
- `apps/mobile/src/screens/auth/RegistrationNannyLocationScreen.tsx`
- `apps/mobile/src/screens/auth/RegistrationStep2Screen.tsx`
