# Extension declined → nudge the mother to book again

**Date:** 2026-09-21

## Problem

When a nanny declines a booking extension the mother gets a terse "Extension declined —
{nanny} can't stay the extra N hours." push and in-app notification, and tapping it opens the
running booking's detail. She is told what happened but not what to do next.

## Design

### Backend — copy only

`notifyMotherExtensionDecided` in `apps/backend/src/services/booking-extension.service.ts`,
declined branch:

- Title: `{Nanny} can't stay longer`
- Body: `{Nanny} isn't able to add the extra {N} hour(s) this time. If you still need cover,
  you can book a new session whenever you're ready — we'll find someone who can help.`

The in-app `type` (`BOOKING_EXTENSION_DECLINED`) and push `data.type`
(`booking_extension_declined`) are unchanged. The accepted branch is untouched.

### Mobile — tap opens the start-a-booking screen

Both surfaces route the declined notification to `/(parent)/book/booking-date-picker`
instead of the booking detail:

- `apps/mobile/src/hooks/usePushNotifications.ts` — new exported predicate
  `isExtensionDeclinedPush(data)` (same shape as `isBookingCompletedPush`), branched on before
  the generic `bookingId` fallback in `navigateFromNotification`.
- `apps/mobile/src/screens/parent/NotificationsScreen.tsx` — `handleNotificationPress`
  checks `type === 'booking_extension_declined'` before the `referenceType === 'booking'`
  branch.

No ID gate on this route: a mother with a booking in progress has already passed it.

### Tests

- Backend unit test (declined case): assert the in-app body mentions booking a new session and
  the push carries `data.type: 'booking_extension_declined'`.
- `usePushNotifications.routing.test.ts`: `isExtensionDeclinedPush` matches the backend
  string, the enum-cased form, and is false otherwise.

## Out of scope

Pre-filling the new booking with the current booking's end time or address.
