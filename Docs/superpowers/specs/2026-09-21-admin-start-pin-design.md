# Start PIN in the admin booking detail — design

*2026-09-21.*

## Problem

The parent reveals a 4-digit start PIN in her app and reads it to the nanny, who enters it to
check in. Support cannot see that PIN: `generateStartPin` returns the plaintext once and persists
only an unsalted sha-256 (`bookings.start_pin_hash`), so the admin booking detail has nothing to
show when a parent or nanny calls in mid hand-off.

## Decisions

| Topic | Decision |
|---|---|
| Where the plaintext comes from | Store it. A 4-digit code with a 15-minute TTL, single use and an attempt cap gains nothing from an unsalted hash — anyone who can read the row can reverse it in 10k guesses — and the console needs to read it back. The hash is replaced, not supplemented: keeping both would leave a reviewer asking what the hash is for. |
| Column change | `start_pin_hash` → `start_pin`, under the backend two-release rule (migrations run before traffic switches; an old task whose Prisma client still selects `start_pin_hash` would 500 on every booking query if the column vanished). **This change** adds `start_pin` and stops reading or writing `start_pin_hash`, which stays in the schema with a "drop next release" comment. **Next release** drops it. |
| Who sees it | Anyone who can open the admin booking detail — the same audience as the mother's phone and email on that page. No new privilege. |
| When the API exposes it | Only while live: `startPin != null && startPinExpiresAt > now`, decided on the server so the admin's clock is not involved. Otherwise both `startPin` and `startPinExpiresAt` are `null` — not generated, expired and already used all read the same. |
| Mother / nanny flow | Unchanged in behaviour: same window, TTL, attempt cap, reset on regenerate, cleared on check-in. Only the stored form of the PIN differs. |
| Out of scope | Admin-side PIN generation, an attempt counter on the page, auto-refresh of the detail page. |

## Surfaces

- **Schema** `Booking.startPin String? @map("start_pin")`, migration `add_booking_start_pin`
  (`ALTER TABLE bookings ADD COLUMN start_pin TEXT`). `startPinHash` kept, commented as unused. The
  `EmailVerification` doc comment that cites `Booking.startPinHash` as precedent is reworded.
- **Backend** `lib/pin.ts` loses `hashPin`; `randomStartPin` stays. `booking.service.ts`:
  `generateStartPin` writes `startPin: pin`; `checkInBooking` guards on `booking.startPin`, compares
  `pin !== booking.startPin`, clears `startPin: null`. `admin-booking.service.ts` `toDetailDto` adds
  `startPin` / `startPinExpiresAt`, null unless live.
- **Shared** `AdminBookingDetailSchema` gains `startPin: z.string().nullable()` and
  `startPinExpiresAt: z.string().nullable()`.
- **Admin** `booking-detail-page.tsx`, Schedule card, a "Start PIN" row above "Checked in":
  `<code>1234</code> · expires <time>` while live, `—` otherwise. Read-only.

## Tests

- `pin.test.ts`: the hash test goes; the 4-digit test stays.
- `booking-shift.test.ts`: fixtures carry `startPin`; the generate test asserts the stored value is
  the returned PIN; the check-in test asserts `startPin` is cleared. Other unit fixtures that set
  `startPinHash: null` are renamed.
- `admin-booking.service.test.ts`: `getAdminBooking` exposes a live PIN with its expiry; returns
  null for an expired one; returns null when none was generated.
- Mobile E2E `advance.js` takes the PIN from the API response and is unaffected.
- `Docs/test-inventory.txt` is a dated snapshot of an earlier HEAD and is left alone.

## Follow-ups

- Migration `drop_booking_start_pin_hash` in the next release.
