# Admin "Request new ID" — design

**Date:** 2026-09-27
**Status:** approved in chat; awaiting spec review

## Problem

An admin who finds a user's ID document unusable (blurry, expired, wrong
person) has no way to send it back. The only tool is **Reject**, and it is
offered only while an application is `PENDING_REVIEW`. It also says the wrong
thing: it marks the account `REJECTED` and tells an already-approved nanny her
"application was not approved".

## Goal

An admin can invalidate the ID of a nanny or a mother at any status that has
an ID on file. The user is then prompted to upload a new one, and their account
is suspended until the new ID is re-approved.

## Decisions

| Question | Decision |
|---|---|
| Account while the new ID is outstanding | **Suspended.** Same effect as having no ID: a nanny leaves search and new bookings, and a mother can't book. |
| Status after invalidation | **`PENDING_ID`** ("Awaiting ID"), not `REJECTED`. Only the document is refused, not the application. |
| Reason | Optional free text, stored in the existing `rejectionReason` column and shown to the user. |
| Notification type | Reuse `NANNY_REJECTED` for the in-app row, so no Prisma migration is needed (nothing applies migrations on deploy). The copy and the push `data.type` (`id_reupload_requested`) are new. |
| Nanny already inside the app | Redirected to Upload ID straight away (mobile fix), not only on next launch. |

## Backend

### `invalidateUserId(userId, reason?)`

This is one helper, in a new `services/id-document.service.ts`, used by both roles.

1. Load the user (`deletedAt: null`). Refuse with **400 "There is no ID on
   file to invalidate."** when both ID URLs are already null.
2. In one update, set:
   - `approvalStatus: PENDING_ID`
   - `rejectionReason: reason ?? null`
   - `reviewedAt: now`
   - `idDocumentFrontUrl` and `idDocumentBackUrl` to null
   - `idDocumentType` to null
3. Best-effort `deleteStorageObjectByUrl` on both old URLs, the same way reject
   does it.
4. Send a notification:
   - `createInAppNotification({ type: 'NANNY_REJECTED', title: 'Please upload your ID again', body })`
   - `dispatchPush(... data: { type: 'id_reupload_requested' })`
   - The body is `Your ID couldn't be verified: <reason>. Upload a new one to keep using NannyNow.`,
     or the same text without the reason when none is given.

### Routes

| Route | Service | Returns |
|---|---|---|
| `POST /admin/nannies/:id/invalidate-id` | `invalidateNannyId(profileId, input)` → resolves `userId` → helper | `AdminNanny` |
| `POST /admin/mothers/:id/invalidate-id` | `invalidateMotherId(userId, input)` → helper | the mother DTO that approve/reject return |

- The body is the existing `RejectNannySchema` (`{ reason?: string }`, trimmed,
  1–500). It already backs both reject routes, so there is no new schema.
- Both routes get a `users: MANAGE` row in `ADMIN_ROUTE_PERMISSIONS`. The route
  table test fails without it.

### Unchanged on purpose

- `POST /auth/id` already moves any status to `PENDING_REVIEW` and clears the
  reason, which is exactly the re-upload path.
- A nanny with active bookings (the `ACTIVE_BOOKING_STATUSES` list used by account deletion) can't have her ID invalidated: 409, because the in-app guard would lock her out of shifts she holds. Approving now also requires an ID on file (400), so an invalidated account can't be re-approved before a new upload.

## Admin console

- **Nanny detail page:** a **"Request new ID"** ghost button in the header of
  the Application card. It is shown when `canManage` and an ID is on file.
- **Mother detail page:** the same button beside **View ID**, under the same
  conditions.
- Both open a `PromptDialog`:
  - message: "Their ID photos will be deleted and they'll be asked to upload
    a new one. Until it's approved they can't [take bookings / book care]."
  - label: "Reason (optional — shown to them)"
  - `danger`, `multiline`
- On success, toast "New ID requested" and invalidate `['nanny', id]` /
  `['mother', id]` plus the list queries, using string keys (see the earlier
  skills-refresh bug).
- The page then shows **Awaiting ID** and the ID photos area reads "No ID
  uploaded yet."

## Mobile

### Nanny: redirect while inside the app

A new `useNannyAccessGuard()` hook is mounted in `app/(nanny)/_layout.tsx`.

- It reads `approvalStatus` from `useUserProfileStore`. When it is not
  `APPROVED`, it `router.replace`s using the mapping `useRootGate` already has:
  `PENDING_ID` or `REJECTED` go to `/(auth)/upload-id`, and anything else goes
  to `/(auth)/pending-review`. The mapping is extracted into a shared
  `nannyStatusRoute(status)` so the two can't drift.
- It keeps the status fresh in two ways:
  - It refetches `useMe` when the app returns to the foreground (`AppState`
    `active`).
  - It refetches when a push arrives whose `data.type` is
    `id_reupload_requested`, `nanny_rejected` or `nanny_approved`, through the
    existing listener in `usePushNotifications.ts`, which invalidates
    `['auth','me']`.

### Mother

No change. `useIdGate` already opens `IdUploadModal` with the reason on the
next "Book care", and the server-side booking gate is the backstop.

### Notification rendering

The in-app row's type is `nanny_rejected` (the reused enum), and the push type
never reaches the list. So add an icon case for `nanny_rejected` in
`notificationUtils.ts` (an `id-card` glyph) so the list doesn't fall back to a
generic icon. It covers reject too.

## Error handling

| Case | Result |
|---|---|
| No ID on file | 400 with the message above; the UI hides the button in that state anyway |
| Unknown or deleted user | 404 (existing `errors.notFound`) |
| Storage delete fails | Logged and ignored (best-effort, as in reject). The DB row is the source of truth. |
| Push fails | `dispatchPush` already swallows failures; the in-app row still exists |

## Testing

- **Backend unit:** the helper's update payload, storage deletes, notification copy with and without a reason, the 400 when there's no ID, and both route services resolving the right user.
- **Backend:** add the two permission-table rows. The existing router-walk test enforces them.
- **Admin (Vitest + MSW):** the button shows only with an ID on file and `canManage`; the dialog posts the reason; the page re-renders as Awaiting ID without a reload.
- **Admin E2E (b05):** request a new ID for an approved nanny, then confirm the status is Awaiting ID and the photos are gone.
- **Mobile (jest-expo):** `nannyStatusRoute` mapping; the guard redirects when the store status flips away from `APPROVED`; a push of `id_reupload_requested` triggers a `/auth/me` refetch.

## Rollout

The backend and admin changes go live when Vercel deploys `main`. The in-app
redirect needs a new mobile build, because EAS Update isn't configured. Until
then, a nanny whose ID is invalidated gets the Upload ID screen on her next app
launch, and the dashboard returns 403 in the meantime.
