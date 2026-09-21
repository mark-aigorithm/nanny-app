# Admin assigns or changes a booking's nanny — design

**Date:** 2026-09-21
**Status:** approved

## Problem

A booking request is broadcast to nearby nannies and the first to accept claims it. When nobody
claims a request, or the claimed nanny drops out, an admin has no way to put a nanny on the
booking. The admin approve path already refuses a booking with no nanny ("Assign a nanny to this
unclaimed request before approving it"), but no endpoint assigns one — so Approve is unreachable
for every request the app can produce today (see the comment in `bookings-page.tsx`).

## Scope

An admin (or an operator with bookings MANAGE) can:

1. **Assign** a nanny to an unclaimed PENDING request. This also approves it — the same
   PENDING → APPROVED step a nanny's own claim performs — so the mother is prompted to pay.
2. **Change** the nanny on an APPROVED or CONFIRMED booking. Money is untouched: `nannyAmount`
   is a snapshot on the booking, not a property of the nanny.

Locked: IN_PROGRESS (the nanny has checked in), COMPLETED, CANCELLED, REFUNDED.

### Eligibility

| Rule | Enforcement |
|---|---|
| Nanny exists, not deleted, `approvalStatus = APPROVED` | hard block |
| No booking of hers overlaps this window (`assertNoConflict`) | hard block |
| Holds every skill add-on the booking was priced for (when skill matching is on) | warning only |
| Within the broadcast radius of the booking's address | warning only |

An admin can knowingly assign outside the radius or without a skill; the picker makes it a
deliberate choice by showing the warning on the row.

## Backend

### `PATCH /admin/bookings/:id/nanny`

Body `{ nannyProfileId: number }` (`AssignBookingNannySchema`). Privilege: `bookings` MANAGE.

`assignBookingNanny(id, adminFirebaseUid, input)` in `admin-booking.service.ts`:

1. Resolve the admin; load the booking (`findAdminBooking`).
2. Status ∉ {PENDING, APPROVED, CONFIRMED} → 400 `A <status> booking is locked and its nanny cannot be changed.`
3. `nannyProfileId === booking.nannyProfileId` → 400 `That nanny is already assigned to this booking.`
4. Load the nanny profile with its user; missing/deleted/not approved → 400 `Only an approved nanny can be assigned.`
5. `assertNoConflict(nannyProfileId, booking.startTime, booking.endTime, id)` — propagates its
   conflict error.
6. Guarded write: `updateMany` where `{ id, deletedAt: null, status: <read status>, nannyProfileId: <read id or null> }`.
   `count === 0` → 409 `This booking changed while you were editing it. Reload and try again.`
   This is the same atomic pattern as the nanny claim, so an admin assign racing a nanny claim on
   one PENDING request has exactly one winner.
   Data:
   - `nannyProfileId`, `nannyDecision: PENDING`, `nannyDecidedAt: null`
   - `adminActionById`, `adminActionAt`
   - if PENDING: `status: APPROVED`, `adminApprovedById`, `adminApprovedAt`
7. Re-read with `bookingInclude`, notify, return `toDto(updated)`.

Notifications (existing `NotificationType`s — no enum migration; the mobile app already routes
these):

| Party | Type / push type | Copy |
|---|---|---|
| New nanny | `BOOKING_APPROVED` / `booking_approved` | "You've been assigned a booking" — "Our team assigned you a booking on {date}." |
| Previous nanny (reassign only) | `BOOKING_CANCELLED` / `booking_cancelled` | "Booking reassigned" — "You were removed from the {date} booking by our team." |
| Mother, was PENDING | `BOOKING_APPROVED` / `booking_approved` | existing "Booking approved — complete payment" copy |
| Mother, was APPROVED/CONFIRMED | `BOOKING_EDITED` / `booking_edited` | "Nanny changed" — "Your nanny for {date} is now {name}." |

The new nanny cannot accept/decline afterwards (that path requires PENDING); `nannyDecision`
stays "No response", exactly as on any admin-approved booking today.

### `GET /admin/bookings/:id/candidates?q=&limit=`

Privilege: `bookings` VIEW. Query `AdminBookingCandidateQuerySchema`: `q` optional string
(trimmed, max 80), `limit` int 1–50 default 20.

`listBookingCandidates(id, query)`:

- Booking must exist (404 otherwise). No status check — the list is harmless to read.
- Nanny profiles where `deletedAt: null`, `user.deletedAt: null`, `user.approvalStatus: APPROVED`,
  `id ≠ booking.nannyProfileId`, and (if `q`) `firstName` or `lastName` contains `q`
  (case-insensitive). Ordered by last name, first name. `take: limit`.
- Include `user` (name, phone, default address coordinates via the same `nannyHomeInclude` the
  broadcast uses), `nannySkills`, `hourlyRate`.
- One extra query for conflicts: bookings with `nannyProfileId in <candidate ids>`, not
  CANCELLED/REFUNDED, `id ≠ booking.id`, overlapping the window → a `Set` of busy ids.
- `getSkillMatchingEnabled()`, `getBroadcastRadiusKm()`, the booking's required skill ids
  (`requiredSkillIds`) and the skill names from `selectedSkillFees`.

Returns `AdminBookingCandidate[]`:

```ts
{
  id: number;             // nannyProfileId
  name: string;
  phone: string | null;
  hourlyRate: number;
  conflict: boolean;      // overlaps another booking of hers — picker disables the row
  missingSkills: string[];// required add-on names she doesn't hold ([] when matching is off)
  distanceKm: number | null; // null when either side has no coordinates
  outsideRadius: boolean; // false when radius is 0 or distanceKm is null
}
```

`matchesSkills` / `heldSkillIds` / `requiredSkillIds` / `nannyHomePoint` are exported from
`booking.service.ts` for reuse (they are module-private today).

### Wiring

- Two rows in `ADMIN_ROUTE_PERMISSIONS`:
  `GET /bookings/:id/candidates` → `section('bookings', 'VIEW')`,
  `PATCH /bookings/:id/nanny` → `section('bookings', 'MANAGE')`.
- Routes in `admin.routes.ts` next to the other booking routes: validate, call the service, `ok()`.
- Schemas + inferred types in `packages/shared/src/admin.ts`:
  `AssignBookingNannySchema`, `AdminBookingCandidateQuerySchema`, `AdminBookingCandidateSchema`.

## Admin UI

### `features/bookings/assign-nanny-modal.tsx`

Props: `{ booking: AdminBooking | AdminBookingDetail; onClose: () => void }` (needs `id`,
`status`, `nanny`, `date`, `mother.name`).

- `Modal` titled "Assign nanny" / "Change nanny".
- Search `Input` (label "Search nannies"), debounced 250 ms → `useQuery(['booking-candidates', id, q])`
  via `fetchBookingCandidates(id, q)`. `LoadingState` / `ErrorState` / empty-state copy
  ("No approved nannies match.").
- Candidate rows as a radio group (`role="radio"`, accessible name = nanny name). Each row: name,
  phone, `EGP {rate}/h`, and badges:
  - `conflict` → `Badge tone="danger"` "Busy" and the row is disabled (`aria-disabled`, title
    "Has an overlapping booking").
  - `missingSkills.length > 0` → `Badge tone="warning"` "Missing: {names}".
  - `outsideRadius` → `Badge tone="warning"` "{distanceKm} km away".
- Footer: `Button variant="ghost"` Cancel; primary button disabled until a selectable row is
  chosen. Label: **"Assign & approve"** when `status === 'PENDING'` (with a `Feedback` line: "The
  parent will be asked to pay once the nanny is assigned."), else **"Assign nanny"** (no current
  nanny) or **"Change nanny"**.
- `useMutation(assignBookingNanny)`: success → invalidate `['bookings']` and `['booking', id]`,
  `toast.success('Nanny assigned')`, `onClose()`; error → `toast.error('Couldn't assign nanny', apiErrorMessage(err))`.

### Entry points

Both render only when `useCanManage('bookings')` and `status ∈ {PENDING, APPROVED, CONFIRMED}`:

- `pages/bookings-page.tsx` `ActionMenu`: `MenuItem` "Assign nanny" (`nanny === null`) or
  "Change nanny", above "Edit times". Opens the modal with that booking.
- `pages/booking-detail-page.tsx` `DetailHeader` actions: the same button beside "Edit booking"
  (hidden while the editor is open).

### Cleanup

- Replace the stale `canApproveBooking` comment in `bookings-page.tsx` (it says no path assigns a
  nanny) and update the page subtitle to mention manual assignment.
- `lib/api.ts`: `fetchBookingCandidates(id, q?)`, `assignBookingNanny(id, nannyProfileId)`.
- `src/test/handlers.ts`: default MSW handlers for the two endpoints.

## Testing

| Tier | File | Covers |
|---|---|---|
| Backend unit | `__tests__/admin-booking.service.test.ts` | assign: each locked status → 400; unapproved nanny → 400; same nanny → 400; conflict propagates; PENDING → APPROVED with approver stamped; APPROVED/CONFIRMED keep status; decision reset; guarded write count 0 → 409; notifications to new nanny, previous nanny, mother (both copies). candidates: excludes current nanny and non-approved; flags conflict / missingSkills / outsideRadius; `missingSkills` empty when matching is off; `q` filters by name; 404 on unknown booking. |
| Backend unit | `__tests__/admin-permissions.test.ts` | walks the router — fails until the two rows exist |
| Backend integration | `__integration__/journeys/a23-admin-assign-nanny.test.ts` | assign on PENDING → APPROVED and the mother can pay; reassign on CONFIRMED swaps the nanny and leaves the payment row intact; conflict is refused; candidates list marks the busy nanny |
| Admin component | `features/bookings/__tests__/assign-nanny-modal.test.tsx` (MSW) | busy row disabled; warning badges rendered; selecting + confirming sends `PATCH …/nanny` with the id and toasts; PENDING booking shows "Assign & approve" |

## Out of scope

- A reason/note on reassignment.
- Reassigning mid-shift (IN_PROGRESS).
- A dedicated `BOOKING_ASSIGNED` notification type.
- Admin-initiated assignment from the nanny's side (nanny detail page).
