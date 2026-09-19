# Addresses — design

*2026-09-19. Implemented on the `worktree-addresses` branch; see the plan at
`C:\Users\markb\.claude\plans\i-want-to-add-ethereal-hartmanis.md` for the step list.*

## Problem

A user had exactly one address, on the `users` row (`address`, `latitude`, `longitude`), set at
registration and rewritten by `PATCH /auth/me`. The booking flow's "Where" step could only replace
that home, a booking snapshotted the coordinates alone, and the booking response carried no address
at all — a nanny never saw where she was going in-app.

## Decisions

| Topic | Decision |
|---|---|
| Source of truth | An `addresses` table, for **everyone**. Mothers hold many (one default); a nanny holds exactly one. `users.address/latitude/longitude` are backfilled into it, no longer read or written, and dropped in a later release (two-release rule). |
| Row shape | `label`, `formattedAddress` (Google's line), `governorate`, `area`, `street` (auto-filled from Google, editable), `building`, `floor`, `apartment` (typed), `landmark` (free text — the Egyptian way of finding a door), `latitude`, `longitude`, `isDefault`. |
| Google's parts (probed live) | Egypt has no `locality`. Governorate = `administrative_area_level_1` minus " Governorate"; area = `administrative_area_level_2`; street = `street_number + route`, present only when the result is a `street_address`/`premise` — a dropped pin lists a plus code or POI first, so reverse geocoding prefers the first street result. Building/floor/apartment never come from Google. |
| One default per user | Kept by `address.service` in a transaction (clear the old default, set the new). Not a partial unique index: Prisma cannot declare one and it shows as permanent drift in `migrate diff`. |
| Booking link | `bookings.address_id` FK **plus** `booked_address` JSON snapshot (like `bookedChildren`). The existing `bookings.latitude/longitude` stay as the broadcast-radius source, copied from the chosen address. Editing or deleting an address never moves a booking already made. |
| Nanny visibility | `BookingResponse.address = { area, details }`: `area` ("Maadi, Cairo") always; `details` null for a nanny until the booking is CONFIRMED / IN_PROGRESS / COMPLETED. Mother and console always get `details`. |
| Who edits | Mothers: full CRUD in-app (`/addresses`). Nannies: captured once at registration, read-only in-app; **admin** edits via `PUT /admin/nannies/:id/address` with a map + Places editor (`@vis.gl/react-google-maps`, `VITE_GOOGLE_MAPS_API_KEY`; degrades to typed coordinates without a key). |
| Registration | Untouched (owned by a parallel session). `registerUser` keeps taking the flat `address/latitude/longitude` and writes them as the user's first default "Home" row, parts null. |
| Compatibility | `UserResponse.address/latitude/longitude` and `NannyProfileResponse.location` are derived from the default address, so clients that only read them keep working. `UpdateProfileRequest` and the nanny-profile patch bodies no longer carry location fields. |

## Surfaces

- **Shared** `packages/shared/src/address.ts`: `AddressInputSchema`, `AddressSchema`, `UpdateAddressSchema`, `BookingAddressSchema`, `BookingLocationSchema`, `formatAddressArea`, `parseAddressComponents`. `CreateBookingSchema.addressId` required.
- **Backend** `address.service.ts` + `/addresses` routes (GET / POST / PATCH /:id / DELETE /:id / POST /:id/default; nannies read only). `createBooking` books at an owned live address (404 otherwise) and includes it in the idempotency key. `toBookingResponse` takes a viewer. Nanny listing SQL, the broadcast radius, the open pool and the three admin directories read the default address. Admin: `GET /mothers/:id/addresses`, `PUT /nannies/:id/address`; booking edit takes `addressId`.
- **Mobile** `useAddresses` hooks; `AddressForm` / `AddressFormSheet`; Account → Addresses screen; the Where step is a picker (default preselected, "Add new" inline); `BookingAddressCard` on both detail screens; area line on the open-requests list; `reverseGeocodeDetailed`.
- **Admin** `features/addresses/address-editor` (+ `address-map`), Address card on the nanny page, address list on the mother page, Where card on the booking page.

## Tests

Unit: `address.service`, `booking-address` (snapshot + reveal gate), `auth-register-address`, shared `address` / `booking-address`, mobile `useAddresses` / `AddressForm` / `BookingLocationSection` / `AddressesScreen` / `BookingAddressCard` / `googlePlaces`, admin `address-editor`. Integration: journey `a21-addresses` (address book, booking at a chosen address, the reveal, an operator moving a nanny). Admin E2E: `b08-nanny-address`. Factories place every user on an address row; every suite that posted a booking sends `addressId`.

## Follow-ups

- `drop_user_location_columns` migration one release later.
- Registration capturing structured parts (`createAddress` already accepts them).
