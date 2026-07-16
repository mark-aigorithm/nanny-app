# Design: Radius-filtered nanny broadcast, race-safe accept, admin pending SLA

**Date:** 2026-07-15
**Status:** Approved

## Problem

When a parent submits a care request, the backend already broadcasts it (in-app +
FCM push) to every eligible nanny, and the first nanny to accept claims it — but:

1. The broadcast has **no distance filter**: nannies far from the family get pinged.
2. The radius is not configurable by operations.
3. The accept path is transaction-guarded but not atomic — under true concurrency
   two nannies could both pass the `status === PENDING` re-read.
4. Admins cannot see **how long** a request has been waiting for a nanny, so
   requests that nobody accepts go stale silently.

## What already exists (do not rebuild)

- `notifyBookingBroadcast` (`apps/backend/src/services/booking.service.ts:256`) —
  broadcasts to all approved, profile-complete, non-conflicting nannies + admins.
- `Notification` / `DeviceToken` Prisma models, `notification.service.ts`
  (`dispatchPush` via `firebaseMessaging.sendEachForMulticast`, in-app rows),
  mobile push registration + deep-linking (`usePushNotifications.ts`).
- Nanny Requests tab (`NannyRequestsScreen.tsx`) backed by
  `GET /bookings/available` (`listAvailableBookings`), with an Accept button →
  `POST /bookings/:id/accept`.
- Mother notification on claim: `notifyMotherNannyClaimed`
  (`booking.service.ts:315`) — push + in-app `BOOKING_APPROVED`.
- `AppSettings` key/value store + typed accessors (`app-settings.service.ts`) and
  the admin Configuration page (`apps/admin/src/pages/settings-page.tsx`).
- PostGIS enabled; distance-query pattern via `ST_DistanceSphere` in
  `nanny.service.ts:283`.
- `User.latitude` / `User.longitude` (`Decimal(10,7)`, nullable) on both mothers
  and nannies.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Missing coordinates | Fall back to notify-all: a booking without coordinates broadcasts to all eligible nannies; a nanny without coordinates is always included/sees everything. Never block booking creation on location. |
| SLA thresholds | Configurable in admin settings (warning + critical minutes), not hardcoded. |
| "Ignore" on the notification | Dismiss only — no server-side state, request stays in the Requests pool. |
| Radius scope | Filters **both** the push broadcast and the Requests-tab pool (`/bookings/available`). |
| Booking location source | **Snapshot** the mother's `latitude`/`longitude` onto the Booking at creation (approach B) — stable if the mother later edits her address, cheap to query, future-proofs booking at a custom address. |
| Race handling | Atomic conditional claim via status-guarded `updateMany` (same pattern as the PIN check-in code at `booking.service.ts:1073`). |

## Design

### 1. Settings

Three new `AppSettings` keys (add to `KEYS`, `DEFAULTS`, `FIELD_TO_KEY` in
`app-settings.service.ts`, and to the `PlatformConfig` shape):

| Admin label | Key | Default | Semantics |
|---|---|---|---|
| Broadcast radius (km) | `broadcast_radius_km` | 10 | `0` disables radius filtering (notify all). |
| Pending warning threshold (min) | `pending_warning_minutes` | 15 | Pending booking row turns yellow at/after this age. |
| Pending critical threshold (min) | `pending_critical_minutes` | 30 | Row turns red at/after this age. |

Admin Configuration page (`settings-page.tsx`): new **Matching** section holding
the radius field and the two SLA threshold fields. Validation: radius ≥ 0;
0 < warning < critical (integers, minutes).

### 2. Booking location snapshot

- Prisma migration: add nullable `latitude Decimal? @db.Decimal(10, 7)` and
  `longitude Decimal? @db.Decimal(10, 7)` (snake_case `@map`) to `Booking`.
- `createBooking` copies the mother's current `User.latitude`/`longitude` onto
  the new booking. Both may be null — that booking then broadcasts to all.
- Existing pending bookings (pre-migration) have null coordinates → notify-all
  fallback applies; no backfill needed.

### 3. Radius-filtered broadcast

In `notifyBookingBroadcast`:

- Load `broadcast_radius_km`. If radius > 0 **and** the booking has coordinates,
  restrict eligible nannies to those where
  `ST_DistanceSphere(nanny point, booking point) <= radius * 1000`
  **OR** the nanny has no coordinates (inclusion fallback).
- Existing eligibility filters unchanged: `approvalStatus = APPROVED`,
  `isProfileComplete = true`, no overlapping booking.
- If radius = 0 or booking has no coordinates → current notify-all behavior.
- Admins are always notified regardless of distance.
- Geo predicate implemented as a raw-SQL id-selection step (pattern from
  `nanny.service.ts:283`) feeding the existing Prisma eligibility query, so the
  overlap filter stays in Prisma.
- Notification content and deep-link behavior unchanged; "Ignore" remains a
  client-side dismiss with no endpoint.

### 4. Radius-filtered Requests pool

`listAvailableBookings` (`GET /bookings/available`) applies the same rule from
the nanny's perspective: if radius > 0 and the requesting nanny has coordinates,
return only unclaimed PENDING bookings that either fall within the radius or
have no coordinates. A nanny without coordinates sees the full pool. This keeps
"what I was pinged about" and "what I can browse" consistent.

### 5. Race-safe accept

In `applyNannyDecision`'s unclaimed-ACCEPT path, replace the read-then-update
claim with an atomic conditional update:

```ts
const claimed = await tx.booking.updateMany({
  where: { id: bookingId, status: 'PENDING', nannyProfileId: null },
  data: {
    nannyProfileId,
    status: 'APPROVED',
    nannyDecision: 'ACCEPTED',
    nannyDecidedAt: now,
  },
});
if (claimed.count === 0) throw conflictError('already accepted');
```

- The database guarantees exactly one winner under any concurrency.
- `assertNoConflict` (nanny's own schedule) still runs before the claim attempt.
- Losers receive a clean conflict error ("This request was already accepted by
  another nanny"); the mobile Requests tab already refetches on error/refresh.
- `notifyMotherNannyClaimed` fires only for the winner (post-commit, as today).
- The explicitly-assigned decision path (accept/decline of an assigned booking)
  keeps its current logic.

### 6. Admin bookings page — pending age + SLA colors

`apps/admin/src/pages/bookings-page.tsx`:

- New **Waiting** column, rendered for PENDING rows only: age derived from the
  row's existing `createdAt` ("8m", "1h 24m"), ticking client-side (re-render
  every ~30s; no backend change needed for the value itself).
- Row/badge tone by age vs thresholds fetched from platform config:
  `< warning` = default, `≥ warning` = yellow/warn tone, `≥ critical` = red/
  danger tone. Non-PENDING rows unaffected.
- Styling follows the admin design system (nanny-app-admin-design skill) —
  reuse existing tone tokens, no new colors.

### 7. Error handling summary

| Case | Behavior |
|---|---|
| Booking has no coordinates | Broadcast/pool behave as today (notify-all). |
| Nanny has no coordinates | Always notified / sees full pool. |
| Radius setting = 0 | Filtering disabled globally. |
| Two nannies accept simultaneously | Exactly one wins (DB-guarded); loser gets a conflict error and the list refreshes. |
| Push delivery failure | Existing behavior: invalid tokens pruned; in-app notification row still created. |

### 8. Testing

Backend (Vitest/Jest per existing setup, 80% coverage threshold):

- Radius selection: nanny inside radius (notified), outside (not), nanny with
  null coords (notified), booking with null coords (all notified), radius=0
  (all notified).
- `listAvailableBookings`: same matrix from the nanny's side.
- Atomic claim: concurrent double-accept → exactly one `count === 1`; second
  caller gets conflict error; booking ends with a single `nannyProfileId`.
- Settings: new keys validated (radius ≥ 0, warning < critical), defaults
  returned when unset.
- `createBooking`: snapshots mother's coordinates; handles null.
- Update existing broadcast/accept tests for the new claim path.

Admin: component-level check of age formatting + threshold tone selection.

## Out of scope

Payment flow, PIN check-in, decline endpoint semantics, notification copy
changes, per-nanny "ignore" persistence, booking at a custom address (enabled
by the snapshot but not built now).
