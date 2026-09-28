# Admin official posts (events, Q&A, listings) — design

**Date:** 2026-09-28
**Status:** approved in chat; awaiting spec review

## Problem

The Community page lets an admin publish only one thing: an official listing
("Add official listing"). The community has three post types — Q&A, events and
listings — and the platform needs to post all three as NannyNow: a meetup it
organises, an announcement or question to mothers, a product it sells.

## Goal

A **New post ▾** button at the top of the Community page opens a menu of
**Event**, **Q&A** and **Listing**. Each opens its own form, and the post goes
live at once as "NannyNow · Official". Official posts of every type can be
edited and deleted from the table.

## Decisions

| Question | Decision |
|---|---|
| Top of the page | One **New post ▾** header button with a menu (Event, Q&A, Listing). The review queue stays the first thing on the page. |
| Review | Official posts skip the queue: saved `APPROVED` with `isOfficial: true`, the acting admin as author and reviewer. Same as official listings today. |
| Pinning | Only official **listings** stay pinned above seller listings. Official events and Q&A are ordered newest-first like any post and carry the Official badge; pinning them would bury mothers' posts. |
| Status counts in the header | Not added. Status stays a `FilterSelect` (console rule: no filter pills), and counts would cost three extra requests per page load. |
| Mobile | No change and no new build. `PostCard` (feed and post detail) already shows any `isOfficial` post as "NannyNow" with an Official badge, whatever its type; the app already refuses edits to official posts. |

## Backend

### Schemas (`packages/shared/src/admin.ts`)

`CreateOfficialPostSchema` is a discriminated union on `type`:

| `type` | Fields |
|---|---|
| `marketplace` | Unchanged from `CreateOfficialListingSchema`: `title` (1–200), `body?` (≤2000), `price` (>0), `imageUrls` (1–4), `tags` (≤5), `contactPhone` |
| `event` | `title` (1–200), `body?`, `eventStartsAt` (platform wall-clock `YYYY-MM-DDTHH:mm:ss`, converted to UTC by the backend), `location` (1–500), `price?` (≥0; absent = free), `maxAttendees?` (int >0), `imageUrls` (0–4), `tags` |
| `qa` | `title?` (≤200), `body` (1–2000), `imageUrls` (0–4), `tags` |

The field rules mirror the member-facing `CreateCommunityPostSchema`, plus
`contactPhone` on listings.

`UpdateOfficialPostSchema` is one flat object of every field above, all
optional. On an event, `price` and `maxAttendees` also accept `null`, to make
it free again or remove the cap. A post's type
never changes, so the service checks the fields against the stored type:

- `contactPhone` is accepted only on a listing, and `eventStartsAt`,
  `location` and `maxAttendees` only on an event. Anything else → 400
  "That field doesn't apply to this kind of post."
- A listing keeps `price > 0` and at least one image. A Q&A keeps a non-empty
  body. An event keeps a non-empty title and location.

`CreateOfficialListingSchema` / `UpdateOfficialListingSchema` and their types
are removed; every caller moves to the new ones.

### Service (`admin-marketplace.service.ts` → `admin-official-post.service.ts`)

The file is renamed, since it no longer covers only the marketplace.

- `createOfficialPost(input, adminUid)` maps `type` to `CommunityPostType` and
  writes the type's fields. `contactPhone` goes through `normalizePhone` for
  listings only. `isOfficial: true`, `APPROVED`, `reviewedAt: now`,
  `reviewedById: admin`.
- `updateOfficialPost(id, input)` loads any post type with `isOfficial` true.
  A non-official post → 400 "Only official posts can be edited here." Then the
  type checks above, then the update. It never re-enters review.
- `deleteOfficialPost(id)` behaves as today (soft-deletes the post and its
  comments), for any type. A non-official post → 400 "Only official posts can
  be deleted here. Reject it instead."
- Not found (including deleted) → 404 "Post not found."

### Routes

| Route | Replaces |
|---|---|
| `POST /admin/community/official-posts` | `POST /admin/marketplace/listings` |
| `PATCH /admin/community/official-posts/:id` | `PATCH /admin/marketplace/listings/:id` |
| `DELETE /admin/community/official-posts/:id` | `DELETE /admin/marketplace/listings/:id` |

The old routes are removed. Their only caller is the admin console, which ships
from the same `main`. The three `ADMIN_ROUTE_PERMISSIONS` rows move to the new
patterns with `section('marketplace', 'MANAGE')`, and the router-walk test
enforces them.

## Admin console

- **Header (`community-page.tsx`):**
  - "Add official listing" becomes **New post ▾**, a `Menu` of **Event**
    (`CalendarClock`), **Q&A** (`MessagesSquare`) and **Listing** (`Store`).
    It shows only when `canManage`.
  - The subtitle becomes "Review what mothers post before it reaches the feed,
    and post events, Q&A and listings as NannyNow."
- **Form:** `features/marketplace/official-listing-form.tsx` becomes
  `features/community/official-post-form.tsx` with an `OfficialPostFormModal`
  that takes `type` for a new post, or the post itself for an edit.
  - Photos and tags are shared by every type. Each type adds its own fields:
    - Listing: name, description, price, contact phone.
    - Event: name, description, date and time (`datetime-local`, platform
      timezone), location, price (blank = free), max attendees.
    - Q&A: title (optional), body.
  - Titles are "New official event" / "Edit official event" and so on.
  - Toasts are "Official event published" / "Event updated" and so on.
  - Validation uses `CreateOfficialPostSchema` through `firstIssueMessage`, as
    the listing form does today.
- **Table (`post-table.tsx`):** every official post, of any type, offers Edit
  and Delete (today only listings do). The delete dialog and toast name the
  type: "Delete official event", "Official event deleted", and so on.
- **API (`lib/api.ts`):** `createOfficialPost`, `updateOfficialPost` and
  `deleteOfficialPost` replace the listing functions.

## Error handling

| Case | Result |
|---|---|
| Invalid body | 400 via `validateBody`; the form shows the first issue inline before sending |
| Field that doesn't fit the post's type (PATCH) | 400 "That field doesn't apply to this kind of post." |
| Editing or deleting a member's post | 400, as today |
| Unknown or deleted post | 404 "Post not found." |
| Photo upload fails | Unchanged: the form's inline error |

## Testing

- **Backend unit (`admin-official-post.service.test.ts`):**
  - Create for each type: goes live immediately, `isOfficial` is set, the
    right fields are written, and `contactPhone` is written for listings only.
  - Update: a wrong-type field gives 400, the listing rules still hold, and a
    member's post is refused.
  - Delete: works for any official type and refuses a member's post.
- **Backend:** the permission-table rows. The existing router-walk test covers
  them.
- **Admin Vitest:**
  - The New post menu opens the right form for each type.
  - The event form posts the right body, and a blank price is left out.
  - The Q&A form posts with no photo.
  - Edit on an official event opens it filled in and sends a PATCH.
- **Admin E2E (b06):**
  - Publish an official event through the console form (no photo, so no
    Storage upload), then confirm it is live for a mother and shows as
    Official.
  - `seedOfficialListing` moves to the new route.

## Rollout

Backend and admin ship together from `main` on Vercel. There's no migration and
no mobile build.
