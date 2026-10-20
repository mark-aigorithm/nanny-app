# Admin notification center — design

**Date:** 2026-10-20 · **Status:** draft, awaiting review · **Branch:** `feat/notification-center`

## Goal

Admins compose **notification templates** in a new **Notifications** page of the console — title,
body, optional photo, optional link to a package or promo code, channel, audience — and **publish**
a template whenever they want. Publishing sends immediately to the template's audience as a push,
an in-app inbox entry, or both. Tapping a linked notification takes the mother straight into
buying the package, or into the booking flow with the promo code **applied**.

Alongside it, the backend records **when each user last opened the app** (separately from when
she last actually signed in), and **user groups** become either **static** (hand-picked) or
**dynamic** (rule-based, evaluated at send time) — so admins can target, e.g., "mothers who haven't
opened the app in 30 days".

### Decisions (from the user)

| Question | Answer |
|---|---|
| Who receives notifications? | **Mothers only.** Nannies are out of scope. |
| Scheduling? | **No.** Publishing sends now. Scheduled sends are out of scope. |
| Templates | **Every notification comes from a template.** The admin creates the template first, then publishes it whenever she wants — any number of times. |
| What a template holds | **Content and audience** — title, body, photo, channel, link, audience. |
| Channel | **Admin chooses per template: In-app, Push, or Both.** |
| Photo | Optional, cropped with the **campaign crop tool** to a fixed size. |
| Link | Optional — **a package** (tap → buy that package) or **a promo code** (tap → booking flow with the code **auto-applied**). |
| Promo "applied" | **Auto-applied** on the booking step, not just prefilled. Campaign taps change to match. |
| Audience | **Either a manually selected list of mothers, or one or more groups.** No targeting rules on the notification itself. |
| Groups | **Static** (hand-picked members) **or dynamic** (rules evaluated at send time). |
| Dynamic group rules | **Last app open, last login, completed bookings, total spent, last booking, sign-up date** — AND-ed. |
| Manual selection | Offer a **"Save these mothers as a static group"** button. |
| `lastLoginAt` | Means a **real sign-in** (from the Firebase token's `auth_time`), no longer "any `/auth/me`". |
| Last app open | A **new field**, `lastAppOpenAt`, reflecting the app being opened. |

### Assumptions (stated, not contested)

- **Photo in push:** shown in the inbox and in the **Android** push banner. **iOS push banners stay
  text-only** until a Notification Service Extension ships (out of scope).
- **"All mothers"** is a seeded **dynamic group with no rules**, not a special audience option.
- A publish **snapshots** the template's content and audience into the broadcast; editing the
  template later never rewrites history.
- Dynamic groups are resolved **at publish time**; a mother who matches later is not sent it.
- Push-only sends create **no inbox entry**; mothers with no registered device are counted as
  `noDevice` and receive nothing.
- Bookings, hours and spend metrics count **COMPLETED** bookings only (as the mother picker does).
- English only; admin-typed Arabic renders right-aligned via the existing `textDirectionStyle`.
- Volume is in the thousands, not hundreds of thousands — sending in-request is fine (see Approach).

### Out of scope

Scheduled publishing · nanny audiences · iOS push images (Notification Service Extension) ·
open/click tracking per broadcast · i18n · OR-logic or nested rules in dynamic groups · a queue
or worker for sending.

## Approach

**Send in-request, batched by token.** `POST …/publish` resolves recipients, writes inbox rows with
chunked `createMany`, loads all their live device tokens in one query and sends FCM
`sendEachForMulticast` in batches of **500 tokens, 4 in parallel**. 10k mothers ≈ 20 FCM calls,
well inside Vercel's 60 s `maxDuration`. Each publish writes a `NotificationBroadcast` row with a
status and counts, which a queue can later drive without schema changes.

Rejected:
- **`waitUntil` background send** — same 60 s ceiling on Vercel, harder error reporting.
- **Queue (QStash/SQS)** — right at ~100k+ users; YAGNI now.
- **Reuse `lastLoginAt` as "last open"** — it is bumped by `/auth/me` refetches, so its meaning
  depends on React Query's `staleTime`; and the user wants real sign-ins recorded separately.
- **Rules on the notification audience** — superseded by dynamic groups (user decision), which
  also gives surveys rule-based targeting for free.

## Data model (Prisma)

### `User`

```prisma
lastLoginAt   DateTime? @map("last_login_at")      // now: time of the last real sign-in (auth_time)
lastAppOpenAt DateTime? @map("last_app_open_at")   // new: last time the app was opened

@@index([role, lastAppOpenAt])
```

Migration backfills `last_app_open_at = last_login_at` so existing mothers don't all read as
"never opened". From then on `lastLoginAt` is written only from the token's `auth_time`, and only
forward (`auth_time > lastLoginAt`).

### `UserGroup` (extended)

```prisma
enum UserGroupKind {
  STATIC
  DYNAMIC
  @@map("user_group_kind")
}

model UserGroup {
  // …existing fields…
  kind  UserGroupKind @default(STATIC)
  /// DYNAMIC only — shaped by DynamicGroupRulesSchema in @nanny-app/shared, always parsed through
  /// it on read. Null for STATIC. An empty array means "every active mother".
  rules Json?
}
```

Existing groups become `STATIC`. A dynamic group never has `UserGroupMember` rows; member
add/remove endpoints return 409 for it.

**Rules** (`packages/shared/src/user-group.ts`), AND-ed, each field at most once:

| Rule `field` | Operators | Value | SQL source |
|---|---|---|---|
| `lastAppOpenAt` | `withinDays`, `notWithinDays` | days 1–3650 | `u.last_app_open_at` — `notWithinDays` includes NULL ("never") |
| `lastLoginAt` | `withinDays`, `notWithinDays` | days | `u.last_login_at` — same NULL rule |
| `createdAt` | `withinDays`, `notWithinDays` | days | `u.created_at` |
| `lastBookingAt` | `withinDays`, `notWithinDays` | days | `max(start_time)` of COMPLETED bookings — `notWithinDays` includes NULL |
| `completedBookings` | `gte`, `lte` | integer ≥ 0 | `count(*)` of COMPLETED bookings |
| `totalSpent` | `gte`, `lte` | EGP ≥ 0 | `sum(total_amount)` of COMPLETED bookings |

```ts
type DynamicGroupRule =
  | { field: 'lastAppOpenAt' | 'lastLoginAt' | 'createdAt' | 'lastBookingAt';
      op: 'withinDays' | 'notWithinDays'; days: number }
  | { field: 'completedBookings' | 'totalSpent'; op: 'gte' | 'lte'; value: number };
```

Seed: one dynamic group **"All mothers"** with `rules: []`.

### `NotificationTemplate` (new)

```prisma
enum NotificationChannel {
  IN_APP
  PUSH
  BOTH
  @@map("notification_channel")
}

model NotificationTemplate {
  id          Int                 @id @default(autoincrement())
  name        String              // internal label
  title       String              // ≤ 65 chars
  body        String   @db.Text   // ≤ 240 chars
  imageUrl    String?  @map("image_url")
  channel     NotificationChannel
  targetType  CampaignTargetType? @map("target_type")
  packageId   Int?     @map("package_id")
  package     Package?   @relation(fields: [packageId], references: [id])
  promoCodeId Int?     @map("promo_code_id")
  promoCode   PromoCode? @relation(fields: [promoCodeId], references: [id])
  /// Shaped by NotificationAudienceSchema; always parsed through it on read.
  audience    Json
  createdById Int      @map("created_by_id")
  createdBy   User     @relation("NotificationTemplateCreator", fields: [createdById], references: [id])
  broadcasts  NotificationBroadcast[]
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  @@index([deletedAt])
  @@map("notification_templates")
}
```

Audience:

```ts
type NotificationAudience =
  | { type: 'GROUPS'; groupIds: number[] }   // 1–20 groups, static and/or dynamic, unioned
  | { type: 'MOTHERS'; motherIds: number[] }; // 1–5000 hand-picked mothers
```

Link rule (same as campaigns' `oneTargetMatchesType`): `targetType` null ⇒ both ids null;
`PACKAGE` ⇒ only `packageId`; `PROMO_CODE` ⇒ only `promoCodeId`.

### `NotificationBroadcast` (new) — one row per publish

```prisma
enum NotificationBroadcastStatus {
  SENDING
  SENT
  PARTIAL
  FAILED
  @@map("notification_broadcast_status")
}

model NotificationBroadcast {
  id            Int      @id @default(autoincrement())
  templateId    Int      @map("template_id")
  template      NotificationTemplate @relation(fields: [templateId], references: [id])
  // snapshot of the template at publish
  title         String
  body          String   @db.Text
  imageUrl      String?  @map("image_url")
  channel       NotificationChannel
  targetType    CampaignTargetType? @map("target_type")
  packageId     Int?     @map("package_id")
  promoCodeId   Int?     @map("promo_code_id")
  promoCodeText String?  @map("promo_code_text") // the code string, so taps don't need a lookup
  audience      Json
  status        NotificationBroadcastStatus @default(SENDING)
  targeted      Int      @default(0)
  inAppCreated  Int      @default(0) @map("in_app_created")
  pushSent      Int      @default(0) @map("push_sent")
  pushFailed    Int      @default(0) @map("push_failed")
  noDevice      Int      @default(0) @map("no_device")
  skippedGroups Int[]    @default([]) @map("skipped_groups") // deleted since the template was saved
  error         String?  @db.Text
  publishedById Int      @map("published_by_id")
  publishedBy   User     @relation("NotificationBroadcastPublisher", fields: [publishedById], references: [id])
  createdAt     DateTime @default(now()) @map("created_at")
  completedAt   DateTime? @map("completed_at")
  notifications Notification[]

  @@index([templateId, createdAt])
  @@index([status, createdAt])
  @@map("notification_broadcasts")
}
```

### `Notification` (extended)

- `NotificationType` gains **`ANNOUNCEMENT`** — added in the Prisma enum, `toApiNotificationType`
  (`notification.service.ts`) and `NotificationTypeSchema` (shared, as `'announcement'`). All three,
  or it silently falls into the `marketplace_message` default.
- New nullable `broadcastId Int? @map("broadcast_id")` → `NotificationBroadcast`, indexed.
  Image and link are read through it, not copied onto every row.

## Lifecycle

```
Template (editable, soft-deletable)
   │  Publish (any number of times)
   ▼
Broadcast SENDING ──► SENT      all in-app rows written, every push batch succeeded
                  ├─► PARTIAL   some push batches/tokens failed
                  └─► FAILED    validation passed but in-app writes failed, or timed out
```

A broadcast still `SENDING` after **5 minutes** (function killed) is reported as `FAILED` (timed
out) on read, and no longer blocks a new publish.

## Backend

### Group resolution — `group-audience.service.ts` (new, shared)

`resolveGroupMembers(groupIds): { userIds, skippedGroupIds }`

- Base filter for every recipient: `role = MOTHER`, `deleted_at IS NULL`, `is_active`.
- STATIC → live `UserGroupMember` rows.
- DYNAMIC → one SQL query built from the rules, reusing the COMPLETED-bookings aggregate that
  `mother-picker.service.ts` already computes (extract it into a shared SQL fragment).
- Union and dedupe across groups; deleted groups are skipped and returned.

`survey-audience.service.ts` switches its group branch to `resolveGroupMembers`, so **surveys can
target dynamic groups** too (resolved at survey publish, as today).

### Admin API — section `notifications` (new) and `groups` (extended)

New `ADMIN_SECTIONS` value `notifications`; rows in `ADMIN_ROUTE_PERMISSIONS` (enforced by
`admin-permissions.test.ts`). Writes need manage access. `GET /groups` and `GET /mother-picker`
gain `['notifications', 'MANAGE']` in their `anyOf`, as surveys already have, so the editor can
pick groups and mothers. **"Save as static group"** calls `POST /groups`, which still requires
`groups` MANAGE — the button is hidden for admins without it.

| Route | Purpose |
|---|---|
| `GET /admin/notification-templates` | List: name, title, channel, link, audience summary, `publishCount`, `lastPublishedAt` |
| `GET /admin/notification-templates/:id` | Template, with group names/kinds and mother names resolved |
| `POST /admin/notification-templates` | Create |
| `PATCH /admin/notification-templates/:id` | Update |
| `DELETE /admin/notification-templates/:id` | Soft delete (history kept) |
| `POST /admin/notification-templates/audience-preview` | `{audience}` → `{ mothers, withPushDevice }` |
| `POST /admin/notification-templates/:id/publish` | Send now → broadcast with counts |
| `GET /admin/notification-templates/:id/broadcasts` | Send history |

Groups (section `groups`):

| Route | Change |
|---|---|
| `POST /admin/groups` | Accepts `kind` and, for DYNAMIC, `rules` |
| `PATCH /admin/groups/:id` | Can edit `rules` of a DYNAMIC group; `kind` is fixed after creation |
| `POST /admin/groups/rules-preview` | `{rules}` → count; members via the picker (below) |
| `POST/DELETE …/members` | 409 for DYNAMIC groups |
| `GET /admin/groups` | Rows gain `kind` and, for DYNAMIC, a live member count |

Mother picker `GET /admin/mother-picker` and `GET /admin/mothers` (Users → Mothers):

- New column/sort key **`lastAppOpenAt`**; the picker's "Last active" becomes **Last login**.
- New optional `rules` query param (JSON, `DynamicGroupRulesSchema`) — filters the list by the same
  SQL as dynamic groups. The picker uses it to show a dynamic group's members; the Mothers tab
  uses a simpler **Last app open** filter (within N days / not within N days / never) that maps to
  one rule.

### Publish flow — `notification-broadcast.service.ts`

1. Load the template (404 if deleted). Validate the link: package active and not expired; promo
   code active, not expired, `usageCount < maxUsage` (400 with a specific message otherwise).
2. Refuse (409) if this template has a broadcast `SENDING` younger than 5 minutes.
3. Resolve recipients: `MOTHERS` → filter the ids through the base filter; `GROUPS` →
   `resolveGroupMembers`. Empty → 400 "No mothers match this audience".
4. Insert the broadcast (`SENDING`, snapshot, `targeted`).
5. If channel includes in-app: `createMany` `ANNOUNCEMENT` rows with `broadcastId`, chunks of
   1,000. A failed chunk ⇒ `FAILED` with the error and counts so far; no push is sent.
6. If channel includes push: one query for all live tokens of the recipients; `noDevice` =
   recipients with none. `sendEachForMulticast` in batches of 500, 4 concurrent. Payload:
   - `notification: { title, body, imageUrl? }`, `android.notification.imageUrl` when set.
   - `data: { type: 'ANNOUNCEMENT', broadcastId, targetType?, packageId?, promoCode? }` (strings).
   - Not-registered / invalid tokens are soft-deleted (existing helper); others counted as failed.
7. Finalise counts, status `SENT` or `PARTIAL`, `completedAt`.

The existing `dispatchPush` stays per-user for transactional pushes; the batched sender is a new
function beside it (`dispatchPushToTokens`) that the survey fan-out can adopt later.

### Mother-facing API

- **`POST /me/app-open`** (requireAuth) → 204. `UPDATE users SET last_app_open_at = now() WHERE id
  = $1 AND (last_app_open_at IS NULL OR last_app_open_at < now() - interval '60 seconds')`.
- **Real sign-in:** `GET /auth/me` stops writing `now()` to `lastLoginAt`; instead, when the decoded
  token's `auth_time` is newer than the stored value, it writes `auth_time`. Register keeps setting it.
- **`GET /notifications`** items gain optional `imageUrl` and
  `link: { type: 'package', packageId } | { type: 'promo_code', code }`, joined through
  `broadcastId`. Older app builds ignore them.

### Shared — `packages/shared/src/notification-template.ts` (new) + `user-group.ts`

`NotificationChannelSchema`, `NotificationAudienceSchema`, template create/update schemas with the
one-target refine and `title.max(65)` / `body.max(240)`, `NotificationBroadcastSchema`,
`NotificationLinkSchema`, `DynamicGroupRuleSchema` / `DynamicGroupRulesSchema`, group create/update
extended with `kind` and `rules`. Image size constants `NOTIFICATION_IMAGE_WIDTH = 1024`,
`NOTIFICATION_IMAGE_HEIGHT = 512`.

## Admin UI

Built with the `nanny-app-admin-design` skill for look and tokens and `ui-ux-pro-max` for UX rules.

### Notifications page (`/notifications`, sidebar item with lucide `Megaphone`)

List of templates: name, title, channel badge, link (package/promo name), audience summary
("2 groups" / "37 mothers"), publish count, last published. **New template**; row actions Edit,
Publish, Delete (confirm).

### Template editor (`/notifications/:id`; `new` = blank editor, first Save creates it)

- **Content:** name; title and body with character counters that turn to a warning near the limit;
  image picker reusing `CampaignImageCropper` + `cropImageToFile` at **1024×512 (2:1)**, uploaded
  with `uploadImageToFirebase(file, 'notifications')`; remove image.
- **Channel:** segmented control In-app / Push / Both.
- **Link:** None / Package / Promo code, then a select of active packages or promo codes.
- **Audience:** segmented **Groups** / **Specific mothers**.
  - Groups: multi-select of groups, each labelled Static or Dynamic with its member count.
  - Specific mothers: the existing mother picker (`recipient-picker-modal`); shows the chosen list.
    Beside it a **"Save these N mothers as a static group"** button → dialog (name, optional
    description) → creates the group → toast with **"Use this group instead"**, which switches the
    audience to `GROUPS: [newGroup]`.
  - **Live count:** "1,240 mothers · 1,031 with push enabled" from `audience-preview`, re-queried
    (debounced) as the audience changes.
- **Preview:** a phone push banner mock and the inbox card mock, with the image in a fixed box.
- **Validation:** on blur, error under each field (linked with `aria-describedby`); on a failed
  save, a focusable error summary at the top linking to each field.
- **Unsaved changes:** `useBlocker` confirm on leave; a "Saved" toast on save.
- **Publish:** disabled while there are unsaved changes. Confirm dialog re-fetches the count:
  *"Send 'Win-back 30d' to 1,240 mothers (1,031 by push) now? This can't be undone."* — button
  "Send to 1,240 mothers", showing a sending state and disabled in flight. Result toast with
  counts; a warning variant for `PARTIAL`/`FAILED`; a note if groups were skipped.
- **Send history:** table of broadcasts — date, published by, status, targeted, in-app, push
  sent/failed, no device.
- Read-only operators see everything with write controls hidden (`useCanManage`).
- Every control reachable by keyboard with a visible focus ring.

### Groups page (extended)

- **New group** asks **Static** or **Dynamic**.
- Dynamic group page: a **rule editor** (add rule → field, operator, value; remove; one row per
  field) with a plain-language summary ("Not opened the app in 30+ days AND ≥ 1 completed
  booking"), a live count, and the read-only member table (mother picker filtered by the rules).
  No add/remove member controls.
- Groups list shows a Static/Dynamic badge and member count.

### Users → Mothers tab and mother picker

Sortable **Last app open** column; a **Last app open** filter (within N days / not within N days /
never) next to the existing ID-status filter. The picker's "Last active" column is renamed
**Last login**, with **Last app open** beside it.

## Mobile

Built with the `nanny-app-mobile-design` skill, the UI-sweep layout rules, and `ui-ux-pro-max`.

1. **`useAppOpenPing`** (new hook, mounted in `ProfileLoader`, `app/_layout.tsx`): once signed in
   with a profile, `POST /me/app-open` on cold start and whenever `AppState` becomes `active`,
   throttled in memory to once per 5 minutes; errors ignored. Guests never ping.
2. **`openPromoLink(router, link)`** (new, `src/lib/`), used by push tap, inbox tap **and
   `CampaignCarousel`**:
   - `package` → `/(parent)/packages/checkout?packageId=…`
   - `promo_code` → `usePendingPromoStore.setPendingPromoCode(code)` → `/(parent)/book/booking-date-picker`
3. **Promo auto-apply** (`BookingStep1Screen`): the one-shot read on mount stays; the pending code
   fills the field **and** runs `validatePromo` once the price breakdown is ready. Success shows the
   existing applied state; an invalid code shows the usual inline error. `HomeScreen`'s focus-clear
   guard is unchanged.
4. **Push tap** (`usePushNotifications.navigateFromNotification`): new `ANNOUNCEMENT` branch builds
   the link from `data` and calls `openPromoLink` (via `openWhenRoleKnown` on cold start); no link →
   the Notifications tab.
5. **Inbox** (`NotificationsScreen`): announcement rows render as a card — title, full body, image
   in a fixed 2:1 rounded box with a neutral placeholder while loading, and an action label ("View
   package" / "Book with code SAVE20"). The **whole card is one `Pressable`** (`accessibilityRole=
   "button"`, label = title + action; the image is decorative). Press feedback: Android ripple /
   iOS opacity. Memoized list item. Tap → mark read → `openPromoLink`; no link → mark read only.
   Body text uses `textDirectionStyle` for Arabic.
6. **Older builds:** the inbox isn't Zod-parsed at runtime, so announcements show as plain rows
   with no tap action, and pushes still open the app. Nothing breaks.

## Error handling

| Situation | Result |
|---|---|
| Template deleted | 404 |
| Package inactive/expired, promo inactive/expired/used up | 400, specific message shown by Publish |
| Audience resolves to nobody | 400 "No mothers match this audience" |
| Publish while another is `SENDING` (< 5 min) | 409 |
| In-app insert chunk fails | Broadcast `FAILED` + error + counts so far; no push sent |
| FCM batch or token fails | Counted in `pushFailed`; status `PARTIAL`; dead tokens cleaned up |
| Function killed mid-send | Shown as `FAILED (timed out)` after 5 min |
| Member add/remove on a dynamic group | 409 |
| App-open ping fails | Ignored on mobile, logged on the server |

## Testing

- **Backend unit (Jest):** dynamic-rule SQL builder per field/operator incl. NULL handling;
  `resolveGroupMembers` (static, dynamic, mixed, deleted groups, inactive mothers and nannies
  excluded); `auth_time` → `lastLoginAt` only moves forward; publish guards; batching at 500 with a
  mocked `firebaseMessaging` and result tallying; admin-permission rows.
- **Backend integration (real PostGIS, Auth emulator):** template CRUD; audience preview; publish →
  inbox rows with `broadcastId` and correct broadcast counts; `GET /notifications` returns
  `imageUrl` and `link`; `POST /me/app-open` throttling; dynamic group create/preview/members 409;
  surveys publishing to a dynamic group; Mothers list sort/filter by `lastAppOpenAt`.
- **Shared (Vitest):** template, audience, link and rule schemas.
- **Admin (Vitest + MSW):** editor validation and error summary; live count; save-as-group flow and
  "Use this group instead"; publish confirm with re-fetched count and result toasts; dynamic group
  rule editor; read-only operator view.
- **Mobile (Jest + RNTL):** `openPromoLink`; promo auto-apply success and invalid; announcement card
  render and tap; push-tap branch; `useAppOpenPing` throttle.
- **Device E2E (Maestro):** new flow — publish a promo announcement via the API → mother sees it in
  the inbox → taps → reaches Step 1 with the code applied. Re-run the campaign flow (auto-apply
  changed it).
- **UI sweep:** announcement card (image/no image × link/no link) and the auto-applied promo state.

## Rollout

1. **Prisma migration** — new enums and tables, `user_groups.kind/rules`, `notifications.broadcast_id`,
   `users.last_app_open_at` + index + backfill, the seeded "All mothers" dynamic group. Apply it to
   the production database **before** the backend deploy; nothing runs migrations on deploy.
2. **Backend and admin** deploy via their Vercel Git deploys.
3. **Mobile** ships in a new EAS build (ping, card, push branch, auto-apply). Until mothers update,
   `lastAppOpenAt` comes only from the backfill and announcements show as plain rows — send the
   first real announcements once the build has spread.

## Implementation notes

Where the build differs from, or adds to, the design above:

- **Publish checks order.** `POST /admin/notification-templates/:id/publish` validates the link
  (package / promo code still usable) and the audience (at least one mother) first, and answers
  `400`; only then does it check for a broadcast already in flight (`409`).
- **"Choose mothers"** is `MotherPickerTable` in a modal. The survey audience picker was not
  reusable here.
- **`NotificationBroadcast` has `updatedAt`**, besides the fields listed in the data model.
- **The "All mothers" seed** is inserted by the migration only when an admin or superuser exists
  (created by the first superuser, else the first admin). A database with no admin gets no seed.
- **Broadcast status.** Only an in-app failure or a timeout ends `FAILED`. The inbox rows are
  already written when the push phase starts, so any push-phase error (failed tokens or a thrown
  send) ends `PARTIAL` with the counts so far.
- **`imageUrl` must be https.** The shared schema accepts any URL; the backend refuses a non-https
  image with a `400`, because a push banner image has to be https.
