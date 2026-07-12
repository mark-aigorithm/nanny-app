# Registration location picker — design

Date: 2026-07-11

## Goal

Capture home coordinates during registration for both roles (mother and nanny)
with a Google Maps draggable-pin picker, so proximity features (nanny radius
search, distance sorting, emergency booking) work for every account.

## UX (mobile)

- Registration Step 2 (`RegistrationStep2Screen`, "Location & preferences")
  gains a map card below the address text field: a `react-native-maps`
  `MapView` (~220px tall) with a draggable pin (marker follows map center or
  drag).
- On mount, request foreground location permission (same approach as
  `useDeviceLocation`); center the map on the device position. If denied or
  unavailable, fall back to a Cairo default region.
- Dragging the pin / moving the map updates `latitude`/`longitude` in the
  registration draft store.
- The pin is **required for both roles**: "Next" shows an inline error until
  coordinates are set. Pre-centering on GPS counts as set once the user has
  granted permission (pin initialises to the device position).
- Address remains a hand-typed text field. No reverse geocoding, no Places
  autocomplete (out of scope).

## Data model & API

- `users` table: add nullable `latitude`/`longitude` `Decimal(10,7)` columns
  (+ Prisma migration). Also store the registration `address` on the User —
  today a mother's address is silently dropped.
- `RegisterRequestSchema` (packages/shared): add required
  `latitude: z.number().min(-90).max(90)` and
  `longitude: z.number().min(-180).max(180)`.
- `UserResponseSchema`: add nullable `latitude`/`longitude` (and `address`).
- Register service: write lat/lng/address on the User row for both roles; for
  nannies also copy lat/lng into the existing `NannyProfile.latitude/longitude`
  so proximity search and emergency booking stay untouched (approach A —
  mirror rather than migrate consumers).

## Compatibility

Required fields break older client builds that register without coordinates.
Acceptable pre-launch; mobile and backend ship together.

## Testing

- Backend: extend register service/route tests — validation of the new
  required fields, User row populated, NannyProfile mirror populated for
  nannies, address stored for mothers.
- Mobile: registration draft store unit test for lat/lng; Step 2 blocks Next
  without coordinates.

## Out of scope

Reverse geocoding, Places autocomplete, editing location post-registration.
