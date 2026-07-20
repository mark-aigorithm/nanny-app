# Mandatory Nanny Rating After Booking Completion — Design

**Date:** 2026-07-16
**Status:** Approved
**Scope:** Parent side of the mobile app (`apps/mobile`). No backend changes.

## Goal

After a booking completes, the parent must rate the nanny before continuing to use the
app (Uber-style). The prompt is a non-dismissible bottom sheet that appears on app
open/foreground and immediately when a booking completes mid-session. Closing and
reopening the app re-surfaces it.

## Decisions

| Question | Decision |
|---|---|
| Dismissibility | Hard block, no escape. No X, no backdrop dismiss, Android back is a no-op. Only submitting a rating closes it. |
| Backlog of old unrated bookings | Most recent only: prompt only if the *single most recently completed* booking is unrated. Older unrated bookings stay optionally rateable from booking history. |
| Triggers | App open, app foreground (`AppState` → `active`), `booking_completed` push received in foreground, and `booking_completed` push tap (redirected from booking-detail to the rating sheet). |
| Audience | Authenticated mothers only. Guest mode and nanny side are unaffected. |

## Architecture

Follows the existing global prompt pattern (`RegisterPromptModal`,
`NannyShiftPromptHost` + `nannyShiftPromptStore`):

```
app/(parent)/_layout.tsx
  └── <RatingPromptHost />           (mounted next to <RegisterPromptModal />)
        ├── usePendingRating()       detection hook (React Query)
        ├── ratingPromptStore        Zustand: pending booking, visibility
        └── <RatingPromptSheet />    non-dismissible bottom sheet (RN Modal)
```

### Detection — `usePendingRating()`

- Query: `GET /bookings?status=COMPLETED&sortBy=date&sortDir=desc&limit=1`
  (existing endpoint; each item includes `myReview`).
- Pending rating exists iff the returned booking has `myReview === null`.
- Refetch on: mount, `AppState` active transition, and explicit invalidation from the
  push handlers. Disabled unless the user is an authenticated mother.

### Enforcement — `RatingPromptSheet`

- RN `Modal` (pattern: `TimeSelectSheet`), bottom-sheet presentation.
- No close affordance: backdrop taps ignored, `onRequestClose` no-op, no swipe.
- Submit disabled until a star (1–5) is selected; comment optional (max 500 chars,
  matching `ReviewScreen`).
- Submits via existing `useCreateReview(bookingId)` →
  `POST /nanny/bookings/:bookingId/review`.
- On success: brief thanks state, invalidate booking queries, close.
- On `409 Conflict` (already reviewed — race): treat as success and close.
- On other errors: show error message inline, keep sheet open, allow retry.

### Shared star input

Extract the star row + labels from `ReviewScreen.tsx` into a reusable
`StarRatingInput` component used by both `ReviewScreen` and `RatingPromptSheet`,
so the two stay visually consistent.

### Push handling

In `usePushNotifications.ts`, `booking_completed`:

- Foreground receive → invalidate the pending-rating query so the sheet appears live.
- Tap → instead of navigating to booking-detail, trigger the rating prompt for that
  booking (store action), falling back to normal detection if the payload's booking
  is already reviewed.

## UI

Built under the `nanny-app-mobile-design` skill. Contents: nanny avatar + name,
title "How was your booking with {nanny}?", star input with labels, optional comment
field, primary submit button. No secondary/dismiss actions.

## Backend

None. `createReview` already enforces `status === COMPLETED` and one review per
booking, and recomputes the nanny's denormalized rating.

## Testing

- Unit tests for detection logic (pending vs. reviewed vs. no completed bookings,
  guest/nanny gating).
- Component test for the sheet: submit enables on star select, 409 treated as done,
  Android back does not dismiss.
- Push-routing test: `booking_completed` tap opens the prompt.

## Out of scope

- Rating nannies → parents (reverse direction).
- Backlog chaining through multiple old unrated bookings.
- Any "remind me later" / skip affordance.
