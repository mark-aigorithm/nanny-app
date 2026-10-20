# Admin Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins build notification templates (title, body, photo, channel, package/promo link, audience) and publish them to mothers on demand; user groups become static or rule-based dynamic; the backend records each user's last app open separately from her last real sign-in.

**Architecture:** Zod schemas and the dynamic-group rule shapes live once in `packages/shared`. The backend resolves audiences through one shared group resolver (also adopted by surveys), sends in-request with token-batched FCM multicast, and records each publish as a `NotificationBroadcast` snapshot. Inbox rows link to their broadcast for image and link. Admin pages follow the Surveys/Groups/Campaigns pages; mobile reuses the campaign tap routing through one `openPromoLink` helper.

**Tech Stack:** Prisma 7 + PostgreSQL, Express, Zod 3, firebase-admin messaging, React + React Query + React Router 7 + react-easy-crop (admin), Expo Router + React Query + zustand (mobile), Jest / Vitest / MSW / RNTL / Maestro.

**Spec:** `docs/superpowers/specs/2026-10-20-admin-notification-center-design.md`

## Global Constraints

- Mothers only (`Role.MOTHER`, `deletedAt: null`, `isActive: true`). Nannies never receive announcements and never match a group.
- No scheduling: publish sends now.
- Every send comes from a template; a template can be published any number of times; each publish snapshots content + audience into a `NotificationBroadcast`.
- Channel exactly `IN_APP | PUSH | BOTH`. Push-only creates no inbox row.
- Title ≤ **65** chars, body ≤ **240** chars, template name ≤ **80** chars.
- Notification image: **1024×512** (2:1) JPEG via the campaign cropper, Firebase Storage folder `notifications`.
- Link: none, or exactly one of `PACKAGE` (`packageId`) / `PROMO_CODE` (`promoCodeId`) — reuse `CampaignTargetType`.
- Audience exactly `{ type: 'GROUPS', groupIds: 1–20 }` or `{ type: 'MOTHERS', motherIds: 1–5000 }`.
- Groups are `STATIC | DYNAMIC`; `kind` is fixed after creation; dynamic groups have no member rows; dynamic rules are AND-ed, at most one rule per field, fields: `lastAppOpenAt`, `lastLoginAt`, `createdAt`, `lastBookingAt` (ops `withinDays` / `notWithinDays`, days 1–3650) and `completedBookings`, `totalSpent` (ops `gte` / `lte`, value ≥ 0). `notWithinDays` matches NULL. Booking metrics count `COMPLETED`, non-deleted bookings only. Empty rules = every active mother.
- Promo links are **auto-applied** on booking Step 1 (campaign taps too).
- `lastLoginAt` = last real sign-in, written from the Firebase token's `auth_time`, only forward. `lastAppOpenAt` = last app open, written by `POST /me/app-open`, server-throttled to 60 s, client-throttled to 5 min.
- FCM: `sendEachForMulticast`, **500 tokens per batch, 4 batches concurrently**. In-app inserts: `createMany` chunks of **1,000**. A broadcast `SENDING` for more than **5 minutes** reads as `FAILED` with error `"Timed out"` and no longer blocks a new publish.
- Backend conventions (`apps/backend/CLAUDE.md`): every model has `createdAt` / `updatedAt` / `deletedAt` (except append-only logs already in the codebase style); **soft delete only**; `Int @id @default(autoincrement())`; snake_case columns via `@map`, plural snake_case tables via `@@map`, enums `@@map("snake_name")`; every query filters `deletedAt: null`; no `process.env` (use `config`); no business logic in routes.
- Every admin route gets a row in `ADMIN_ROUTE_PERMISSIONS`. Notification routes: `GET` → `section('notifications','VIEW')`, else `section('notifications','MANAGE')`. `GET /groups`, `GET /groups/:id` and `GET /mother-picker` additionally accept `['notifications','MANAGE']` in their `anyOf`. Never a per-route check.
- Group code (shared `user-group.ts`, `admin-group.service.ts`, `mother-picker.service.ts`, `group-audience.service.ts`, `group-rules-sql.ts`, admin `features/groups/`) must not import survey- or notification-specific code; those features import group code, never the reverse.
- A new `NotificationType` must be added in all three places: Prisma enum, `toApiNotificationType`, shared `NotificationTypeSchema` — otherwise it silently maps to `marketplace_message`.
- No `any`. `import type` for type-only imports. Files kebab-case (backend/admin), PascalCase screen/component files (mobile).
- **UI:** admin tasks load the `nanny-app-admin-design` skill and the `ui-ux-pro-max:ui-ux-pro-max` skill before writing UI; mobile tasks load `nanny-app-mobile-design`, `ui-ux-pro-max:ui-ux-pro-max`, and follow "Rules from the UI sweep" in `apps/mobile/CLAUDE.md`. Visual tokens come from the repo skills; ui-ux-pro-max supplies UX rules and its pre-delivery checklist.
- Long-running commands (test stack, integration suites, emulator, Metro) run in tmux: `mkdir -p ~/logs; tmux new -d -s nanny-<task> "<cmd> 2>&1 | tee ~/logs/nanny-<task>.log"`.
- Prisma migrations are applied to production **before** the backend deploys — nothing runs migrations on deploy.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
  ```

## Review Focus

1. **Double-click / two admins on Publish** — the second request while the first is `SENDING` must 409 and send nothing; a broadcast stuck `SENDING` > 5 min must not block forever. (Task 7 tests: "a second publish while one is sending is refused", "a stale SENDING broadcast reads as timed out and does not block".)
2. **A mother in several chosen groups (static + dynamic overlap) or picked twice** — she gets exactly one inbox row and one push per device. (Task 4 test: "dedupes a mother matched by two groups"; Task 7 test: "a mother in two groups gets one inbox row".)
3. **Linked promo/package becomes invalid between saving and publishing** (expired, deactivated, used up, soft-deleted) — publish refuses with a specific 400 and creates no broadcast. (Task 7 tests per case.)
4. **Dynamic rule `notWithinDays` on a never-set timestamp** (mother who never opened since tracking, never booked) — she must match "not opened in 30 days" / "no booking in 60 days", not silently drop out. (Task 4 tests: "notWithinDays matches NULL".)
5. **Promo auto-apply when the code is no longer valid by the time she reaches Step 1** — she sees the normal inline error with the code still in the field, can remove it, and can still book; nothing blocks the flow. (Task 13 test: "an invalid pending code shows the error and booking still proceeds".)

---

## File Structure

**Shared (`packages/shared/src/`)**
- Create `notification-template.ts` — channel, audience, template input/DTOs, broadcast DTO, preview DTO, limits and image constants.
- Modify `user-group.ts` — group kind, dynamic rule schemas, `describeDynamicRule`, group input/update/DTO with kind+rules, picker `lastAppOpenAt` sort key/column and `rules` filter, rules-preview schemas.
- Modify `notifications.ts` — `announcement` type, `NotificationLinkSchema`, `imageUrl` + `link` on `NotificationResponseSchema`.
- Modify `operator.ts` — `notifications` section.
- Modify `admin.ts` — `AdminMotherSchema.lastAppOpenAt`, `AdminMotherListQuerySchema.lastAppOpen` filter + `lastAppOpenAt` sort.
- Modify `index.ts` — export the new file.
- Tests: `__tests__/notification-template.test.ts`, `__tests__/user-group.test.ts` (extend), `__tests__/notifications.test.ts` (create or extend).

**Backend (`apps/backend/`)**
- Modify `prisma/schema.prisma`; create migration `prisma/migrations/20261020120000_add_notification_center/`.
- Modify `src/services/notification.service.ts` — `ANNOUNCEMENT` mapping, `dispatchPushToTokens`, `imageUrl`/`link` in list output.
- Modify `src/services/auth.service.ts` (`getMe`); create `src/services/app-open.service.ts` and `src/routes/me.routes.ts` (mounted at `/me`) for `POST /me/app-open`.
- Create `src/lib/group-rules-sql.ts` — rule → SQL and the shared COMPLETED-bookings aggregate.
- Create `src/services/group-audience.service.ts` — `resolveGroupMembers`, `countGroupMembers`.
- Modify `src/services/survey-audience.service.ts` — group branch via `resolveGroupMembers`.
- Modify `src/services/admin-group.service.ts`, `src/services/mother-picker.service.ts`, the admin mothers list service.
- Create `src/services/admin-notification-template.service.ts` — CRUD, audience preview, history.
- Create `src/services/notification-broadcast.service.ts` — publish.
- Modify `src/routes/admin.routes.ts`, `src/lib/admin-permissions.ts`.
- Test helper `test/journeys/notification.ts`.
- Tests: unit `src/__tests__/group-rules-sql.test.ts`, `notification-type-map.test.ts` (extend), `notification-push-batch.test.ts`, `auth-last-login.test.ts`; integration `src/__integration__/journeys/a44-app-open-and-login.test.ts`, `a45-dynamic-groups.test.ts`, `a46-notification-templates.test.ts`, `a47-notification-publish.test.ts`.

**Admin (`apps/admin/src/`)**
- Modify `lib/api.ts`, `app.tsx`, `components/admin-layout.tsx` (Notifications takes `Megaphone`; Campaigns moves to `Images`), the toast provider (action toast + warning tone), `Select` (aria props).
- Create `components/segmented-control.tsx`, `hooks/use-debounced-value.ts`, `features/groups/group-labels.ts`.
- Modify `features/campaigns/campaign-image-cropper.tsx` → generalise to `components/image-cropper.tsx` (width/height props); campaigns keep working.
- Create `pages/notifications-page.tsx`, `pages/notification-template-page.tsx`.
- Create `features/notifications/`: `template-table.tsx`, `template-editor.tsx`, `template-content-fields.tsx`, `template-link-fields.tsx`, `template-audience-fields.tsx`, `save-as-group-dialog.tsx`, `template-preview.tsx`, `publish-dialog.tsx`, `broadcast-history.tsx`, `notification-labels.ts`.
- Modify `features/groups/` (`group-form.tsx`, `group-table.tsx`, `mother-picker-table.tsx`), create `features/groups/rule-editor.tsx`; modify `pages/group-detail-page.tsx`, `features/users/mothers-tab.tsx`.
- Tests under `pages/__tests__/` and `features/notifications/__tests__/`, `features/groups/__tests__/`.

**Mobile (`apps/mobile/`)**
- Create `src/hooks/useAppOpenPing.ts`, `src/lib/openPromoLink.ts`, `src/components/AnnouncementCard.tsx`.
- Modify `app/_layout.tsx`, `src/components/CampaignCarousel.tsx`, `src/screens/parent/BookingStep1Screen.tsx`, `src/hooks/usePushNotifications.ts`, `src/screens/parent/NotificationsScreen.tsx`.
- Tests under `src/hooks/__tests__/`, `src/lib/__tests__/`, `src/components/__tests__/`, `src/screens/parent/__tests__/`.
- E2E: flow `c20-announcement-promo.yaml` (inbox announcement + Home campaign → Step 1 with code applied), sweep flow `s20-announcements.yaml`, `_book-from-date-picker.yaml` split out of `_book-to-review.yaml`, new `advance.js` steps, seeder reset of lab-named templates/campaigns.

---

## Tasks

| # | Task | Area |
|---|---|---|
| 1 | Shared schemas | shared |
| 2 | Prisma models, migration, ANNOUNCEMENT type | backend |
| 3 | Last login = real sign-in; last app open ping | backend |
| 4 | Dynamic rule SQL and the shared group resolver | backend |
| 5 | Groups static/dynamic, picker and Mothers list last-app-open | backend |
| 6 | Notification templates CRUD and audience preview | backend |
| 7 | Publish and batched push | backend |
| 8 | Inbox payload: image and link | backend |
| 9 | API client, Notifications section, nav, template list | admin |
| 10 | Template editor: content, image, channel, link, preview, save | admin |
| 11 | Audience, save-as-group, publish, history | admin |
| 12 | Static/dynamic groups, picker and Mothers tab columns | admin |
| 13 | App-open ping, shared link opener, promo auto-apply | mobile |
| 14 | Push tap and inbox announcement card | mobile |
| 15 | UI sweep, device E2E, docs | mobile/e2e/docs |

Tasks run in order. Each task's **Interfaces** block is the contract with its neighbours; "> Note:" lines record where a task deliberately differs from the first-draft contract.

---

### Task 1: Shared schemas

> Note: The contract's additions to `AdminMotherSchema`, `UserGroupSchema`, `MotherPickerRowSchema`, `MOTHER_PICKER_SORT_KEYS` and `NotificationResponseSchema` are required fields on DTOs the backend already builds, so `pnpm --filter @nanny-app/backend typecheck` **fails between this commit and Task 2's**. Task 2 adds the columns and patches the four backend mappers (`admin-group.service.ts`, `mother-picker.service.ts`, `admin-user.service.ts`, `notification.service.ts`). This task updates the admin and mobile test fixtures typed with those DTOs, so admin and mobile stay green. `MotherPickerQuerySchema.rules` parses the JSON in a single `.transform` that raises its issue through `ctx`. That has the same effect as the contract's "transform + superRefine": the issue lands on `rules` and the output is `DynamicGroupRules | undefined`. `pnpm --filter @nanny-app/shared lint` already fails on HEAD in `register-nanny-required.test.ts` (7 unused vars), so this task lints only the files it touches.

**Files:**
- Create: `packages/shared/src/notification-template.ts`
- Modify: `packages/shared/src/user-group.ts` (whole file replaced below), `packages/shared/src/notifications.ts` (`NotificationTypeSchema` L5–31, `NotificationResponseSchema` L41–50), `packages/shared/src/operator.ts` (`ADMIN_SECTIONS` L19–36, `ADMIN_SECTION_LABELS` L45–62, `ADMIN_SECTION_PATHS` L65–82, `OperatorPermissionsSchema` L100–117), `packages/shared/src/admin.ts` (`AdminMotherSchema` / `AdminMotherListQuerySchema` L845–875), `packages/shared/src/index.ts`
- Modify (fixtures only): `apps/admin/src/pages/__tests__/groups-page.test.tsx`, `apps/admin/src/pages/__tests__/group-detail-page.test.tsx`, `apps/admin/src/features/groups/__tests__/mother-picker-table.test.tsx`, `apps/admin/src/features/surveys/__tests__/recipient-picker-modal.test.tsx`, `apps/mobile/src/screens/parent/__tests__/NotificationsScreen.test.tsx`
- Test: `packages/shared/src/__tests__/notification-template.test.ts` (create), `packages/shared/src/__tests__/notifications.test.ts` (create), `packages/shared/src/__tests__/user-group.test.ts` (replace)

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `@nanny-app/shared`):
  - `notification-template.ts`:
    - consts `NOTIFICATION_TEMPLATE_NAME_MAX = 80`, `NOTIFICATION_TITLE_MAX = 65`, `NOTIFICATION_BODY_MAX = 240`, `NOTIFICATION_IMAGE_WIDTH = 1024`, `NOTIFICATION_IMAGE_HEIGHT = 512`, `NOTIFICATION_AUDIENCE_MAX_GROUPS = 20`, `NOTIFICATION_AUDIENCE_MAX_MOTHERS = 5000`, `BROADCAST_STALE_MS = 5 * 60 * 1000`.
    - `NotificationChannelSchema = z.enum(['IN_APP','PUSH','BOTH'])` / `NotificationChannel`.
    - `NotificationAudienceSchema = z.discriminatedUnion('type', [{type:'GROUPS', groupIds: int[] 1..20 (deduped by transform)}, {type:'MOTHERS', motherIds: int[] 1..5000 (deduped)}])` / `NotificationAudience`.
    - `NotificationTemplateInputSchema` (used by both POST and PATCH — full replace): `{ name, title, body, imageUrl: url|null, channel, targetType: CampaignTargetType|null, packageId: int|null, promoCodeId: int|null, audience }` with the one-target refine (message `'Pick exactly one package or promo code for this link.'`, path `['targetType']`). Types `NotificationTemplateInput` (z.input) / `NotificationTemplateValues` (z.output).
    - `NotificationTemplateSchema` (admin DTO): `{ id, name, title, body, imageUrl: string|null, channel, targetType: CampaignTargetType|null, packageId: number|null, promoCodeId: number|null, package: {id, name}|null, promoCode: {id, code}|null, audience: NotificationAudience, audienceGroups: {id, name, kind: UserGroupKind}[], audienceMothers: {id, name}[], publishCount: number, lastPublishedAt: string|null, createdAt: string, updatedAt: string }` / `NotificationTemplate`.
    - `NotificationTemplateListItemSchema`: `{ id, name, title, channel, targetType, linkLabel: string|null, audienceSummary: string, publishCount, lastPublishedAt: string|null, updatedAt }` / `NotificationTemplateListItem`. `audienceSummary` is e.g. `"2 groups"` / `"1 group"` / `"37 mothers"` / `"1 mother"`.
    - `NotificationAudiencePreviewInputSchema = z.object({ audience: NotificationAudienceSchema })`; `NotificationAudiencePreviewSchema = { mothers: number, withPushDevice: number }` / `NotificationAudiencePreview`.
    - `NotificationBroadcastStatusSchema = z.enum(['SENDING','SENT','PARTIAL','FAILED'])` / `NotificationBroadcastStatus`.
    - `NotificationBroadcastSchema`: `{ id, templateId, status, title, channel, targeted, inAppCreated, pushSent, pushFailed, noDevice, skippedGroupIds: number[], error: string|null, publishedBy: {id, name}, createdAt: string, completedAt: string|null }` / `NotificationBroadcast`.
  - `user-group.ts` additions:
    - `UserGroupKindSchema = z.enum(['STATIC','DYNAMIC'])` / `UserGroupKind`.
    - `DYNAMIC_RULE_DATE_FIELDS = ['lastAppOpenAt','lastLoginAt','createdAt','lastBookingAt'] as const`, `DYNAMIC_RULE_NUMBER_FIELDS = ['completedBookings','totalSpent'] as const`, `DYNAMIC_RULE_DAYS_MAX = 3650`.
    - `DynamicGroupRuleSchema` — discriminated on `field`, shape `{ field: date field, op: 'withinDays'|'notWithinDays', days: int 1..3650 } | { field: number field, op: 'gte'|'lte', value: number ≥ 0 (int for completedBookings) }` / `DynamicGroupRule`.
    - `DynamicGroupRulesSchema = z.array(DynamicGroupRuleSchema).max(6)` refined so each `field` appears at most once (message `'Each rule field can be used once.'`) / `DynamicGroupRules`.
    - `describeDynamicRule(rule: DynamicGroupRule): string`; `describeDynamicRules(rules): string` joins with `" AND "`; empty → `"Every active mother"`.
    - `UserGroupInputSchema` extended: `kind: UserGroupKindSchema.default('STATIC')`, `rules: DynamicGroupRulesSchema.nullish()`, refine: STATIC ⇒ rules null/undefined (normalised to `null`), DYNAMIC ⇒ rules is an array (may be empty). `UserGroupUpdateSchema = { name, description, rules?: DynamicGroupRules }` (no `kind`) / `UserGroupUpdateInput`.
    - `UserGroupSchema` gains `kind: UserGroupKind`, `rules: DynamicGroupRules | null`.
    - `GroupRulesPreviewInputSchema = z.object({ rules: DynamicGroupRulesSchema })`; `GroupRulesPreviewSchema = { count: number }` / `GroupRulesPreview`.
    - `MOTHER_PICKER_SORT_KEYS` gains `'lastAppOpenAt'`; `MotherPickerQuerySchema` gains `rules` (JSON string → `DynamicGroupRules | undefined`, invalid → issue on `rules`); `MotherPickerRowSchema` gains `lastAppOpenAt: string|null`.
  - `notifications.ts`: `'announcement'` appended to `NotificationTypeSchema`; `NotificationLinkSchema` / `NotificationLink`; `NotificationResponseSchema` gains `imageUrl: z.string().nullable().default(null)`, `link: NotificationLinkSchema.nullable().default(null)`.
  - `operator.ts`: `'notifications'` in `ADMIN_SECTIONS`, label `'Notifications'`, path `'/notifications'`, `OperatorPermissionsSchema.notifications`.
  - `admin.ts`: `AdminMotherSchema.lastAppOpenAt: string|null`; `AdminMotherSortKeySchema` (`AdminUserSortKeySchema` options + `'lastAppOpenAt'`) / `AdminMotherSortKey`, used as `AdminMotherListQuerySchema.sortBy` (the same pattern as `AdminNannySortKeySchema`); `AdminMotherLastAppOpenFilterSchema` / `AdminMotherLastAppOpenFilter`, and `AdminMotherListQuerySchema.lastAppOpen: AdminMotherLastAppOpenFilterSchema.catch('ANY').default('ANY')`.
  - `AppOpenResponse`: none (the endpoint answers 204).

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/__tests__/notification-template.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  BROADCAST_STALE_MS,
  NOTIFICATION_IMAGE_HEIGHT,
  NOTIFICATION_IMAGE_WIDTH,
  NotificationAudienceSchema,
  NotificationBroadcastSchema,
  NotificationTemplateInputSchema,
} from '../notification-template';

const BASE = {
  name: ' Win-back 30d ',
  title: 'We miss you',
  body: 'Book this week and save.',
  channel: 'BOTH',
  audience: { type: 'GROUPS', groupIds: [3] },
} as const;

describe('NotificationTemplateInputSchema', () => {
  it('trims text and defaults the image and link to null', () => {
    expect(NotificationTemplateInputSchema.parse(BASE)).toEqual({
      name: 'Win-back 30d',
      title: 'We miss you',
      body: 'Book this week and save.',
      imageUrl: null,
      channel: 'BOTH',
      targetType: null,
      packageId: null,
      promoCodeId: null,
      audience: { type: 'GROUPS', groupIds: [3] },
    });
  });

  it('caps the title at 65 and the body at 240 characters', () => {
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, title: 'x'.repeat(65) }).success).toBe(true);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, title: 'x'.repeat(66) }).success).toBe(false);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, body: 'x'.repeat(240) }).success).toBe(true);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, body: 'x'.repeat(241) }).success).toBe(false);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, name: 'x'.repeat(81) }).success).toBe(false);
  });

  it('accepts only IN_APP, PUSH or BOTH', () => {
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, channel: 'PUSH' }).success).toBe(true);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, channel: 'SMS' }).success).toBe(false);
  });

  it('needs exactly the id that matches the link type', () => {
    const issue = (input: object) => {
      const res = NotificationTemplateInputSchema.safeParse({ ...BASE, ...input });
      return res.success ? null : res.error.issues[0];
    };
    expect(issue({ targetType: 'PACKAGE', packageId: 4 })).toBeNull();
    expect(issue({ targetType: 'PROMO_CODE', promoCodeId: 9 })).toBeNull();
    expect(issue({ targetType: 'PACKAGE', promoCodeId: 9 })).toMatchObject({
      message: 'Pick exactly one package or promo code for this link.',
      path: ['targetType'],
    });
    expect(issue({ targetType: 'PROMO_CODE', packageId: 4, promoCodeId: 9 })).not.toBeNull();
    expect(issue({ packageId: 4 })).not.toBeNull();
  });

  it('refuses an image that is not a URL', () => {
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, imageUrl: 'not a url' }).success).toBe(false);
  });
});

describe('NotificationAudienceSchema', () => {
  it('dedupes ids', () => {
    expect(NotificationAudienceSchema.parse({ type: 'GROUPS', groupIds: [2, 2, 5] })).toEqual({ type: 'GROUPS', groupIds: [2, 5] });
    expect(NotificationAudienceSchema.parse({ type: 'MOTHERS', motherIds: [7, 7] })).toEqual({ type: 'MOTHERS', motherIds: [7] });
  });

  it('takes 1–20 groups and 1–5000 mothers', () => {
    expect(NotificationAudienceSchema.safeParse({ type: 'GROUPS', groupIds: [] }).success).toBe(false);
    expect(NotificationAudienceSchema.safeParse({ type: 'GROUPS', groupIds: Array.from({ length: 21 }, (_, i) => i + 1) }).success).toBe(false);
    expect(NotificationAudienceSchema.safeParse({ type: 'MOTHERS', motherIds: [] }).success).toBe(false);
    expect(NotificationAudienceSchema.safeParse({ type: 'MOTHERS', motherIds: Array.from({ length: 5000 }, (_, i) => i + 1) }).success).toBe(true);
    expect(NotificationAudienceSchema.safeParse({ type: 'MOTHERS', motherIds: Array.from({ length: 5001 }, (_, i) => i + 1) }).success).toBe(false);
  });

  it('refuses an unknown audience type', () => {
    expect(NotificationAudienceSchema.safeParse({ type: 'ALL' }).success).toBe(false);
  });
});

describe('constants and broadcast DTO', () => {
  it('fixes the image at 1024×512 and staleness at five minutes', () => {
    expect([NOTIFICATION_IMAGE_WIDTH, NOTIFICATION_IMAGE_HEIGHT]).toEqual([1024, 512]);
    expect(BROADCAST_STALE_MS).toBe(300_000);
  });

  it('parses a broadcast row', () => {
    const row = {
      id: 1, templateId: 2, status: 'PARTIAL', title: 't', channel: 'PUSH',
      targeted: 10, inAppCreated: 0, pushSent: 8, pushFailed: 1, noDevice: 1,
      skippedGroupIds: [4], error: null, publishedBy: { id: 3, name: 'Admin' },
      createdAt: '2026-10-20T10:00:00.000Z', completedAt: '2026-10-20T10:00:05.000Z',
    };
    expect(NotificationBroadcastSchema.parse(row)).toEqual(row);
  });
});
```

Create `packages/shared/src/__tests__/notifications.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { NotificationLinkSchema, NotificationResponseSchema, NotificationTypeSchema } from '../notifications';

const ROW = {
  id: 1,
  type: 'booking_confirmed',
  title: 'Booking confirmed',
  body: 'See you soon',
  isRead: false,
  referenceId: 42,
  referenceType: 'booking',
  createdAt: '2026-10-20T10:00:00.000Z',
};

describe('announcement notifications', () => {
  it('is a notification type', () => {
    expect(NotificationTypeSchema.parse('announcement')).toBe('announcement');
  });

  it('links to a package or a promo code, nothing else', () => {
    expect(NotificationLinkSchema.parse({ type: 'package', packageId: 4 })).toEqual({ type: 'package', packageId: 4 });
    expect(NotificationLinkSchema.parse({ type: 'promo_code', code: 'SAVE20' })).toEqual({ type: 'promo_code', code: 'SAVE20' });
    expect(NotificationLinkSchema.safeParse({ type: 'promo_code', code: '' }).success).toBe(false);
    expect(NotificationLinkSchema.safeParse({ type: 'url', href: 'https://x' }).success).toBe(false);
  });

  it('defaults imageUrl and link to null for rows that carry neither', () => {
    expect(NotificationResponseSchema.parse(ROW)).toMatchObject({ imageUrl: null, link: null });
  });

  it('keeps an announcement image and link', () => {
    const parsed = NotificationResponseSchema.parse({
      ...ROW,
      type: 'announcement',
      referenceId: null,
      referenceType: null,
      imageUrl: 'https://cdn.example.com/a.jpg',
      link: { type: 'promo_code', code: 'SAVE20' },
    });
    expect(parsed.link).toEqual({ type: 'promo_code', code: 'SAVE20' });
    expect(parsed.imageUrl).toBe('https://cdn.example.com/a.jpg');
  });
});
```

Replace `packages/shared/src/__tests__/user-group.test.ts` with the version below. The first `UserGroupInputSchema` case now expects `kind`/`rules` in the output. The existing picker, members and sections cases are kept, and the sections case gains `notifications`.

```ts
import { describe, expect, it } from 'vitest';

import {
  DynamicGroupRuleSchema,
  DynamicGroupRulesSchema,
  GroupRulesPreviewInputSchema,
  MotherPickerQuerySchema,
  UserGroupInputSchema,
  UserGroupMembersSchema,
  UserGroupUpdateSchema,
  describeDynamicRule,
  describeDynamicRules,
  type DynamicGroupRule,
} from '../user-group';
import { ADMIN_SECTIONS, ADMIN_SECTION_LABELS, ADMIN_SECTION_PATHS, OperatorPermissionsSchema } from '../operator';
import { NotificationTypeSchema, NotificationReferenceTypeSchema } from '../notifications';
import { AdminMotherListQuerySchema } from '../admin';

describe('UserGroupInputSchema', () => {
  it('trims the name, stores a blank description as null, and defaults to a static group', () => {
    expect(UserGroupInputSchema.parse({ name: '  Beta  ', description: ' ' })).toEqual({
      name: 'Beta',
      description: null,
      kind: 'STATIC',
      rules: null,
    });
  });
  it('refuses an empty name', () => {
    expect(UserGroupInputSchema.safeParse({ name: '  ' }).success).toBe(false);
  });
  it('refuses rules on a static group', () => {
    const res = UserGroupInputSchema.safeParse({ name: 'G', kind: 'STATIC', rules: [] });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]).toMatchObject({ path: ['rules'], message: 'Only dynamic groups have rules.' });
  });
  it('needs a rules array on a dynamic group; an empty one is every active mother', () => {
    expect(UserGroupInputSchema.safeParse({ name: 'G', kind: 'DYNAMIC' }).success).toBe(false);
    expect(UserGroupInputSchema.parse({ name: 'All mothers', kind: 'DYNAMIC', rules: [] })).toMatchObject({ kind: 'DYNAMIC', rules: [] });
    expect(
      UserGroupInputSchema.parse({ name: 'Lapsed', kind: 'DYNAMIC', rules: [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }] }).rules,
    ).toEqual([{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }]);
  });
});

describe('UserGroupUpdateSchema', () => {
  it('drops kind — it is fixed after creation', () => {
    expect(UserGroupUpdateSchema.parse({ name: 'G', kind: 'DYNAMIC' })).toEqual({ name: 'G', description: null });
  });
  it('accepts a rules edit', () => {
    expect(UserGroupUpdateSchema.parse({ name: 'G', rules: [{ field: 'totalSpent', op: 'gte', value: 1000 }] }).rules).toHaveLength(1);
  });
});

describe('UserGroupMembersSchema', () => {
  it('needs at least one user id', () => {
    expect(UserGroupMembersSchema.safeParse({ userIds: [] }).success).toBe(false);
  });
});

describe('DynamicGroupRuleSchema', () => {
  it('takes days 1–3650 on the date fields', () => {
    expect(DynamicGroupRuleSchema.safeParse({ field: 'lastLoginAt', op: 'withinDays', days: 1 }).success).toBe(true);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'lastLoginAt', op: 'withinDays', days: 3650 }).success).toBe(true);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'lastLoginAt', op: 'withinDays', days: 0 }).success).toBe(false);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'createdAt', op: 'withinDays', days: 3651 }).success).toBe(false);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'createdAt', op: 'gte', days: 3 }).success).toBe(false);
  });
  it('takes gte/lte with a value ≥ 0 on the number fields, whole bookings only', () => {
    expect(DynamicGroupRuleSchema.safeParse({ field: 'completedBookings', op: 'gte', value: 0 }).success).toBe(true);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'completedBookings', op: 'gte', value: 1.5 }).success).toBe(false);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'totalSpent', op: 'lte', value: 499.5 }).success).toBe(true);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'totalSpent', op: 'lte', value: -1 }).success).toBe(false);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'totalSpent', op: 'withinDays', days: 3 }).success).toBe(false);
  });
  it('refuses an unknown field', () => {
    expect(DynamicGroupRuleSchema.safeParse({ field: 'age', op: 'gte', value: 3 }).success).toBe(false);
  });
});

describe('DynamicGroupRulesSchema', () => {
  it('allows each field once', () => {
    const res = DynamicGroupRulesSchema.safeParse([
      { field: 'lastAppOpenAt', op: 'withinDays', days: 7 },
      { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
    ]);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe('Each rule field can be used once.');
  });
  it('allows an empty list', () => {
    expect(DynamicGroupRulesSchema.parse([])).toEqual([]);
  });
});

describe('describeDynamicRule(s)', () => {
  const cases: [DynamicGroupRule, string][] = [
    [{ field: 'lastAppOpenAt', op: 'withinDays', days: 7 }, 'Opened the app in the last 7 days'],
    [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }, 'Not opened the app in 30+ days (or never)'],
    [{ field: 'lastLoginAt', op: 'withinDays', days: 14 }, 'Signed in within 14 days'],
    [{ field: 'lastLoginAt', op: 'notWithinDays', days: 60 }, 'Not signed in for 60+ days (or never)'],
    [{ field: 'createdAt', op: 'withinDays', days: 7 }, 'Signed up in the last 7 days'],
    [{ field: 'createdAt', op: 'notWithinDays', days: 90 }, 'Signed up 90+ days ago'],
    [{ field: 'lastBookingAt', op: 'withinDays', days: 30 }, 'Booked in the last 30 days'],
    [{ field: 'lastBookingAt', op: 'notWithinDays', days: 60 }, 'No booking in 60+ days (or never)'],
    [{ field: 'completedBookings', op: 'gte', value: 3 }, 'At least 3 completed bookings'],
    [{ field: 'completedBookings', op: 'lte', value: 0 }, 'At most 0 completed bookings'],
    [{ field: 'totalSpent', op: 'gte', value: 1000 }, 'Spent at least EGP 1,000'],
    [{ field: 'totalSpent', op: 'lte', value: 500 }, 'Spent at most EGP 500'],
  ];
  it.each(cases)('describes %j', (rule, text) => {
    expect(describeDynamicRule(rule)).toBe(text);
  });
  it('joins rules with AND, and reads an empty set as every active mother', () => {
    expect(
      describeDynamicRules([
        { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
        { field: 'completedBookings', op: 'gte', value: 1 },
      ]),
    ).toBe('Not opened the app in 30+ days (or never) AND At least 1 completed booking');
    expect(describeDynamicRules([])).toBe('Every active mother');
  });
});

describe('GroupRulesPreviewInputSchema', () => {
  it('validates the rules it carries', () => {
    expect(GroupRulesPreviewInputSchema.safeParse({ rules: [{ field: 'nope' }] }).success).toBe(false);
    expect(GroupRulesPreviewInputSchema.parse({ rules: [] })).toEqual({ rules: [] });
  });
});

describe('MotherPickerQuerySchema', () => {
  it('defaults to newest sign-ups first and falls back on an unknown sort key', () => {
    expect(MotherPickerQuerySchema.parse({})).toMatchObject({ page: 1, sortBy: 'createdAt', sortDir: 'desc' });
    expect(MotherPickerQuerySchema.parse({ sortBy: 'nope', groupId: '4' })).toMatchObject({ sortBy: 'createdAt', groupId: 4 });
    expect(MotherPickerQuerySchema.parse({ excludeGroupId: '7' })).toMatchObject({ excludeGroupId: 7 });
  });
  it('sorts by last app open', () => {
    expect(MotherPickerQuerySchema.parse({ sortBy: 'lastAppOpenAt' }).sortBy).toBe('lastAppOpenAt');
  });
  it('parses rules from a JSON string, and refuses bad JSON or bad rules on `rules`', () => {
    const rules = [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }];
    expect(MotherPickerQuerySchema.parse({ rules: JSON.stringify(rules) }).rules).toEqual(rules);
    expect(MotherPickerQuerySchema.parse({}).rules).toBeUndefined();
    const badJson = MotherPickerQuerySchema.safeParse({ rules: '[{' });
    expect(badJson.success).toBe(false);
    expect(badJson.error?.issues[0]?.path).toEqual(['rules']);
    const badRule = MotherPickerQuerySchema.safeParse({ rules: JSON.stringify([{ field: 'age' }]) });
    expect(badRule.success).toBe(false);
    expect(badRule.error?.issues[0]?.path).toEqual(['rules']);
  });
});

describe('AdminMotherListQuerySchema', () => {
  it('filters by last app open and sorts by it, falling back on unknown values', () => {
    expect(AdminMotherListQuerySchema.parse({})).toMatchObject({ lastAppOpen: 'ANY', sortBy: 'registered' });
    expect(AdminMotherListQuerySchema.parse({ lastAppOpen: 'NOT_30', sortBy: 'lastAppOpenAt' })).toMatchObject({
      lastAppOpen: 'NOT_30',
      sortBy: 'lastAppOpenAt',
    });
    expect(AdminMotherListQuerySchema.parse({ lastAppOpen: 'SOMETIMES' }).lastAppOpen).toBe('ANY');
  });
});

describe('admin sections, survey notification type', () => {
  it('are console sections with a label and a path', () => {
    expect(ADMIN_SECTIONS).toEqual(expect.arrayContaining(['surveys', 'groups', 'notifications']));
    expect(ADMIN_SECTION_LABELS.surveys).toBe('Surveys');
    expect(ADMIN_SECTION_PATHS.surveys).toBe('/surveys');
    expect(ADMIN_SECTION_LABELS.groups).toBe('Groups');
    expect(ADMIN_SECTION_PATHS.groups).toBe('/groups');
    expect(ADMIN_SECTION_LABELS.notifications).toBe('Notifications');
    expect(ADMIN_SECTION_PATHS.notifications).toBe('/notifications');
    expect(OperatorPermissionsSchema.parse({ notifications: 'MANAGE' })).toEqual({ notifications: 'MANAGE' });
  });
  it('is a notification type and a reference type', () => {
    expect(NotificationTypeSchema.parse('survey')).toBe('survey');
    expect(NotificationReferenceTypeSchema.parse('survey')).toBe('survey');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @nanny-app/shared test -- notification-template notifications user-group`
Expected: FAIL. `Cannot find module '../notification-template'`; `NotificationLinkSchema` is not exported; `UserGroupUpdateSchema` / `describeDynamicRule` are not exported, and the first `UserGroupInputSchema` case fails on the missing `kind` / `rules`.

- [ ] **Step 3: Implement `packages/shared/src/notification-template.ts`**

```ts
import { z } from 'zod';

import { CampaignTargetTypeSchema } from './campaign';
import { UserGroupKindSchema } from './user-group';

// ──────────────────────────────────────────────────────────────
// Notification center — admin-built templates published to mothers on
// demand. Every send comes from a template; each publish snapshots the
// template into a broadcast. See
// docs/superpowers/specs/2026-10-20-admin-notification-center-design.md.
// ──────────────────────────────────────────────────────────────

export const NOTIFICATION_TEMPLATE_NAME_MAX = 80;
export const NOTIFICATION_TITLE_MAX = 65;
export const NOTIFICATION_BODY_MAX = 240;

/** The image is cropped to this 2:1 size (the campaign cropper) and stored in the `notifications` folder. */
export const NOTIFICATION_IMAGE_WIDTH = 1024;
export const NOTIFICATION_IMAGE_HEIGHT = 512;

export const NOTIFICATION_AUDIENCE_MAX_GROUPS = 20;
export const NOTIFICATION_AUDIENCE_MAX_MOTHERS = 5000;

/** A broadcast still SENDING after this long reads as FAILED ("Timed out") and no longer blocks a publish. */
export const BROADCAST_STALE_MS = 5 * 60 * 1000;

export const NotificationChannelSchema = z.enum(['IN_APP', 'PUSH', 'BOTH']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

const dedupe = (ids: number[]): number[] => [...new Set(ids)];

/** Who a template goes to: one or more groups (unioned), or hand-picked mothers. */
export const NotificationAudienceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('GROUPS'),
    groupIds: z.array(z.number().int().positive()).min(1).max(NOTIFICATION_AUDIENCE_MAX_GROUPS).transform(dedupe),
  }),
  z.object({
    type: z.literal('MOTHERS'),
    motherIds: z.array(z.number().int().positive()).min(1).max(NOTIFICATION_AUDIENCE_MAX_MOTHERS).transform(dedupe),
  }),
]);
export type NotificationAudience = z.infer<typeof NotificationAudienceSchema>;

/**
 * Create (POST) and edit (PATCH) body — PATCH is a full replace. The link is
 * none, or exactly one of a package / a promo code, matching `targetType`
 * (the campaigns rule).
 */
export const NotificationTemplateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(NOTIFICATION_TEMPLATE_NAME_MAX),
    title: z.string().trim().min(1).max(NOTIFICATION_TITLE_MAX),
    body: z.string().trim().min(1).max(NOTIFICATION_BODY_MAX),
    imageUrl: z.string().url().nullable().default(null),
    channel: NotificationChannelSchema,
    targetType: CampaignTargetTypeSchema.nullable().default(null),
    packageId: z.number().int().positive().nullable().default(null),
    promoCodeId: z.number().int().positive().nullable().default(null),
    audience: NotificationAudienceSchema,
  })
  .refine(
    (v) => {
      if (v.targetType === 'PACKAGE') return v.packageId != null && v.promoCodeId == null;
      if (v.targetType === 'PROMO_CODE') return v.promoCodeId != null && v.packageId == null;
      return v.packageId == null && v.promoCodeId == null;
    },
    { message: 'Pick exactly one package or promo code for this link.', path: ['targetType'] },
  );
export type NotificationTemplateInput = z.input<typeof NotificationTemplateInputSchema>;
export type NotificationTemplateValues = z.output<typeof NotificationTemplateInputSchema>;

/** Admin DTO for one template, with the link and audience names resolved for display. */
export const NotificationTemplateSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  channel: NotificationChannelSchema,
  targetType: CampaignTargetTypeSchema.nullable(),
  packageId: z.number().int().nullable(),
  promoCodeId: z.number().int().nullable(),
  package: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  promoCode: z.object({ id: z.number().int(), code: z.string() }).nullable(),
  audience: NotificationAudienceSchema,
  audienceGroups: z.array(z.object({ id: z.number().int(), name: z.string(), kind: UserGroupKindSchema })),
  audienceMothers: z.array(z.object({ id: z.number().int(), name: z.string() })),
  publishCount: z.number().int(),
  lastPublishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>;

/** One row of the Notifications page table. */
export const NotificationTemplateListItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  title: z.string(),
  channel: NotificationChannelSchema,
  targetType: CampaignTargetTypeSchema.nullable(),
  /** The package name or the promo code; null without a link. */
  linkLabel: z.string().nullable(),
  /** "2 groups" / "1 group" / "37 mothers" / "1 mother". */
  audienceSummary: z.string(),
  publishCount: z.number().int(),
  lastPublishedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type NotificationTemplateListItem = z.infer<typeof NotificationTemplateListItemSchema>;

export const NotificationAudiencePreviewInputSchema = z.object({ audience: NotificationAudienceSchema });
export type NotificationAudiencePreviewInput = z.input<typeof NotificationAudiencePreviewInputSchema>;

/** Live count for the editor: who would receive it, and how many of them have a push device. */
export const NotificationAudiencePreviewSchema = z.object({
  mothers: z.number().int(),
  withPushDevice: z.number().int(),
});
export type NotificationAudiencePreview = z.infer<typeof NotificationAudiencePreviewSchema>;

export const NotificationBroadcastStatusSchema = z.enum(['SENDING', 'SENT', 'PARTIAL', 'FAILED']);
export type NotificationBroadcastStatus = z.infer<typeof NotificationBroadcastStatusSchema>;

/** One publish of a template, with its delivery counts. */
export const NotificationBroadcastSchema = z.object({
  id: z.number().int(),
  templateId: z.number().int(),
  status: NotificationBroadcastStatusSchema,
  title: z.string(),
  channel: NotificationChannelSchema,
  targeted: z.number().int(),
  inAppCreated: z.number().int(),
  pushSent: z.number().int(),
  pushFailed: z.number().int(),
  noDevice: z.number().int(),
  /** Groups deleted after the template was saved, skipped at publish. */
  skippedGroupIds: z.array(z.number().int()),
  error: z.string().nullable(),
  publishedBy: z.object({ id: z.number().int(), name: z.string() }),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type NotificationBroadcast = z.infer<typeof NotificationBroadcastSchema>;
```

- [ ] **Step 4: Replace `packages/shared/src/user-group.ts`**

Group code stays feature-neutral: nothing here imports from `survey.ts` or `notification-template.ts`. (`notification-template.ts` imports `UserGroupKindSchema` from here, never the reverse.)

```ts
import { z } from 'zod';

import { AdminListQuerySchema, AdminSortDirSchema } from './admin';

// ──────────────────────────────────────────────────────────────
// Admin-curated groups of mothers, and the sortable mother picker used to
// fill groups and pick individuals. Feature-neutral on purpose: Surveys and
// the notification center both send to groups — keep survey- and
// notification-specific types out of this file.
//
// A group is STATIC (hand-picked members) or DYNAMIC (rules evaluated when
// something is sent; no member rows). The kind is fixed at creation.
// ──────────────────────────────────────────────────────────────

export const USER_GROUP_NAME_MAX = 80;
export const USER_GROUP_DESCRIPTION_MAX = 300;

export const UserGroupKindSchema = z.enum(['STATIC', 'DYNAMIC']);
export type UserGroupKind = z.infer<typeof UserGroupKindSchema>;

// ── Dynamic-group rules ───────────────────────────────────────
// AND-ed, each field at most once. `notWithinDays` also matches a NULL
// timestamp ("never"). Booking metrics count COMPLETED, non-deleted bookings
// only — the same aggregate the mother picker shows.

export const DYNAMIC_RULE_DATE_FIELDS = ['lastAppOpenAt', 'lastLoginAt', 'createdAt', 'lastBookingAt'] as const;
export const DYNAMIC_RULE_NUMBER_FIELDS = ['completedBookings', 'totalSpent'] as const;
export const DYNAMIC_RULE_DAYS_MAX = 3650;
export const DYNAMIC_RULES_MAX = DYNAMIC_RULE_DATE_FIELDS.length + DYNAMIC_RULE_NUMBER_FIELDS.length;

export const DynamicDateRuleOpSchema = z.enum(['withinDays', 'notWithinDays']);
export const DynamicNumberRuleOpSchema = z.enum(['gte', 'lte']);

const DynamicDateRuleSchema = z.object({
  field: z.enum(DYNAMIC_RULE_DATE_FIELDS),
  op: DynamicDateRuleOpSchema,
  days: z.number().int().min(1).max(DYNAMIC_RULE_DAYS_MAX),
});

const CompletedBookingsRuleSchema = z.object({
  field: z.literal('completedBookings'),
  op: DynamicNumberRuleOpSchema,
  value: z.number().int().min(0),
});

const TotalSpentRuleSchema = z.object({
  field: z.literal('totalSpent'),
  op: DynamicNumberRuleOpSchema,
  value: z.number().finite().min(0),
});

export const DynamicGroupRuleSchema = z.discriminatedUnion('field', [
  DynamicDateRuleSchema,
  CompletedBookingsRuleSchema,
  TotalSpentRuleSchema,
]);
export type DynamicGroupRule = z.infer<typeof DynamicGroupRuleSchema>;
export type DynamicGroupRuleField = DynamicGroupRule['field'];

export const DynamicGroupRulesSchema = z
  .array(DynamicGroupRuleSchema)
  .max(DYNAMIC_RULES_MAX)
  .superRefine((rules, ctx) => {
    const seen = new Set<DynamicGroupRuleField>();
    rules.forEach((rule, index) => {
      if (seen.has(rule.field)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each rule field can be used once.', path: [index, 'field'] });
      }
      seen.add(rule.field);
    });
  });
export type DynamicGroupRules = z.infer<typeof DynamicGroupRulesSchema>;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** One rule in plain words, for the rule editor summary and the groups list. */
export function describeDynamicRule(rule: DynamicGroupRule): string {
  switch (rule.field) {
    case 'lastAppOpenAt':
      return rule.op === 'withinDays'
        ? `Opened the app in the last ${rule.days} ${plural(rule.days, 'day', 'days')}`
        : `Not opened the app in ${rule.days}+ ${plural(rule.days, 'day', 'days')} (or never)`;
    case 'lastLoginAt':
      return rule.op === 'withinDays'
        ? `Signed in within ${rule.days} ${plural(rule.days, 'day', 'days')}`
        : `Not signed in for ${rule.days}+ ${plural(rule.days, 'day', 'days')} (or never)`;
    case 'createdAt':
      return rule.op === 'withinDays'
        ? `Signed up in the last ${rule.days} ${plural(rule.days, 'day', 'days')}`
        : `Signed up ${rule.days}+ ${plural(rule.days, 'day', 'days')} ago`;
    case 'lastBookingAt':
      return rule.op === 'withinDays'
        ? `Booked in the last ${rule.days} ${plural(rule.days, 'day', 'days')}`
        : `No booking in ${rule.days}+ ${plural(rule.days, 'day', 'days')} (or never)`;
    case 'completedBookings':
      return `${rule.op === 'gte' ? 'At least' : 'At most'} ${rule.value} completed ${plural(rule.value, 'booking', 'bookings')}`;
    case 'totalSpent':
      return `Spent ${rule.op === 'gte' ? 'at least' : 'at most'} EGP ${rule.value.toLocaleString('en-US')}`;
  }
}

/** The whole rule set; no rules means the group is every active mother. */
export function describeDynamicRules(rules: DynamicGroupRules): string {
  if (rules.length === 0) return 'Every active mother';
  return rules.map(describeDynamicRule).join(' AND ');
}

// ── Groups ────────────────────────────────────────────────────

const groupName = z.string().trim().min(1).max(USER_GROUP_NAME_MAX);
const groupDescription = z
  .string()
  .trim()
  .max(USER_GROUP_DESCRIPTION_MAX)
  .nullish()
  .transform((v) => (v ? v : null));

/**
 * Create body (POST /admin/groups). STATIC groups carry no rules (normalised to
 * null); DYNAMIC groups must send a rules array — an empty one means every
 * active mother.
 */
export const UserGroupInputSchema = z
  .object({
    name: groupName,
    description: groupDescription,
    kind: UserGroupKindSchema.default('STATIC'),
    rules: DynamicGroupRulesSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'STATIC' && v.rules != null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only dynamic groups have rules.', path: ['rules'] });
    }
    if (v.kind === 'DYNAMIC' && v.rules == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A dynamic group needs its rules.', path: ['rules'] });
    }
  })
  .transform((v) => ({
    name: v.name,
    description: v.description,
    kind: v.kind,
    rules: v.kind === 'DYNAMIC' ? (v.rules ?? []) : null,
  }));
export type UserGroupInput = z.input<typeof UserGroupInputSchema>;
export type UserGroupValues = z.output<typeof UserGroupInputSchema>;

/** Edit body (PATCH /admin/groups/:id). `kind` is fixed after creation, so it is not accepted. */
export const UserGroupUpdateSchema = z.object({
  name: groupName,
  description: groupDescription,
  /** DYNAMIC only — the service refuses rules on a STATIC group. */
  rules: DynamicGroupRulesSchema.optional(),
});
export type UserGroupUpdateInput = z.input<typeof UserGroupUpdateSchema>;

export const UserGroupSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  kind: UserGroupKindSchema,
  /** DYNAMIC only; null for STATIC. */
  rules: DynamicGroupRulesSchema.nullable(),
  /** STATIC: live member rows. DYNAMIC: mothers matching the rules right now. */
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type UserGroup = z.infer<typeof UserGroupSchema>;

export const UserGroupMembersSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(1000),
});
export type UserGroupMembersInput = z.infer<typeof UserGroupMembersSchema>;

/** POST /admin/groups/rules-preview — how many mothers a rule set matches now. */
export const GroupRulesPreviewInputSchema = z.object({ rules: DynamicGroupRulesSchema });
export type GroupRulesPreviewInput = z.infer<typeof GroupRulesPreviewInputSchema>;

export const GroupRulesPreviewSchema = z.object({ count: z.number().int() });
export type GroupRulesPreview = z.infer<typeof GroupRulesPreviewSchema>;

// ── Mother picker ─────────────────────────────────────────────

/** Bookings, hours and spend count COMPLETED bookings only. */
export const MOTHER_PICKER_SORT_KEYS = [
  'name',
  'completedBookings',
  'hoursBooked',
  'totalSpent',
  'lastBookingAt',
  'createdAt',
  'lastLoginAt',
  'lastAppOpenAt',
] as const;
export const MotherPickerSortKeySchema = z.enum(MOTHER_PICKER_SORT_KEYS);
export type MotherPickerSortKey = z.infer<typeof MotherPickerSortKeySchema>;

export const MotherPickerQuerySchema = AdminListQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  /** Only this group's members — the group detail page's member table. */
  groupId: z.coerce.number().int().positive().optional(),
  /** Leave out this group's members — the group's own "Add mothers" picker. */
  excludeGroupId: z.coerce.number().int().positive().optional(),
  /**
   * Only mothers matching these dynamic-group rules — a dynamic group's
   * read-only member table. Sent as a JSON string in the query.
   */
  rules: z
    .string()
    .optional()
    .transform((raw, ctx): DynamicGroupRules | undefined => {
      if (raw === undefined || raw.trim() === '') return undefined;
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'rules must be a JSON array.' });
        return z.NEVER;
      }
      const parsed = DynamicGroupRulesSchema.safeParse(json);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error.issues[0]?.message ?? 'Invalid rules.' });
        return z.NEVER;
      }
      return parsed.data;
    }),
  sortBy: MotherPickerSortKeySchema.catch('createdAt').default('createdAt'),
  sortDir: AdminSortDirSchema.catch('desc').default('desc'),
});
export type MotherPickerQuery = z.infer<typeof MotherPickerQuerySchema>;

export const MotherPickerRowSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  completedBookings: z.number().int(),
  hoursBooked: z.number(),
  totalSpent: z.number(),
  lastBookingAt: z.string().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  lastAppOpenAt: z.string().nullable(),
});
export type MotherPickerRow = z.infer<typeof MotherPickerRowSchema>;
```

- [ ] **Step 5: Notification type, link and response fields in `packages/shared/src/notifications.ts`**

Append `'announcement'` as the last entry of `NotificationTypeSchema`:

```ts
  'booking_message',
  'survey',
  'announcement',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
```

Insert directly above `export const NotificationResponseSchema`:

```ts
/**
 * Where tapping an announcement takes the mother: buy a package, or book with
 * a promo code applied. Read through the announcement's broadcast.
 */
export const NotificationLinkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('package'), packageId: z.number().int() }),
  z.object({ type: z.literal('promo_code'), code: z.string().min(1) }),
]);
export type NotificationLink = z.infer<typeof NotificationLinkSchema>;
```

Then extend `NotificationResponseSchema` (after `createdAt`):

```ts
export const NotificationResponseSchema = z.object({
  id: z.number().int(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  isRead: z.boolean(),
  referenceId: z.number().int().nullable(),
  referenceType: NotificationReferenceTypeSchema.nullable(),
  createdAt: z.string(),
  /** Announcements only: the broadcast's image. Defaulted so older payloads still parse. */
  imageUrl: z.string().nullable().default(null),
  /** Announcements only: where a tap goes. */
  link: NotificationLinkSchema.nullable().default(null),
});
```

- [ ] **Step 6: The `notifications` section in `packages/shared/src/operator.ts`**

Append the section after `'groups'` in each of the four places:

```ts
// ADMIN_SECTIONS
  'surveys',
  'groups',
  'notifications',
] as const;

// ADMIN_SECTION_LABELS
  groups: 'Groups',
  notifications: 'Notifications',
};

// ADMIN_SECTION_PATHS
  groups: '/groups',
  notifications: '/notifications',
};

// OperatorPermissionsSchema
  groups: AdminAccessLevelSchema.optional(),
  notifications: AdminAccessLevelSchema.optional(),
});
```

(`SECTIONS_COVER_PERMISSIONS` fails to compile if the last one is missed.)

- [ ] **Step 7: Mothers directory fields in `packages/shared/src/admin.ts`**

Add `lastAppOpenAt` as the last field of `AdminMotherSchema`, and replace `AdminMotherListQuerySchema`:

```ts
  /** Number of bookings this mother has placed. */
  bookingCount: z.number().int(),
  createdAt: z.string(),
  /** Last time she opened the app (POST /me/app-open); null if never recorded. */
  lastAppOpenAt: z.string().nullable(),
});
export type AdminMother = z.infer<typeof AdminMotherSchema>;

/** The Mommies directory sorts by the user columns plus her last app open. */
export const AdminMotherSortKeySchema = z.enum([...AdminUserSortKeySchema.options, 'lastAppOpenAt']);
export type AdminMotherSortKey = z.infer<typeof AdminMotherSortKeySchema>;

/**
 * The Mommies tab's "Last app open" filter: opened within 7 / 30 days, not
 * opened in 30 / 90 days (never counts as not opened), or never opened.
 */
export const AdminMotherLastAppOpenFilterSchema = z.enum([
  'ANY',
  'WITHIN_7',
  'WITHIN_30',
  'NOT_30',
  'NOT_90',
  'NEVER',
]);
export type AdminMotherLastAppOpenFilter = z.infer<typeof AdminMotherLastAppOpenFilterSchema>;

/** Paginated mother list query (GET /admin/mothers). A directory, so newest first. */
export const AdminMotherListQuerySchema = AdminUserDirectoryQuerySchema.extend({
  sortBy: AdminMotherSortKeySchema.catch('registered').default('registered'),
  status: AdminApprovalStatusFilterSchema.catch('ALL').default('ALL'),
  lastAppOpen: AdminMotherLastAppOpenFilterSchema.catch('ANY').default('ANY'),
});
export type AdminMotherListQuery = z.infer<typeof AdminMotherListQuerySchema>;
```

- [ ] **Step 8: Export the new file from `packages/shared/src/index.ts`**

Append:

```ts
export * from './notification-template';
```

- [ ] **Step 9: Update the DTO-typed test fixtures in admin and mobile**

These are typed with `UserGroup` / `MotherPickerRow` / `NotificationResponse`, which now have required fields. Make these edits only:

- `apps/admin/src/pages/__tests__/groups-page.test.tsx` L20, `apps/admin/src/pages/__tests__/group-detail-page.test.tsx` L20, `apps/admin/src/features/surveys/__tests__/recipient-picker-modal.test.tsx` L17. In each `UserGroup` literal, change `description: null, memberCount` → `description: null, kind: 'STATIC', rules: null, memberCount`.
- `apps/admin/src/features/groups/__tests__/mother-picker-table.test.tsx` L18, `apps/admin/src/pages/__tests__/group-detail-page.test.tsx` L23, `apps/admin/src/features/surveys/__tests__/recipient-picker-modal.test.tsx` L20. In each `MotherPickerRow` literal, change the line-ending `lastLoginAt: null,` → `lastLoginAt: null, lastAppOpenAt: null,`.
- `apps/mobile/src/screens/parent/__tests__/NotificationsScreen.test.tsx`, `makeNotification`: add `imageUrl: null,` and `link: null,` after `createdAt: new Date().toISOString(),` (before `...overrides`).

(`NotificationRow.test.tsx` casts its fixture with `as NotificationResponse` and needs no change.)

- [ ] **Step 10: Run tests, typecheck and lint**

Run: `pnpm --filter @nanny-app/shared test && pnpm --filter @nanny-app/shared typecheck && pnpm --filter @nanny-app/shared exec eslint src/user-group.ts src/notification-template.ts src/notifications.ts src/operator.ts src/admin.ts src/index.ts src/__tests__/user-group.test.ts src/__tests__/notification-template.test.ts src/__tests__/notifications.test.ts`
Expected: PASS (27 files).

Run: `pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/mobile typecheck && pnpm --filter @nanny-app/admin exec vitest run src/pages/__tests__/groups-page.test.tsx src/pages/__tests__/group-detail-page.test.tsx src/features/groups/__tests__/mother-picker-table.test.tsx src/features/surveys/__tests__/recipient-picker-modal.test.tsx && pnpm --filter @nanny-app/mobile exec jest src/screens/parent/__tests__/NotificationsScreen.test.tsx`
Expected: PASS.

`pnpm --filter @nanny-app/backend typecheck` is expected to fail here, in exactly these places, until Task 2: `admin.routes.ts` (`listAdminMothers` argument), `admin-group.service.ts` (`toDto` missing `kind`, `rules`), `admin-user.service.ts` (`toMotherDto` missing `lastAppOpenAt`), `mother-picker.service.ts` (`ORDER_BY` and row mapping missing `lastAppOpenAt`), `notification.service.ts` (`toNotificationResponse` missing `imageUrl`, `link`). Any other backend error is a mistake in this task.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src apps/admin/src/pages/__tests__/groups-page.test.tsx apps/admin/src/pages/__tests__/group-detail-page.test.tsx apps/admin/src/features/groups/__tests__/mother-picker-table.test.tsx apps/admin/src/features/surveys/__tests__/recipient-picker-modal.test.tsx apps/mobile/src/screens/parent/__tests__/NotificationsScreen.test.tsx
git commit -m "$(cat <<'EOF'
feat(shared): notification template, dynamic group rule and announcement schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---

### Task 2: Prisma models, migration, ANNOUNCEMENT type

> Note: The spec's `NotificationBroadcast` has no `updatedAt`. This plan adds `updatedAt DateTime @updatedAt @map("updated_at")`, because the row is updated after insert (status, counts, `completedAt`). There is still no `deletedAt`: broadcasts are history and are never deleted. This task also patches the four backend mappers that Task 1's DTO fields broke, so the backend compiles again: `admin-group.service.ts` returns `kind`/`rules` (`memberCount` for DYNAMIC stays the member-row count until Task 5), `mother-picker.service.ts` selects and sorts `lastAppOpenAt`, `admin-user.service.ts` returns and sorts by `lastAppOpenAt` (the `lastAppOpen` filter is still Task 5), and `notification.service.ts` returns `imageUrl: null, link: null` (Task 8 fills them in). Do **not** run `prisma format`: it realigns every column in the existing `User` and other models and buries the change in whitespace.

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (`User` L167–257, `Package` L451–473, `PromoCode` L664–692, `enum NotificationType` L1477–1523, `Notification` L1541–1560, `UserGroup` L1718–1734, new block after `UserGroupMember` L1736–1750)
- Create: `apps/backend/prisma/migrations/20261020120000_add_notification_center/migration.sql`
- Modify: `apps/backend/src/services/notification.service.ts` (`toApiNotificationType` L20–74, `toNotificationResponse` L95–115), `apps/backend/src/services/admin-group.service.ts` (imports + `GroupRow`/`toDto` L1–30), `apps/backend/src/services/mother-picker.service.ts` (`ORDER_BY` L12–20, `RawRow` L22–33, SELECT L71, row map L105), `apps/backend/src/services/admin-user.service.ts` (imports L3–20, `motherSelect` L31–52, `toMotherDto` L56–77, `motherOrderBy` L261–276, `listAdminMothers` signature L284–287)
- Test: `apps/backend/src/__tests__/notification-type-map.test.ts` (extend), `apps/backend/src/__tests__/admin-mother.service.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1's `NotificationTypeSchema` (`'announcement'`), `UserGroup` (`kind`, `rules`), `DynamicGroupRulesSchema`, `MotherPickerRow.lastAppOpenAt`, `AdminMother.lastAppOpenAt`, `AdminMotherSortKey`, `AdminMotherListQuery`, `NotificationResponse.imageUrl/link`.
- Produces: Prisma models/enums `UserGroupKind`, `UserGroup.kind/rules`, `NotificationChannel`, `NotificationTemplate`, `NotificationBroadcastStatus`, `NotificationBroadcast`, `Notification.broadcastId` + relation `broadcast`, `NotificationType.ANNOUNCEMENT`, `User.lastAppOpenAt` + `@@index([role, lastAppOpenAt])`, relation names `"NotificationTemplateCreator"`, `"NotificationBroadcastPublisher"`, `Package.notificationTemplates`, `PromoCode.notificationTemplates`. The `NotificationBroadcast` Prisma field for skipped groups is `skippedGroups Int[]` (column `skipped_groups`); the DTO maps it to `skippedGroupIds`. Migration `20261020120000_add_notification_center` includes the backfill `UPDATE users SET last_app_open_at = last_login_at` and the "All mothers" dynamic-group seed. `toApiNotificationType(ANNOUNCEMENT) → 'announcement'`.

- [ ] **Step 1: Write the failing tests**

`apps/backend/src/__tests__/notification-type-map.test.ts`: add this case right after `it('maps SURVEY to survey', …)`:

```ts
  it('maps ANNOUNCEMENT to announcement', () => {
    expect(toApiNotificationType(NotificationType.ANNOUNCEMENT)).toBe('announcement');
  });
```

(The existing `it.each(Object.values(NotificationType)…)` also picks up `ANNOUNCEMENT` once it exists, and fails until the case is mapped.)

`apps/backend/src/__tests__/admin-mother.service.test.ts`:

1. In `makeRow`, after `createdAt: new Date('2026-07-01T00:00:00.000Z'),` add `lastAppOpenAt: null,`.
2. In `it('maps rows to the AdminMother DTO', …)` (its `expect(mothers[0]).toEqual({ … })` ends with `bookingCount: 3,` / `createdAt: '2026-07-01T00:00:00.000Z',`), add `lastAppOpenAt: null,` as the last property.
3. Add a row to the `it.each([...])('sorts by %s %s', …)` table, after the `status` row:

```ts
    // Never-opened mothers last, whichever way.
    ['lastAppOpenAt', 'desc', [{ lastAppOpenAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]],
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/backend test:unit -- notification-type-map admin-mother`
Expected: FAIL. `NotificationType.ANNOUNCEMENT` is undefined, and ts-jest reports `lastAppOpenAt` as not assignable to `AdminUserSortKey` / missing on the DTO.

- [ ] **Step 3: Add the models to `schema.prisma`**

`model User`: replace the `lastLoginAt` line with:

```prisma
  /// Time of her last real sign-in — the Firebase token's `auth_time`, written
  /// by GET /auth/me only when it moves forward (and at registration).
  lastLoginAt          DateTime?             @map("last_login_at")
  /// Last time the app was opened (POST /me/app-open, throttled to once a minute).
  lastAppOpenAt        DateTime?             @map("last_app_open_at")
```

In the same model's relation list, after `userGroupMemberships     UserGroupMember[]`:

```prisma
  notificationTemplatesCreated    NotificationTemplate[]  @relation("NotificationTemplateCreator")
  notificationBroadcastsPublished NotificationBroadcast[] @relation("NotificationBroadcastPublisher")
```

and add the index after `@@index([approvalStatus])`:

```prisma
  @@index([role, lastAppOpenAt])
```

`model Package`: replace the two relation lines with:

```prisma
  purchases             PackagePurchase[]
  campaigns             Campaign[]
  notificationTemplates NotificationTemplate[]
```

`model PromoCode`: replace the three relation lines with:

```prisma
  redemptions           PromoCodeRedemption[]
  bookings              Booking[]
  campaigns             Campaign[]
  notificationTemplates NotificationTemplate[]
```

`enum NotificationType`: add as the last value (after `SURVEY`):

```prisma
  /// An admin published a notification template to the mother (notification center).
  ANNOUNCEMENT
```

`model Notification`: add after `referenceType` and add the index:

```prisma
  /// ANNOUNCEMENT rows only: the publish that wrote this row. Its image and
  /// link are read through it, not copied onto every row.
  broadcastId   Int?                       @map("broadcast_id")
  broadcast     NotificationBroadcast?     @relation(fields: [broadcastId], references: [id])
```

```prisma
  @@index([userId, isRead, createdAt])
  @@index([userId, type])
  @@index([broadcastId])
  @@map("notifications")
```

`model UserGroup`: replace the doc comment and add the enum above it and two fields after `description`:

```prisma
enum UserGroupKind {
  /// Hand-picked members (UserGroupMember rows).
  STATIC
  /// Rules evaluated when something is sent; never has member rows.
  DYNAMIC

  @@map("user_group_kind")
}

/// A list of mothers: hand-picked (STATIC) or rule-based (DYNAMIC). Names are
/// unique among live groups only (checked in the service), so a deleted
/// group's name can be reused. `kind` is fixed after creation.
model UserGroup {
  id          Int               @id @default(autoincrement())
  name        String
  description String?
  kind        UserGroupKind     @default(STATIC)
  /// DYNAMIC only — shaped by DynamicGroupRulesSchema in @nanny-app/shared and
  /// always parsed through it on read. Null for STATIC. An empty array means
  /// "every active mother".
  rules       Json?
  createdById Int               @map("created_by_id")
  // …rest of the model unchanged…
```

After `model UserGroupMember { … }`, add:

```prisma
// ──────────────────────────────────────────────────────────────
// Notification center — see
// docs/superpowers/specs/2026-10-20-admin-notification-center-design.md
// ──────────────────────────────────────────────────────────────

enum NotificationChannel {
  IN_APP
  PUSH
  BOTH

  @@map("notification_channel")
}

enum NotificationBroadcastStatus {
  SENDING
  SENT
  PARTIAL
  FAILED

  @@map("notification_broadcast_status")
}

/// An admin-built notification (content + audience) that can be published any
/// number of times. The link is none, or exactly one of a package / a promo
/// code matching `targetType` (enforced in the shared schema and service).
model NotificationTemplate {
  id          Int                     @id @default(autoincrement())
  /// Internal label, never shown to mothers.
  name        String
  title       String
  body        String                  @db.Text
  imageUrl    String?                 @map("image_url")
  channel     NotificationChannel
  targetType  CampaignTargetType?     @map("target_type")
  packageId   Int?                    @map("package_id")
  package     Package?                @relation(fields: [packageId], references: [id])
  promoCodeId Int?                    @map("promo_code_id")
  promoCode   PromoCode?              @relation(fields: [promoCodeId], references: [id])
  /// Shaped by NotificationAudienceSchema in @nanny-app/shared; always parsed through it on read.
  audience    Json
  createdById Int                     @map("created_by_id")
  createdBy   User                    @relation("NotificationTemplateCreator", fields: [createdById], references: [id])
  broadcasts  NotificationBroadcast[]
  createdAt   DateTime                @default(now()) @map("created_at")
  updatedAt   DateTime                @updatedAt @map("updated_at")
  deletedAt   DateTime?               @map("deleted_at")

  @@index([deletedAt])
  @@map("notification_templates")
}

/// One publish of a template: a snapshot of its content and audience, plus the
/// delivery counts. History — never edited after it completes, never deleted.
model NotificationBroadcast {
  id            Int                         @id @default(autoincrement())
  templateId    Int                         @map("template_id")
  template      NotificationTemplate        @relation(fields: [templateId], references: [id])
  title         String
  body          String                      @db.Text
  imageUrl      String?                     @map("image_url")
  channel       NotificationChannel
  targetType    CampaignTargetType?         @map("target_type")
  packageId     Int?                        @map("package_id")
  promoCodeId   Int?                        @map("promo_code_id")
  /// The code string at publish, so a tap needs no lookup.
  promoCodeText String?                     @map("promo_code_text")
  audience      Json
  status        NotificationBroadcastStatus @default(SENDING)
  targeted      Int                         @default(0)
  inAppCreated  Int                         @default(0) @map("in_app_created")
  pushSent      Int                         @default(0) @map("push_sent")
  pushFailed    Int                         @default(0) @map("push_failed")
  noDevice      Int                         @default(0) @map("no_device")
  /// Groups deleted between saving the template and publishing it.
  skippedGroups Int[]                       @default([]) @map("skipped_groups")
  error         String?                     @db.Text
  publishedById Int                         @map("published_by_id")
  publishedBy   User                        @relation("NotificationBroadcastPublisher", fields: [publishedById], references: [id])
  notifications Notification[]
  createdAt     DateTime                    @default(now()) @map("created_at")
  updatedAt     DateTime                    @updatedAt @map("updated_at")
  completedAt   DateTime?                   @map("completed_at")

  @@index([templateId, createdAt])
  @@index([status, createdAt])
  @@map("notification_broadcasts")
}
```

- [ ] **Step 4: Generate and complete the migration**

Start the dev database: `docker compose up -d` (repo root; PostGIS on 5432). Then:

```bash
pnpm --filter @nanny-app/backend exec prisma migrate dev --create-only --name add_notification_center
mv apps/backend/prisma/migrations/*_add_notification_center apps/backend/prisma/migrations/20261020120000_add_notification_center
```

Compare the generated `migration.sql` with the block below. The generated part must match statement for statement: 3 `CREATE TYPE`, 1 `ALTER TYPE … ADD VALUE`, 3 `ALTER TABLE … ADD COLUMN`, 2 `CREATE TABLE`, 5 `CREATE INDEX`, 6 foreign keys. Nothing may drop or rewrite an existing column. Then append the two hand-written sections at the end (the backfill and the seed). The complete file is:

```sql
-- CreateEnum
CREATE TYPE "user_group_kind" AS ENUM ('STATIC', 'DYNAMIC');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'PUSH', 'BOTH');

-- CreateEnum
CREATE TYPE "notification_broadcast_status" AS ENUM ('SENDING', 'SENT', 'PARTIAL', 'FAILED');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'ANNOUNCEMENT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_app_open_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "broadcast_id" INTEGER;

-- AlterTable
ALTER TABLE "user_groups" ADD COLUMN     "kind" "user_group_kind" NOT NULL DEFAULT 'STATIC',
ADD COLUMN     "rules" JSONB;

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "channel" "notification_channel" NOT NULL,
    "target_type" "campaign_target_type",
    "package_id" INTEGER,
    "promo_code_id" INTEGER,
    "audience" JSONB NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_broadcasts" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "channel" "notification_channel" NOT NULL,
    "target_type" "campaign_target_type",
    "package_id" INTEGER,
    "promo_code_id" INTEGER,
    "promo_code_text" TEXT,
    "audience" JSONB NOT NULL,
    "status" "notification_broadcast_status" NOT NULL DEFAULT 'SENDING',
    "targeted" INTEGER NOT NULL DEFAULT 0,
    "in_app_created" INTEGER NOT NULL DEFAULT 0,
    "push_sent" INTEGER NOT NULL DEFAULT 0,
    "push_failed" INTEGER NOT NULL DEFAULT 0,
    "no_device" INTEGER NOT NULL DEFAULT 0,
    "skipped_groups" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "error" TEXT,
    "published_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "notification_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_templates_deleted_at_idx" ON "notification_templates"("deleted_at");

-- CreateIndex
CREATE INDEX "notification_broadcasts_template_id_created_at_idx" ON "notification_broadcasts"("template_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_broadcasts_status_created_at_idx" ON "notification_broadcasts"("status", "created_at");

-- CreateIndex
CREATE INDEX "users_role_last_app_open_at_idx" ON "users"("role", "last_app_open_at");

-- CreateIndex
CREATE INDEX "notifications_broadcast_id_idx" ON "notifications"("broadcast_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "notification_broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_broadcasts" ADD CONSTRAINT "notification_broadcasts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_broadcasts" ADD CONSTRAINT "notification_broadcasts_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: until the new app build ships, the last sign-in is the best
-- available signal of when she last opened the app — without it every
-- existing mother would read as "never opened".
UPDATE users SET last_app_open_at = last_login_at;

-- Seed: "All mothers" is a dynamic group with no rules, created by the first
-- superuser (else the first admin). Inserts nothing on a database with no admin.
INSERT INTO user_groups (name, description, kind, rules, created_by_id, created_at, updated_at)
SELECT 'All mothers', 'Every active mother', 'DYNAMIC', '[]'::jsonb, id, now(), now()
FROM users
WHERE role IN ('SUPERUSER','ADMIN') AND deleted_at IS NULL
ORDER BY (role = 'SUPERUSER') DESC, id
LIMIT 1;
```

`ALTER TYPE … ADD VALUE` runs inside the migration's transaction, which Postgres allows as long as the new value is not used in that same transaction (nothing here uses `ANNOUNCEMENT`). The seed relies on `user_group_kind` being created earlier in this same file, which is allowed. On an empty database (the integration test DB, a fresh dev DB) the `INSERT … SELECT` matches no admin and inserts nothing.

Apply it and regenerate the client:

```bash
pnpm --filter @nanny-app/backend db:migrate:dev
pnpm --filter @nanny-app/backend db:generate
```

Expected: `Applied migration 20261020120000_add_notification_center`; `prisma migrate dev` reports no drift. Check the seed against the dev DB:
`docker exec nannyapp-db psql -U postgres -d nannyapp -c "SELECT name, kind, rules FROM user_groups WHERE name = 'All mothers'"` returns one row `All mothers | DYNAMIC | []` when the dev DB has an admin, and none otherwise.

- [ ] **Step 5: Map the type and patch the DTO builders**

`apps/backend/src/services/notification.service.ts`. In `toApiNotificationType`, add before `default:`:

```ts
    case 'ANNOUNCEMENT':
      return 'announcement';
```

In `toNotificationResponse`, add after `createdAt: row.createdAt.toISOString(),`:

```ts
    // Announcement image and link come through the broadcast (Task 8).
    imageUrl: null,
    link: null,
```

`apps/backend/src/services/admin-group.service.ts`. Replace the imports and `GroupRow`/`toDto`:

```ts
import { Role, type Prisma, type UserGroupKind } from '@prisma/client';

import type { DynamicGroupRules, UserGroup, UserGroupInput } from '@nanny-app/shared';
import { DynamicGroupRulesSchema, UserGroupInputSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

const withMemberCount = {
  _count: { select: { members: { where: { deletedAt: null } } } },
} as const;

type GroupRow = {
  id: number;
  name: string;
  description: string | null;
  kind: UserGroupKind;
  rules: Prisma.JsonValue;
  createdAt: Date;
  _count: { members: number };
};

/** A DYNAMIC group's stored rules, always parsed through the shared schema; null for STATIC. */
function rulesOf(row: Pick<GroupRow, 'kind' | 'rules'>): DynamicGroupRules | null {
  return row.kind === 'DYNAMIC' ? DynamicGroupRulesSchema.parse(row.rules ?? []) : null;
}

function toDto(row: GroupRow): UserGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    rules: rulesOf(row),
    memberCount: row._count.members,
    createdAt: row.createdAt.toISOString(),
  };
}
```

(The rest of the file is unchanged. `createUserGroup` keeps writing only `name`/`description`, so new groups stay `STATIC` until Task 5.)

`apps/backend/src/services/mother-picker.service.ts`:

```ts
const ORDER_BY: Record<MotherPickerSortKey, Prisma.Sql> = {
  name: Prisma.sql`lower(u.first_name || ' ' || u.last_name)`,
  completedBookings: Prisma.sql`completed_bookings`,
  hoursBooked: Prisma.sql`hours_booked`,
  totalSpent: Prisma.sql`total_spent`,
  lastBookingAt: Prisma.sql`last_booking_at`,
  createdAt: Prisma.sql`u.created_at`,
  lastLoginAt: Prisma.sql`u.last_login_at`,
  lastAppOpenAt: Prisma.sql`u.last_app_open_at`,
};
```

In `RawRow`, add `last_app_open_at: Date | null;` after `last_login_at`. Change the SELECT's first line to

```ts
      SELECT u.id, u.first_name, u.last_name, u.phone, u.created_at, u.last_login_at, u.last_app_open_at,
```

and add to the row mapping, after `lastLoginAt`:

```ts
      lastAppOpenAt: r.last_app_open_at ? r.last_app_open_at.toISOString() : null,
```

`apps/backend/src/services/admin-user.service.ts`. In the `@nanny-app/shared` type import, remove `AdminUserDirectoryQuery` and `AdminUserSortKey` and add `AdminMotherListQuery` and `AdminMotherSortKey`. Add `lastAppOpenAt: true,` to `motherSelect` after `createdAt: true,`, and add to `toMotherDto` after `createdAt`:

```ts
    lastAppOpenAt: row.lastAppOpenAt?.toISOString() ?? null,
```

Then replace `motherOrderBy` and the `listAdminMothers` signature:

```ts
/** Column sort → Prisma order for the Mommies directory. */
function motherOrderBy(
  sortBy: AdminMotherSortKey,
  sortDir: AdminSortDir,
): Prisma.UserOrderByWithRelationInput[] {
  const orders: Record<AdminMotherSortKey, Prisma.UserOrderByWithRelationInput[]> = {
    // The ID column: the id tiebreak below is the whole order.
    id: [],
    name: [{ firstName: sortDir }, { lastName: sortDir }],
    email: [{ email: sortDir }],
    registered: [{ createdAt: sortDir }],
    // Her column reads "Active" / "Deactivated", so ascending puts Active first.
    status: [{ isActive: sortDir === 'asc' ? 'desc' : 'asc' }],
    // Never-opened mothers sort last either way.
    lastAppOpenAt: [{ lastAppOpenAt: { sort: sortDir, nulls: 'last' } }],
  };
  // The id tiebreak keeps equal rows in a fixed order, so pages never overlap.
  return [...orders[sortBy], { id: sortDir }];
}
```

```ts
export async function listAdminMothers(
  status: AdminApprovalStatusFilter,
  { page, limit, sortBy, sortDir }: Pick<AdminMotherListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir'>,
): Promise<{ mothers: AdminMother[]; meta: PaginationMeta }> {
```

(`GET /admin/mothers` in `admin.routes.ts` passes `{ status, ...query }` unchanged. `query` now also carries `lastAppOpen`, which Task 5 starts reading.)

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @nanny-app/backend typecheck && pnpm --filter @nanny-app/backend test:unit -- notification-type-map admin-mother`
Expected: typecheck clean (including Task 1's expected errors, now gone); both suites PASS.

Then check that the existing group, picker and survey journeys still pass against the new schema. The test stack's `globalSetup` runs `prisma migrate deploy`, so the new migration is applied to `nannyapp_test`. If the stack is not running, start it first: `mkdir -p ~/logs; tmux new -d -s nanny-testenv "pnpm test:env 2>&1 | tee ~/logs/nanny-testenv.log"`, then wait for the log to show the services up. Then:

```bash
mkdir -p ~/logs; tmux new -d -s nanny-task2 "pnpm --filter @nanny-app/backend test:integration -- 'a35|a36|a38' 2>&1 | tee ~/logs/nanny-task2.log"
```

Check with `tail -40 ~/logs/nanny-task2.log`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/20261020120000_add_notification_center apps/backend/src/services/notification.service.ts apps/backend/src/services/admin-group.service.ts apps/backend/src/services/mother-picker.service.ts apps/backend/src/services/admin-user.service.ts apps/backend/src/__tests__/notification-type-map.test.ts apps/backend/src/__tests__/admin-mother.service.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): notification center tables, group kind/rules, last app open, ANNOUNCEMENT type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---

### Task 3: Last login = real sign-in; last app open ping (backend)

> Note: There is no `/me` router today. `src/routes/index.ts` mounts only `/auth/me`, under `authRouter`. This task creates `src/routes/me.routes.ts` and mounts it at `/me`. Routes call exactly one service function, so `app-open.service.ts` exports `recordMyAppOpen(decoded)` next to the contract's `recordAppOpen(userId)`. It resolves the live row from the token's uid (401 if there is none, the same as `device.service`'s `getUserByUid`) and then calls `recordAppOpen`. `getMe` writes nothing when the token has no numeric `auth_time`, so the existing `auth-register-address` / `auth-reattach` tests, whose decoded tokens carry none, keep passing unchanged.

**Files:**
- Modify: `apps/backend/src/services/auth.service.ts` (`getMe` L500–515)
- Create: `apps/backend/src/services/app-open.service.ts`, `apps/backend/src/routes/me.routes.ts`
- Modify: `apps/backend/src/routes/index.ts`
- Test: `apps/backend/src/__tests__/auth-last-login.test.ts`, `apps/backend/src/__integration__/journeys/a44-app-open-and-login.test.ts`

**Interfaces:**
- Consumes: Task 2's `User.lastAppOpenAt` column / Prisma field.
- Produces:
  - `getMe(decoded)` writes `lastLoginAt = new Date(decoded.auth_time * 1000)` only when that is later than the stored value (no write otherwise).
  - `recordAppOpen(userId: number): Promise<void>` in `src/services/app-open.service.ts` (a single conditional `UPDATE … WHERE last_app_open_at IS NULL OR last_app_open_at < now() - interval '60 seconds'`); also `recordMyAppOpen(decoded: DecodedIdToken): Promise<void>`.
  - Route `POST /me/app-open` (`requireAuth`, resolves the app user from the token) → 204, no body. `meRouter` is exported from `src/routes/me.routes.ts` and mounted at `/me` in `src/routes/index.ts`.

- [ ] **Step 1: Write the failing unit test**

`apps/backend/src/__tests__/auth-last-login.test.ts` (mocks set up the same way as `auth-register-address.test.ts` / `auth-reattach.test.ts`):

```ts
/**
 * `lastLoginAt` is the time of her last real sign-in: GET /auth/me writes the
 * token's `auth_time`, and only when it is later than what is stored. A
 * refetch from an old session (a token refreshed from a sign-in we already
 * recorded) writes nothing, and nothing ever moves it backwards. App opens
 * are recorded elsewhere (POST /me/app-open).
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    address: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { getUser: jest.fn() },
}));

jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));

import { Role } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { getMe } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
};

// 2026-10-20T10:00:00.000Z in seconds, as Firebase puts it in the token.
const AUTH_TIME = Date.UTC(2026, 9, 20, 10, 0, 0) / 1000;
const SIGNED_IN = new Date(AUTH_TIME * 1000);

function decoded(authTime?: number) {
  return { uid: 'fb-1', ...(authTime === undefined ? {} : { auth_time: authTime }) } as never;
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 55,
    firebaseUid: 'fb-1',
    email: 'layla@example.com',
    phone: '+201004455667',
    firstName: 'Layla',
    lastName: 'Mostafa',
    dateOfBirth: null,
    avatarUrl: null,
    role: Role.MOTHER,
    isEmailVerified: true,
    isPhoneVerified: true,
    approvalStatus: 'APPROVED',
    idDocumentType: null,
    rejectionReason: null,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(userRow(data)),
  );
});

describe('getMe — lastLoginAt is the last real sign-in', () => {
  it('writes auth_time when nothing is stored yet', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: null }));

    await getMe(decoded(AUTH_TIME));

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 55 }, data: { lastLoginAt: SIGNED_IN } });
  });

  it('moves it forward to a newer sign-in', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: new Date(SIGNED_IN.getTime() - 86_400_000) }));

    await getMe(decoded(AUTH_TIME));

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 55 }, data: { lastLoginAt: SIGNED_IN } });
  });

  it('writes nothing when the token is from the sign-in already recorded', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: SIGNED_IN }));

    await getMe(decoded(AUTH_TIME));

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('never moves it backwards for a token from an older session', async () => {
    const later = new Date(SIGNED_IN.getTime() + 3_600_000);
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: later }));

    const me = await getMe(decoded(AUTH_TIME));

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(me.id).toBe(55);
  });

  it('writes nothing when the token carries no auth_time', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: null }));

    await getMe(decoded());

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing integration journey**

`apps/backend/src/__integration__/journeys/a44-app-open-and-login.test.ts`:

```ts
/**
 * A44 — last app open and last real sign-in, recorded separately.
 * `POST /me/app-open` stamps `lastAppOpenAt`, at most once a minute however
 * often the app pings; `GET /auth/me` stamps `lastLoginAt` with the token's
 * sign-in time (`auth_time`) and never moves it backwards.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother } from '../../../test/factories';

function ping(token: string) {
  return request(app).post('/me/app-open').set(...authHeader(token));
}

async function lastAppOpenAt(userId: number): Promise<Date | null> {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lastAppOpenAt: true } });
  return row.lastAppOpenAt;
}

/** The `auth_time` claim of an ID token, as a Date. */
function authTimeOf(token: string): Date {
  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    auth_time: number;
  };
  return new Date(payload.auth_time * 1000);
}

describe('A44 — POST /me/app-open', () => {
  it('records the open and answers 204 with no body', async () => {
    const mother = await makeMother();
    expect(await lastAppOpenAt(mother.id)).toBeNull();

    const before = Date.now();
    const res = await ping(mother.token);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const stamped = await lastAppOpenAt(mother.id);
    expect(stamped).not.toBeNull();
    // Database clock vs. test clock: allow a little skew either way.
    expect(Math.abs((stamped as Date).getTime() - before)).toBeLessThan(10_000);
  });

  it('leaves the time alone for a second ping within 60 seconds', async () => {
    const mother = await makeMother();
    expect((await ping(mother.token)).status).toBe(204);
    const first = await lastAppOpenAt(mother.id);

    expect((await ping(mother.token)).status).toBe(204);

    expect(await lastAppOpenAt(mother.id)).toEqual(first);
  });

  it('moves the time on once the last open is over a minute old', async () => {
    const twoMinutesAgo = new Date(Date.now() - 120_000);
    const mother = await makeMother({ lastAppOpenAt: twoMinutesAgo });

    expect((await ping(mother.token)).status).toBe(204);

    const stamped = await lastAppOpenAt(mother.id);
    expect((stamped as Date).getTime()).toBeGreaterThan(twoMinutesAgo.getTime());
  });

  it('refuses a request without a token', async () => {
    const res = await request(app).post('/me/app-open');
    expect(res.status).toBe(401);
  });
});

describe('A44 — GET /auth/me records the real sign-in', () => {
  it("writes the token's auth_time as lastLoginAt", async () => {
    const mother = await makeMother();

    expect((await request(app).get('/auth/me').set(...authHeader(mother.token))).status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id }, select: { lastLoginAt: true } });
    expect(row.lastLoginAt).toEqual(authTimeOf(mother.token));
  });

  it('never moves lastLoginAt backwards, and does not touch lastAppOpenAt', async () => {
    const later = new Date(Date.now() + 3_600_000);
    const mother = await makeMother({ lastLoginAt: later });

    expect((await request(app).get('/auth/me').set(...authHeader(mother.token))).status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: mother.id },
      select: { lastLoginAt: true, lastAppOpenAt: true },
    });
    expect(row.lastLoginAt).toEqual(later);
    expect(row.lastAppOpenAt).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/backend test:unit -- auth-last-login`
Expected: FAIL. The first two cases see `data: { lastLoginAt: <now> }` instead of the token's time, and the last three see `update` called when it should not be.

Integration, in tmux. Start the test stack first if it is not running (`tmux new -d -s nanny-testenv "pnpm test:env 2>&1 | tee ~/logs/nanny-testenv.log"`):

```bash
mkdir -p ~/logs; tmux new -d -s nanny-a44 "pnpm --filter @nanny-app/backend test:integration -- a44 2>&1 | tee ~/logs/nanny-a44.log"
```

Check with `tail -40 ~/logs/nanny-a44.log`. Expected: FAIL. `POST /me/app-open` answers 404 (no route); `GET /auth/me` writes `now()`, not `auth_time`, and `toEqual(authTimeOf(token))` fails; the "never backwards" case sees `later` overwritten.

- [ ] **Step 4: Implement `getMe` in `apps/backend/src/services/auth.service.ts`**

Replace the doc comment and body of `getMe` (keep `requireUser`, `toUserResponse`, `flatLocationOf` as they are):

```ts
/**
 * When the token's session began — its `auth_time` (seconds since the epoch),
 * which Firebase sets at the real sign-in and carries unchanged through every
 * refreshed ID token. Null when the claim is missing or not a number.
 */
function signedInAt(decoded: DecodedIdToken): Date | null {
  const authTime: unknown = decoded.auth_time;
  return typeof authTime === 'number' && Number.isFinite(authTime) ? new Date(authTime * 1000) : null;
}

/**
 * Returns the application User row for the currently-authenticated Firebase
 * user. Records `lastLoginAt` as the time of her last real sign-in (the
 * token's `auth_time`), only ever moving it forward — a refetch from an old
 * session writes nothing. App opens are recorded separately (POST /me/app-open).
 * Throws 404 if the Firebase user has no corresponding application row —
 * the mobile client uses this signal to resume the registration wizard.
 */
export async function getMe(decoded: DecodedIdToken): Promise<UserResponse> {
  let user = await requireUser(decoded);

  const signedIn = signedInAt(decoded);
  if (signedIn && (!user.lastLoginAt || signedIn > user.lastLoginAt)) {
    // Awaited, so a failure here fails the request like any other DB error.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: signedIn },
    });
  }

  return toUserResponse(user, await flatLocationOf(user.id));
}
```

(`registerUser` keeps `lastLoginAt: new Date()`: registration is a real sign-in.)

- [ ] **Step 5: Create `apps/backend/src/services/app-open.service.ts`**

```ts
import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';

/**
 * Records that the user opened the app. One conditional UPDATE: a ping within
 * 60 seconds of the stored time writes nothing, so a burst of foreground
 * events from one device costs one row write a minute at most. `now()` is the
 * database clock, the same one the condition compares against.
 */
export async function recordAppOpen(userId: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE users SET last_app_open_at = now()
    WHERE id = ${userId}
      AND (last_app_open_at IS NULL OR last_app_open_at < now() - interval '60 seconds')`;
}

/** POST /me/app-open — resolves the signed-in user's row, then records the open. */
export async function recordMyAppOpen(decoded: DecodedIdToken): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { firebaseUid: decoded.uid, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw errors.unauthorized();
  await recordAppOpen(user.id);
}
```

- [ ] **Step 6: Create `apps/backend/src/routes/me.routes.ts` and mount it**

```ts
import { Router, type NextFunction, type Request, type Response } from 'express';

import { errors } from '@backend/lib/errors';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { recordMyAppOpen } from '@backend/services/app-open.service';

/** The signed-in user's own activity signals. */
export const meRouter = Router();

/**
 * POST /me/app-open
 * The app calls this on cold start and whenever it returns to the foreground
 * (throttled to once per 5 minutes on the device). 204, no body.
 */
meRouter.post('/app-open', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    await recordMyAppOpen(req.firebaseUser);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
```

`apps/backend/src/routes/index.ts`: add the import after `legalRouter`'s, and the mount after `/legal`:

```ts
import { legalRouter } from './legal.routes';
import { meRouter } from './me.routes';
```

```ts
apiRouter.use('/legal', legalRouter);
apiRouter.use('/me', meRouter);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @nanny-app/backend typecheck && pnpm --filter @nanny-app/backend test:unit -- auth-`
Expected: PASS. That covers the new `auth-last-login` and every existing `auth-*` suite: `auth-register-address`'s and `auth-reattach`'s `getMe` cases pass tokens without `auth_time` and still pass.

Run: `pnpm --filter @nanny-app/backend exec eslint src/services/auth.service.ts src/services/app-open.service.ts src/routes/me.routes.ts src/routes/index.ts src/__tests__/auth-last-login.test.ts src/__integration__/journeys/a44-app-open-and-login.test.ts`
Expected: clean.

Integration (tmux, stack running):

```bash
tmux kill-session -t nanny-a44 2>/dev/null; tmux new -d -s nanny-a44 "pnpm --filter @nanny-app/backend test:integration -- a44 2>&1 | tee ~/logs/nanny-a44.log"
```

Check with `tail -40 ~/logs/nanny-a44.log`. Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/services/auth.service.ts apps/backend/src/services/app-open.service.ts apps/backend/src/routes/me.routes.ts apps/backend/src/routes/index.ts apps/backend/src/__tests__/auth-last-login.test.ts apps/backend/src/__integration__/journeys/a44-app-open-and-login.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): lastLoginAt from auth_time, POST /me/app-open records last app open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---

### Task 4: Dynamic rule SQL and the shared group resolver (backend)

> Note: the contract describes the stats join as grouping by "parent_id/user column"; the real column is `bookings.mother_id`, and the fragment below is the `mother-picker.service.ts` subquery moved verbatim. The picker's count query now also carries the join (a 1:1 LEFT JOIN, so the count is unchanged) because Task 5's `rules` filter can reference `b.*`.
> Note: Task 2 Step 5 already taught the picker the `lastAppOpenAt` sort key, column and row field. The file in Step 8 below is that post-Task-2 file with only this task's changes (shared base filter, shared stats join, join in the count query). Task 5 adds the `rules` filter and the tests for `lastAppOpenAt`.

**Files:**
- Create: `apps/backend/src/lib/group-rules-sql.ts`
- Create: `apps/backend/src/services/group-audience.service.ts`
- Modify: `apps/backend/src/services/mother-picker.service.ts`, `apps/backend/src/services/survey-audience.service.ts`
- Test: `apps/backend/src/__tests__/group-rules-sql.test.ts`, `apps/backend/src/__integration__/journeys/a45-dynamic-groups.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `src/lib/group-rules-sql.ts`: `RECEIVABLE_MOTHER_SQL: Prisma.Sql` (`u.role = 'MOTHER' AND u.deleted_at IS NULL AND u.is_active`); `COMPLETED_BOOKING_STATS_JOIN: Prisma.Sql` (the `LEFT JOIN (SELECT parent_id/user column, count(*) completed_bookings, sum(duration_hours) hours_booked, sum(total_amount) total_spent, max(start_time) last_booking_at FROM bookings WHERE status='COMPLETED' AND deleted_at IS NULL GROUP BY …) b ON …` — extracted verbatim from `mother-picker.service.ts`); `ruleToSql(rule: DynamicGroupRule): Prisma.Sql`; `rulesToSql(rules: DynamicGroupRules): Prisma.Sql` (`TRUE` when empty, else AND-joined).
  - `mother-picker.service.ts` switched to use those (behaviour unchanged).
  - `src/services/group-audience.service.ts`: `resolveGroupMembers(groupIds: number[]): Promise<{ userIds: number[]; skippedGroupIds: number[] }>` (sorted asc, deduped, base filter applied to static members too); `countDynamicGroupMembers(rules: DynamicGroupRules): Promise<number>`.
  - `survey-audience.service.ts`: group branch uses `resolveGroupMembers`; still throws `badRequest('One of the chosen groups no longer exists.')` when `skippedGroupIds.length > 0`.

Group code must not import survey- or notification-specific code (Global Constraints). Both new files import only Prisma, `@nanny-app/shared` group types and `db/prisma`.

Start the test stack first if it is not running (from the repo root): `mkdir -p ~/logs; tmux new -d -s nanny-testenv "pnpm test:env 2>&1 | tee ~/logs/nanny-testenv.log"`, and wait until `~/logs/nanny-testenv.log` shows the Auth emulator and the Paymob fake listening.

- [ ] **Step 1: Write the failing unit test for the rule SQL**

`apps/backend/src/__tests__/group-rules-sql.test.ts`:

```ts
/**
 * The rule → SQL builder behind dynamic groups, the mother picker's `rules`
 * filter and the notification audience. Asserted on the SQL text and the bound
 * values so a refactor can't quietly change what a rule means — in particular
 * that `notWithinDays` keeps the never-set (NULL) mothers in, and that the
 * booking metrics treat "no completed booking" as zero.
 */
import type { DynamicGroupRule } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import {
  COMPLETED_BOOKING_STATS_JOIN,
  RECEIVABLE_MOTHER_SQL,
  ruleToSql,
  rulesToSql,
} from '@backend/lib/group-rules-sql';

/** The statement with `?` placeholders, whitespace collapsed. */
const text = (sql: Prisma.Sql): string => sql.sql.replace(/\s+/g, ' ').trim();

const CUTOFF = 'now() - make_interval(days => ?::int)';

describe('ruleToSql', () => {
  it.each<[string, DynamicGroupRule, string, unknown[]]>([
    [
      'opened the app recently',
      { field: 'lastAppOpenAt', op: 'withinDays', days: 7 },
      `u.last_app_open_at >= ${CUTOFF}`,
      [7],
    ],
    [
      'signed in recently',
      { field: 'lastLoginAt', op: 'withinDays', days: 14 },
      `u.last_login_at >= ${CUTOFF}`,
      [14],
    ],
    [
      'signed up recently',
      { field: 'createdAt', op: 'withinDays', days: 7 },
      `u.created_at >= ${CUTOFF}`,
      [7],
    ],
    [
      'booked recently',
      { field: 'lastBookingAt', op: 'withinDays', days: 30 },
      `b.last_booking_at >= ${CUTOFF}`,
      [30],
    ],
    [
      'signed up long ago',
      { field: 'createdAt', op: 'notWithinDays', days: 90 },
      `(u.created_at IS NULL OR u.created_at < ${CUTOFF})`,
      [90],
    ],
    [
      'at least N completed bookings',
      { field: 'completedBookings', op: 'gte', value: 3 },
      'coalesce(b.completed_bookings, 0) >= ?',
      [3],
    ],
    [
      'at most N completed bookings',
      { field: 'completedBookings', op: 'lte', value: 0 },
      'coalesce(b.completed_bookings, 0) <= ?',
      [0],
    ],
    [
      'spent at least',
      { field: 'totalSpent', op: 'gte', value: 1000 },
      'coalesce(b.total_spent, 0) >= ?',
      [1000],
    ],
    [
      'spent at most',
      { field: 'totalSpent', op: 'lte', value: 500 },
      'coalesce(b.total_spent, 0) <= ?',
      [500],
    ],
  ])('%s', (_label, rule, sql, values) => {
    const built = ruleToSql(rule);
    expect(text(built)).toBe(sql);
    expect(built.values).toEqual(values);
  });

  // Review focus 4: a mother who never opened the app since tracking began, or
  // never booked, must still match "not opened in 30 days" / "no booking in 60 days".
  it.each<[DynamicGroupRule, string, number]>([
    [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }, 'u.last_app_open_at', 30],
    [{ field: 'lastLoginAt', op: 'notWithinDays', days: 60 }, 'u.last_login_at', 60],
    [{ field: 'lastBookingAt', op: 'notWithinDays', days: 60 }, 'b.last_booking_at', 60],
  ])('notWithinDays matches NULL (%j)', (rule, column, days) => {
    const built = ruleToSql(rule);
    expect(text(built)).toBe(`(${column} IS NULL OR ${column} < ${CUTOFF})`);
    expect(built.values).toEqual([days]);
  });
});

describe('rulesToSql', () => {
  it('is TRUE for no rules — every active mother', () => {
    const built = rulesToSql([]);
    expect(text(built)).toBe('TRUE');
    expect(built.values).toEqual([]);
  });

  it('ANDs each rule in its own parentheses, values in order', () => {
    const built = rulesToSql([
      { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
      { field: 'completedBookings', op: 'gte', value: 1 },
    ]);
    expect(text(built)).toBe(
      `((u.last_app_open_at IS NULL OR u.last_app_open_at < ${CUTOFF})) AND (coalesce(b.completed_bookings, 0) >= ?)`,
    );
    expect(built.values).toEqual([30, 1]);
  });
});

describe('shared fragments', () => {
  it('limits recipients to active, non-deleted mothers', () => {
    expect(text(RECEIVABLE_MOTHER_SQL)).toBe("u.role = 'MOTHER' AND u.deleted_at IS NULL AND u.is_active");
    expect(RECEIVABLE_MOTHER_SQL.values).toEqual([]);
  });

  it('aggregates COMPLETED, non-deleted bookings per mother', () => {
    const join = text(COMPLETED_BOOKING_STATS_JOIN);
    expect(join).toMatch(/^LEFT JOIN \(/);
    expect(join).toContain("WHERE status = 'COMPLETED' AND deleted_at IS NULL");
    expect(join).toContain('GROUP BY mother_id');
    expect(join).toContain('count(*) AS completed_bookings');
    expect(join).toContain('sum(total_amount) AS total_spent');
    expect(join).toContain('max(start_time) AS last_booking_at');
    expect(join).toMatch(/\) b ON b\.mother_id = u\.id$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/backend test:unit -- group-rules-sql`
Expected: FAIL — `Cannot find module '@backend/lib/group-rules-sql'`.

- [ ] **Step 3: Implement `apps/backend/src/lib/group-rules-sql.ts`**

```ts
import { Prisma } from '@prisma/client';

import type {
  DYNAMIC_RULE_DATE_FIELDS,
  DYNAMIC_RULE_NUMBER_FIELDS,
  DynamicGroupRule,
  DynamicGroupRules,
} from '@nanny-app/shared';

// ──────────────────────────────────────────────────────────────
// SQL for dynamic groups. Every fragment expects `users` aliased `u` and, for
// the booking metrics, COMPLETED_BOOKING_STATS_JOIN aliased `b` in the FROM.
// One builder, used by the group resolver, the dynamic member count and the
// mother picker's `rules` filter, so a rule means the same thing everywhere.
// ──────────────────────────────────────────────────────────────

type DateField = (typeof DYNAMIC_RULE_DATE_FIELDS)[number];
type NumberField = (typeof DYNAMIC_RULE_NUMBER_FIELDS)[number];

/** Who can receive anything: an active, non-deleted mother. Nannies never match. */
export const RECEIVABLE_MOTHER_SQL = Prisma.sql`u.role = 'MOTHER' AND u.deleted_at IS NULL AND u.is_active`;

/**
 * Per-mother booking metrics over COMPLETED, non-deleted bookings only. LEFT
 * JOIN, so a mother with none has NULLs here — the rules coalesce them to 0.
 */
export const COMPLETED_BOOKING_STATS_JOIN = Prisma.sql`LEFT JOIN (
  SELECT mother_id,
         count(*) AS completed_bookings,
         sum(duration_hours) AS hours_booked,
         sum(total_amount) AS total_spent,
         max(start_time) AS last_booking_at
  FROM bookings
  WHERE status = 'COMPLETED' AND deleted_at IS NULL
  GROUP BY mother_id
) b ON b.mother_id = u.id`;

const DATE_COLUMNS: Record<DateField, Prisma.Sql> = {
  lastAppOpenAt: Prisma.sql`u.last_app_open_at`,
  lastLoginAt: Prisma.sql`u.last_login_at`,
  createdAt: Prisma.sql`u.created_at`,
  lastBookingAt: Prisma.sql`b.last_booking_at`,
};

const NUMBER_COLUMNS: Record<NumberField, Prisma.Sql> = {
  completedBookings: Prisma.sql`coalesce(b.completed_bookings, 0)`,
  totalSpent: Prisma.sql`coalesce(b.total_spent, 0)`,
};

function cutoff(days: number): Prisma.Sql {
  return Prisma.sql`now() - make_interval(days => ${days}::int)`;
}

export function ruleToSql(rule: DynamicGroupRule): Prisma.Sql {
  if ('value' in rule) {
    const column = NUMBER_COLUMNS[rule.field];
    return rule.op === 'gte' ? Prisma.sql`${column} >= ${rule.value}` : Prisma.sql`${column} <= ${rule.value}`;
  }
  const column = DATE_COLUMNS[rule.field];
  if (rule.op === 'withinDays') return Prisma.sql`${column} >= ${cutoff(rule.days)}`;
  // "Not in N days" includes "never": a mother who never opened the app since
  // tracking began is exactly who a win-back message is for.
  return Prisma.sql`(${column} IS NULL OR ${column} < ${cutoff(rule.days)})`;
}

/** The rules AND-ed together; no rules is TRUE ("every active mother"). */
export function rulesToSql(rules: DynamicGroupRules): Prisma.Sql {
  if (rules.length === 0) return Prisma.sql`TRUE`;
  return Prisma.join(
    rules.map((rule) => Prisma.sql`(${ruleToSql(rule)})`),
    ' AND ',
  );
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `pnpm --filter @nanny-app/backend test:unit -- group-rules-sql`
Expected: PASS (all cases).

- [ ] **Step 5: Write the failing integration test for the resolver**

`apps/backend/src/__integration__/journeys/a45-dynamic-groups.test.ts`:

```ts
/**
 * A45 — dynamic groups. A dynamic group has no member rows: its rules are
 * evaluated against the database at send time. The resolver unions static and
 * dynamic groups into one sorted, deduplicated list of active mothers, and
 * reports groups that were deleted. "Not in N days" includes "never", booking
 * metrics count COMPLETED, non-deleted bookings only, and nannies, deactivated
 * and deleted accounts never match. Surveys resolve groups through the same
 * function, so they can target a dynamic group too.
 */
import type { DynamicGroupRules } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { countDynamicGroupMembers, resolveGroupMembers } from '@backend/services/group-audience.service';

import { makeAdmin, makeBooking, makeMother, makeNanny } from '../../../test/factories';
import { createDraft, publish } from '../../../test/journeys/survey';

const DAY = 86_400_000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY);

let groupSeq = 0;

/** A dynamic group written straight to the table (the admin API for it is Task 5's). */
async function dynamicGroup(adminId: number, rules: DynamicGroupRules): Promise<number> {
  groupSeq += 1;
  const row = await prisma.userGroup.create({
    data: { name: `Dynamic ${groupSeq}`, kind: 'DYNAMIC', rules: rules as Prisma.InputJsonValue, createdById: adminId },
  });
  return row.id;
}

async function staticGroup(adminId: number, userIds: number[]): Promise<number> {
  groupSeq += 1;
  const row = await prisma.userGroup.create({
    data: {
      name: `Static ${groupSeq}`,
      createdById: adminId,
      members: { create: userIds.map((userId) => ({ userId })) },
    },
  });
  return row.id;
}

const members = async (groupIds: number[]): Promise<number[]> => (await resolveGroupMembers(groupIds)).userIds;

describe('A45 — resolving dynamic groups', () => {
  it('notWithinDays matches NULL — a mother who never opened the app is "not opened in 30 days"', async () => {
    const admin = await makeAdmin();
    const never = await makeMother({ lastAppOpenAt: null });
    const lapsed = await makeMother({ lastAppOpenAt: daysAgo(45) });
    await makeMother({ lastAppOpenAt: daysAgo(2) });

    const group = await dynamicGroup(admin.id, [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }]);

    expect(await members([group])).toEqual([never.id, lapsed.id]);
  });

  it('withinDays leaves out never-set and older timestamps', async () => {
    const admin = await makeAdmin();
    await makeMother({ lastLoginAt: null });
    await makeMother({ lastLoginAt: daysAgo(20) });
    const recent = await makeMother({ lastLoginAt: daysAgo(3) });

    const group = await dynamicGroup(admin.id, [{ field: 'lastLoginAt', op: 'withinDays', days: 14 }]);

    expect(await members([group])).toEqual([recent.id]);
  });

  it('booking rules count COMPLETED, non-deleted bookings; "no booking in 60 days" includes never-booked', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const recent = await makeMother();
    const old = await makeMother();
    const deletedOnly = await makeMother();
    const cancelledOnly = await makeMother();
    const book = (motherId: number, status: 'COMPLETED' | 'CANCELLED', ago: number, deleted = false) =>
      makeBooking({
        motherId,
        nannyProfileId: nanny.nannyProfileId,
        status,
        date: daysAgo(ago),
        ...(deleted ? { data: { deletedAt: new Date() } } : {}),
      });
    await book(recent.id, 'COMPLETED', 10);
    await book(old.id, 'COMPLETED', 90);
    await book(deletedOnly.id, 'COMPLETED', 3, true);
    await book(cancelledOnly.id, 'CANCELLED', 5);

    const bookedLately = await dynamicGroup(admin.id, [{ field: 'lastBookingAt', op: 'withinDays', days: 30 }]);
    const lapsed = await dynamicGroup(admin.id, [{ field: 'lastBookingAt', op: 'notWithinDays', days: 60 }]);

    expect(await members([bookedLately])).toEqual([recent.id]);
    expect(await members([lapsed])).toEqual([old.id, deletedOnly.id, cancelledOnly.id]);
  });

  it('compares completed bookings and spend with "none" as zero, and ANDs every rule', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const regular = await makeMother();
    const once = await makeMother();
    const newbie = await makeMother({ createdAt: daysAgo(2) });
    const veteran = await makeMother({ createdAt: daysAgo(400) });
    const complete = (motherId: number) =>
      makeBooking({ motherId, nannyProfileId: nanny.nannyProfileId, status: 'COMPLETED', date: daysAgo(5) });
    await complete(regular.id);
    await complete(regular.id);
    const single = await complete(once.id);
    const oneBooking = Number(single.totalAmount);

    expect(await members([await dynamicGroup(admin.id, [{ field: 'completedBookings', op: 'gte', value: 2 }])])).toEqual([
      regular.id,
    ]);
    expect(
      await members([await dynamicGroup(admin.id, [{ field: 'completedBookings', op: 'lte', value: 0 }])]),
    ).toEqual([newbie.id, veteran.id]);
    expect(await members([await dynamicGroup(admin.id, [{ field: 'totalSpent', op: 'gte', value: 1 }])])).toEqual([
      regular.id,
      once.id,
    ]);
    expect(
      await members([
        await dynamicGroup(admin.id, [
          { field: 'completedBookings', op: 'gte', value: 1 },
          { field: 'totalSpent', op: 'lte', value: oneBooking },
        ]),
      ]),
    ).toEqual([once.id]);
    // Factory mothers are created "now" unless `createdAt` is overridden, so
    // only the 400-day-old account falls outside "signed up in the last 7 days".
    expect(
      await members([await dynamicGroup(admin.id, [{ field: 'createdAt', op: 'withinDays', days: 7 }])]),
    ).toEqual([regular.id, once.id, newbie.id]);
  });

  it('empty rules mean every active mother — never a nanny, a deactivated or a deleted account', async () => {
    const admin = await makeAdmin();
    const active = await makeMother();
    await makeMother({ isActive: false });
    await makeMother({ deletedAt: new Date() });
    await makeNanny();

    const everyone = await dynamicGroup(admin.id, []);

    expect(await members([everyone])).toEqual([active.id]);
    expect(await countDynamicGroupMembers([])).toBe(1);
    expect(await countDynamicGroupMembers([{ field: 'completedBookings', op: 'gte', value: 1 }])).toBe(0);
  });

  it('applies the same base filter to static members', async () => {
    const admin = await makeAdmin();
    const active = await makeMother();
    const deactivated = await makeMother();
    const group = await staticGroup(admin.id, [active.id, deactivated.id]);
    await prisma.user.update({ where: { id: deactivated.id }, data: { isActive: false } });

    expect(await members([group])).toEqual([active.id]);
  });

  it('dedupes a mother matched by two groups', async () => {
    const admin = await makeAdmin();
    const both = await makeMother({ lastAppOpenAt: daysAgo(1) });
    const staticOnly = await makeMother({ lastAppOpenAt: daysAgo(90) });
    const dynamicOnly = await makeMother({ lastAppOpenAt: daysAgo(2) });

    const picked = await staticGroup(admin.id, [both.id, staticOnly.id]);
    const active = await dynamicGroup(admin.id, [{ field: 'lastAppOpenAt', op: 'withinDays', days: 7 }]);

    const resolved = await resolveGroupMembers([active, picked, active]);
    expect(resolved).toEqual({ userIds: [both.id, staticOnly.id, dynamicOnly.id], skippedGroupIds: [] });
  });

  it('skips a deleted group, reports it, and still resolves the rest', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const live = await staticGroup(admin.id, [mother.id]);
    const gone = await dynamicGroup(admin.id, []);
    await prisma.userGroup.update({ where: { id: gone }, data: { deletedAt: new Date() } });

    expect(await resolveGroupMembers([gone, live])).toEqual({ userIds: [mother.id], skippedGroupIds: [gone] });
    expect(await resolveGroupMembers([gone])).toEqual({ userIds: [], skippedGroupIds: [gone] });
  });

  it('lets a survey be sent to a dynamic group, resolved at publish', async () => {
    const admin = await makeAdmin();
    const lapsed = await makeMother({ lastAppOpenAt: daysAgo(40) });
    await makeMother({ lastAppOpenAt: daysAgo(1) });
    const group = await dynamicGroup(admin.id, [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }]);
    const survey = await createDraft(admin.token);

    expect(await publish(admin.token, survey.id, { groupIds: [group] })).toBe(1);
    const recipients = await prisma.surveyRecipient.findMany({ where: { surveyId: survey.id } });
    expect(recipients.map((r) => r.userId)).toEqual([lapsed.id]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `mkdir -p ~/logs; tmux new -d -s nanny-a45 "pnpm --filter @nanny-app/backend test:integration -- a45 2>&1 | tee ~/logs/nanny-a45.log"`, then `tail -40 ~/logs/nanny-a45.log` once `tmux has-session -t nanny-a45` reports no session.
Expected: FAIL — `Cannot find module '@backend/services/group-audience.service'`.

- [ ] **Step 7: Implement `apps/backend/src/services/group-audience.service.ts`**

```ts
import { Prisma, UserGroupKind } from '@prisma/client';

import type { DynamicGroupRules } from '@nanny-app/shared';
import { DynamicGroupRulesSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { COMPLETED_BOOKING_STATS_JOIN, RECEIVABLE_MOTHER_SQL, rulesToSql } from '@backend/lib/group-rules-sql';

// ──────────────────────────────────────────────────────────────
// Turns groups into recipients. Feature-neutral: Surveys and the notification
// center both call it, and it imports neither.
// ──────────────────────────────────────────────────────────────

/** A stored `user_groups.rules` value, always read through the shared schema. */
export function parseGroupRules(raw: Prisma.JsonValue | null): DynamicGroupRules {
  return DynamicGroupRulesSchema.parse(raw ?? []);
}

/**
 * The union of the groups' current members: live static members plus whoever
 * matches each dynamic group's rules right now. One query over `users`, so a
 * mother in several groups appears once. Only active mothers — the same base
 * filter applies to hand-picked members, who may have been deactivated since.
 * Groups that no longer exist are returned in `skippedGroupIds`.
 */
export async function resolveGroupMembers(
  groupIds: number[],
): Promise<{ userIds: number[]; skippedGroupIds: number[] }> {
  const ids = [...new Set(groupIds)];
  if (ids.length === 0) return { userIds: [], skippedGroupIds: [] };

  const groups = await prisma.userGroup.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, kind: true, rules: true },
  });
  const live = new Set(groups.map((g) => g.id));
  const skippedGroupIds = ids.filter((id) => !live.has(id)).sort((a, b) => a - b);

  const branches: Prisma.Sql[] = [];
  const staticIds = groups.filter((g) => g.kind === UserGroupKind.STATIC).map((g) => g.id);
  if (staticIds.length > 0) {
    branches.push(Prisma.sql`EXISTS (
      SELECT 1 FROM user_group_members m
      WHERE m.user_id = u.id AND m.group_id IN (${Prisma.join(staticIds)}) AND m.deleted_at IS NULL)`);
  }
  for (const group of groups) {
    if (group.kind === UserGroupKind.DYNAMIC) {
      branches.push(Prisma.sql`(${rulesToSql(parseGroupRules(group.rules))})`);
    }
  }
  if (branches.length === 0) return { userIds: [], skippedGroupIds };

  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT u.id
    FROM users u
    ${COMPLETED_BOOKING_STATS_JOIN}
    WHERE (${RECEIVABLE_MOTHER_SQL}) AND (${Prisma.join(branches, ' OR ')})
    ORDER BY u.id ASC`;
  return { userIds: rows.map((r) => r.id), skippedGroupIds };
}

/** How many active mothers a rule set matches right now — a dynamic group's member count. */
export async function countDynamicGroupMembers(rules: DynamicGroupRules): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total
    FROM users u
    ${COMPLETED_BOOKING_STATS_JOIN}
    WHERE (${RECEIVABLE_MOTHER_SQL}) AND (${rulesToSql(rules)})`;
  return Number(rows[0]?.total ?? 0);
}
```

- [ ] **Step 8: Switch the mother picker to the shared fragments**

Starting from the file as Task 2 left it (with `lastAppOpenAt` in `ORDER_BY`, `RawRow`, the SELECT and the row map), this task changes four things only: the `group-rules-sql` import, the base condition (`RECEIVABLE_MOTHER_SQL` replaces the three inline `u.role` / `u.deleted_at` / `u.is_active` conditions), the inline bookings subquery (replaced by `${COMPLETED_BOOKING_STATS_JOIN}`), and the count query (now carries the join). The whole file afterwards, so nothing has to be pieced together (behaviour unchanged):

```ts
import { Prisma } from '@prisma/client';

import type { MotherPickerQuery, MotherPickerRow, MotherPickerSortKey, PaginationMeta } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { displayName } from '@backend/lib/display-name';
import { COMPLETED_BOOKING_STATS_JOIN, RECEIVABLE_MOTHER_SQL } from '@backend/lib/group-rules-sql';

// Sorting by an aggregate has to happen in the database, before LIMIT/OFFSET —
// sorting one fetched page would order only that page. Hence raw SQL: Prisma's
// query builder can't order users by a sum over their bookings.

const ORDER_BY: Record<MotherPickerSortKey, Prisma.Sql> = {
  name: Prisma.sql`lower(u.first_name || ' ' || u.last_name)`,
  completedBookings: Prisma.sql`completed_bookings`,
  hoursBooked: Prisma.sql`hours_booked`,
  totalSpent: Prisma.sql`total_spent`,
  lastBookingAt: Prisma.sql`last_booking_at`,
  createdAt: Prisma.sql`u.created_at`,
  lastLoginAt: Prisma.sql`u.last_login_at`,
  lastAppOpenAt: Prisma.sql`u.last_app_open_at`,
};

type RawRow = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  created_at: Date;
  last_login_at: Date | null;
  last_app_open_at: Date | null;
  completed_bookings: bigint;
  hours_booked: Prisma.Decimal;
  total_spent: Prisma.Decimal;
  last_booking_at: Date | null;
};

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listMotherPicker(
  q: MotherPickerQuery,
): Promise<{ rows: MotherPickerRow[]; meta: PaginationMeta }> {
  // Only mothers who can receive something: a deactivated mother in a survey's
  // userIds makes the whole publish fail.
  const conditions: Prisma.Sql[] = [Prisma.sql`(${RECEIVABLE_MOTHER_SQL})`];
  if (q.search) {
    const like = `%${escapeLike(q.search)}%`;
    conditions.push(
      Prisma.sql`((u.first_name || ' ' || u.last_name) ILIKE ${like} OR u.phone ILIKE ${like} OR u.email ILIKE ${like})`,
    );
  }
  if (q.groupId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM user_group_members m JOIN user_groups g ON g.id = m.group_id
      WHERE m.user_id = u.id AND m.group_id = ${q.groupId}
        AND m.deleted_at IS NULL AND g.deleted_at IS NULL)`);
  }
  if (q.excludeGroupId) {
    conditions.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM user_group_members m
      WHERE m.user_id = u.id AND m.group_id = ${q.excludeGroupId} AND m.deleted_at IS NULL)`);
  }
  const where = Prisma.join(conditions, ' AND ');
  const dir = q.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const offset = (q.page - 1) * q.limit;

  const [countRows, raw] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM users u ${COMPLETED_BOOKING_STATS_JOIN} WHERE ${where}`,
    prisma.$queryRaw<RawRow[]>`
      SELECT u.id, u.first_name, u.last_name, u.phone, u.created_at, u.last_login_at, u.last_app_open_at,
             coalesce(b.completed_bookings, 0) AS completed_bookings,
             coalesce(b.hours_booked, 0) AS hours_booked,
             coalesce(b.total_spent, 0) AS total_spent,
             b.last_booking_at
      FROM users u
      ${COMPLETED_BOOKING_STATS_JOIN}
      WHERE ${where}
      ORDER BY ${ORDER_BY[q.sortBy]} ${dir} NULLS LAST, u.id ASC
      LIMIT ${q.limit} OFFSET ${offset}`,
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  return {
    rows: raw.map((r) => ({
      id: r.id,
      name: displayName(r.first_name, r.last_name),
      phone: r.phone,
      completedBookings: Number(r.completed_bookings),
      hoursBooked: Number(r.hours_booked),
      totalSpent: Number(r.total_spent),
      lastBookingAt: r.last_booking_at ? r.last_booking_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
      lastAppOpenAt: r.last_app_open_at ? r.last_app_open_at.toISOString() : null,
    })),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}
```

- [ ] **Step 9: Route the survey group branch through the resolver**

In `apps/backend/src/services/survey-audience.service.ts`, add the import:

```ts
import { resolveGroupMembers } from '@backend/services/group-audience.service';
```

and replace `resolveSurveyAudience` with:

```ts
/** The union of the target's mothers, deduplicated and sorted. */
export async function resolveSurveyAudience(target: SurveyTarget): Promise<number[]> {
  const groupIds = [...new Set(target.groupIds)];
  const userIds = [...new Set(target.userIds)];

  // Static and dynamic groups resolve through the shared resolver, so a survey
  // can go to "mothers who haven't opened the app in 30 days" too. Dynamic
  // groups are evaluated now, at publish.
  let groupMembers: number[] = [];
  if (groupIds.length > 0) {
    const resolved = await resolveGroupMembers(groupIds);
    if (resolved.skippedGroupIds.length > 0) throw errors.badRequest('One of the chosen groups no longer exists.');
    groupMembers = resolved.userIds;
  }
  if (userIds.length > 0) {
    const ok = await prisma.user.count({ where: { id: { in: userIds }, ...receivable } });
    if (ok !== userIds.length) {
      throw errors.badRequest("Some of the chosen people can't receive surveys — only active mothers can.");
    }
  }

  if (target.allMothers) {
    const rows = await prisma.user.findMany({ where: receivable, select: { id: true }, orderBy: { id: 'asc' } });
    return rows.map((r) => r.id);
  }
  // Hand-picked ids were all checked receivable above; group members already are.
  return [...new Set([...userIds, ...groupMembers])].sort((a, b) => a - b);
}
```

`notifySurveyRecipients`, `receivable`, `SURVEY_PUSH_TITLE` and `PUSH_BATCH` are unchanged.

- [ ] **Step 10: Run the tests**

Run: `pnpm --filter @nanny-app/backend test:unit -- 'group-rules-sql|admin-survey'` and `pnpm --filter @nanny-app/backend typecheck`, then the resolver, picker and survey suites in tmux:
`tmux new -d -s nanny-a45 "pnpm --filter @nanny-app/backend test:integration -- 'a45|a36|a38' 2>&1 | tee ~/logs/nanny-a45.log"`; `tail -60 ~/logs/nanny-a45.log` when it finishes.
Expected: PASS — a45 green; a36 (picker) and a38 (survey publish, incl. "refuses a deleted group") unchanged.

- [ ] **Step 11: Commit**

```bash
git add apps/backend
git commit -F - <<'EOF'
feat(backend): dynamic-group rule SQL and a shared group resolver

Surveys now resolve groups through it, so they can target dynamic groups.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
```

---

### Task 5: Groups static/dynamic, picker and Mothers list last-app-open (backend)

> Note: this task starts from the code as Task 2 Step 5 left it. Task 2 already returns `kind`/`rules` from `admin-group.service.ts` (with `memberCount` still the member-row count), and `lastAppOpenAt` from the picker and the Mothers list, with the Mothers list sort. Task 2's unit-test edits (the `makeRow` field, the DTO expectation and the `lastAppOpenAt` sort row) are not repeated here. `listAdminMothers` gains `lastAppOpen` as an optional field of its second parameter (default `'ANY'`), so Task 2's existing unit tests, which omit it, still type-check.

**Files:**
- Modify: `apps/backend/src/services/admin-group.service.ts`, `apps/backend/src/services/mother-picker.service.ts`, `apps/backend/src/services/admin-user.service.ts`
- Modify: `apps/backend/src/routes/admin.routes.ts`, `apps/backend/src/lib/admin-permissions.ts`
- Test: `apps/backend/src/__integration__/journeys/a45-dynamic-groups.test.ts` (extend), `apps/backend/src/__tests__/admin-mother.service.test.ts` (extend), `apps/backend/src/__tests__/admin-permissions.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces:
  - `admin-group.service.ts`: `createUserGroup(adminId, input: UserGroupInput)` stores `kind`/`rules`; `updateUserGroup(id, input: UserGroupUpdateInput)` (rules only allowed for DYNAMIC → else 400 `'Only dynamic groups have rules.'`); `addUserGroupMembers` / `removeUserGroupMembers` throw `errors.conflict('Dynamic groups have no hand-picked members.')` for DYNAMIC; `listUserGroups`/`getUserGroup` return `kind`, `rules`, live `memberCount` for DYNAMIC via `countDynamicGroupMembers`; `previewGroupRules(rules): Promise<GroupRulesPreview>`.
  - Route `POST /admin/groups/rules-preview` (`section('groups','MANAGE')`); `PATCH /admin/groups/:id` validates with `UserGroupUpdateSchema`.
  - `listMotherPicker(q)` supports sort `lastAppOpenAt`, returns `lastAppOpenAt`, filters by `q.rules` via `rulesToSql`.
  - Admin mothers list: `lastAppOpenAt` in each row, `lastAppOpen` filter (`WITHIN_7` → `last_app_open_at >= now()-7d`, `WITHIN_30`, `NOT_30` → `< now()-30d OR NULL`, `NOT_90`, `NEVER` → `IS NULL`), sort by `lastAppOpenAt`.
  - Permissions: `GET /groups`, `GET /groups/:id`, `GET /mother-picker` `anyOf` gains `['notifications','MANAGE']`; new row for `POST /groups/rules-preview`.

- [ ] **Step 1: Extend a45 with the admin-API journeys (failing)**

In `apps/backend/src/__integration__/journeys/a45-dynamic-groups.test.ts`, replace the import block with:

```ts
import type { DynamicGroupRules } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { countDynamicGroupMembers, resolveGroupMembers } from '@backend/services/group-audience.service';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeBooking, makeMother, makeNanny, makeOperator } from '../../../test/factories';
import { createDraft, publish } from '../../../test/journeys/survey';
```

and append at the end of the file:

```ts
function postGroup(token: string, body: object) {
  return request(app).post('/admin/groups').set(...authHeader(token)).send(body);
}

const LAPSED_30: DynamicGroupRules = [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }];

describe('A45 — dynamic groups over the admin API', () => {
  it('creates a dynamic group with a live member count, and edits its rules but never its kind', async () => {
    const admin = await makeAdmin();
    await makeMother({ lastAppOpenAt: daysAgo(40) });
    const drifting = await makeMother({ lastAppOpenAt: daysAgo(1) });

    const created = await postGroup(admin.token, { name: 'Lapsed', kind: 'DYNAMIC', rules: LAPSED_30 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Lapsed', kind: 'DYNAMIC', rules: LAPSED_30, memberCount: 1 });
    const id = created.body.data.id as number;

    // Nothing is written to the group when a mother drifts into its rules.
    await prisma.user.update({ where: { id: drifting.id }, data: { lastAppOpenAt: daysAgo(60) } });
    const fetched = await request(app).get(`/admin/groups/${id}`).set(...authHeader(admin.token));
    expect(fetched.body.data.memberCount).toBe(2);

    const within45: DynamicGroupRules = [{ field: 'lastAppOpenAt', op: 'withinDays', days: 45 }];
    const edited = await request(app)
      .patch(`/admin/groups/${id}`)
      .set(...authHeader(admin.token))
      .send({ name: 'Active-ish', kind: 'STATIC', rules: within45 });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ name: 'Active-ish', kind: 'DYNAMIC', rules: within45, memberCount: 1 });

    const list = await request(app).get('/admin/groups').set(...authHeader(admin.token));
    expect(list.body.data).toEqual([expect.objectContaining({ id, kind: 'DYNAMIC', memberCount: 1 })]);
  });

  it('keeps rules off static groups, at create and at edit', async () => {
    const admin = await makeAdmin();

    expect((await postGroup(admin.token, { name: 'S', kind: 'STATIC', rules: [] })).status).toBe(400);

    const plain = await postGroup(admin.token, { name: 'Beta testers' });
    expect(plain.status).toBe(201);
    expect(plain.body.data).toMatchObject({ kind: 'STATIC', rules: null, memberCount: 0 });

    const res = await request(app)
      .patch(`/admin/groups/${plain.body.data.id}`)
      .set(...authHeader(admin.token))
      .send({ name: 'Beta testers', rules: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only dynamic groups have rules.');
  });

  it('refuses hand-picked members on a dynamic group with 409', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const group = await postGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const path = `/admin/groups/${group.body.data.id}/members`;

    for (const res of [
      await request(app).post(path).set(...authHeader(admin.token)).send({ userIds: [mother.id] }),
      await request(app).delete(path).set(...authHeader(admin.token)).send({ userIds: [mother.id] }),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Dynamic groups have no hand-picked members.');
    }
    expect(await prisma.userGroupMember.count()).toBe(0);
  });

  it('previews a rule set without saving, and refuses a field used twice', async () => {
    const admin = await makeAdmin();
    await makeMother({ lastAppOpenAt: daysAgo(40) });
    await makeMother({ lastAppOpenAt: null });
    await makeMother({ lastAppOpenAt: daysAgo(1) });

    const preview = await request(app)
      .post('/admin/groups/rules-preview')
      .set(...authHeader(admin.token))
      .send({ rules: LAPSED_30 });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toEqual({ count: 2 });

    const twice = await request(app)
      .post('/admin/groups/rules-preview')
      .set(...authHeader(admin.token))
      .send({ rules: [...LAPSED_30, { field: 'lastAppOpenAt', op: 'withinDays', days: 7 }] });
    expect(twice.status).toBe(400);
    expect(twice.body.error).toMatch(/Each rule field can be used once\./);
    expect(await prisma.userGroup.count()).toBe(0);
  });

  it("lists a dynamic group's members through the picker, sorted by last app open", async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const never = await makeMother({ lastAppOpenAt: null });
    const lapsed = await makeMother({ lastAppOpenAt: daysAgo(40) });
    const older = await makeMother({ lastAppOpenAt: daysAgo(70) });
    await makeMother({ lastAppOpenAt: daysAgo(1) });
    await makeBooking({ motherId: older.id, nannyProfileId: nanny.nannyProfileId, status: 'COMPLETED', date: daysAgo(3) });
    const picker = (query: Record<string, string>) =>
      request(app).get('/admin/mother-picker').query(query).set(...authHeader(admin.token));

    const res = await picker({ rules: JSON.stringify(LAPSED_30), sortBy: 'lastAppOpenAt', sortDir: 'desc' });
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: number }) => r.id)).toEqual([lapsed.id, older.id, never.id]);
    expect(res.body.data[2].lastAppOpenAt).toBeNull();
    expect(res.body.data[0].lastAppOpenAt).toEqual(expect.any(String));
    expect(res.body.meta.total).toBe(3);

    // A booking rule needs the stats join in the count query as well as the page query.
    const booked = await picker({ rules: JSON.stringify([{ field: 'completedBookings', op: 'gte', value: 1 }]) });
    expect(booked.body.data.map((r: { id: number }) => r.id)).toEqual([older.id]);
    expect(booked.body.meta.total).toBe(1);

    expect((await picker({ rules: 'not json' })).status).toBe(400);
    expect((await picker({ rules: JSON.stringify([{ field: 'lastAppOpenAt' }]) })).status).toBe(400);
  });

  it('filters and sorts the Mothers list by last app open', async () => {
    const admin = await makeAdmin();
    const recent = await makeMother({ lastAppOpenAt: daysAgo(2) });
    const lapsed = await makeMother({ lastAppOpenAt: daysAgo(45) });
    const gone = await makeMother({ lastAppOpenAt: daysAgo(120) });
    const never = await makeMother({ lastAppOpenAt: null });
    const ids = async (query: Record<string, string>): Promise<number[]> => {
      const res = await request(app).get('/admin/mothers').query(query).set(...authHeader(admin.token));
      expect(res.status).toBe(200);
      return (res.body.data as { id: number }[]).map((m) => m.id);
    };
    const sorted = (list: number[]) => [...list].sort((a, b) => a - b);

    expect(await ids({ lastAppOpen: 'WITHIN_7' })).toEqual([recent.id]);
    expect(await ids({ lastAppOpen: 'WITHIN_30' })).toEqual([recent.id]);
    expect(sorted(await ids({ lastAppOpen: 'NOT_30' }))).toEqual([lapsed.id, gone.id, never.id]);
    expect(sorted(await ids({ lastAppOpen: 'NOT_90' }))).toEqual([gone.id, never.id]);
    expect(await ids({ lastAppOpen: 'NEVER' })).toEqual([never.id]);
    expect(await ids({ sortBy: 'lastAppOpenAt', sortDir: 'desc' })).toEqual([recent.id, lapsed.id, gone.id, never.id]);
    expect(await ids({ sortBy: 'lastAppOpenAt', sortDir: 'asc' })).toEqual([gone.id, lapsed.id, recent.id, never.id]);

    const row = await request(app).get(`/admin/mothers/${never.id}`).set(...authHeader(admin.token));
    expect(row.body.data.lastAppOpenAt).toBeNull();
  });

  it('lets a notifications manager read groups and pick mothers, but not change groups', async () => {
    const admin = await makeAdmin();
    const manager = await makeOperator({ notifications: 'MANAGE' });
    const viewer = await makeOperator({ notifications: 'VIEW' });
    const group = await postGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const as = (token: string) => ({
      get: (path: string) => request(app).get(path).set(...authHeader(token)),
      post: (path: string, body: object) => request(app).post(path).set(...authHeader(token)).send(body),
    });

    expect((await as(manager.token).get('/admin/groups')).status).toBe(200);
    expect((await as(manager.token).get(`/admin/groups/${group.body.data.id}`)).status).toBe(200);
    expect((await as(manager.token).get('/admin/mother-picker')).status).toBe(200);
    expect((await as(manager.token).post('/admin/groups', { name: 'Mine' })).status).toBe(403);
    expect((await as(manager.token).post('/admin/groups/rules-preview', { rules: [] })).status).toBe(403);
    expect((await as(viewer.token).get('/admin/groups')).status).toBe(403);
  });
});
```

- [ ] **Step 2: Extend the unit tests (failing)**

`apps/backend/src/__tests__/admin-mother.service.test.ts`:

Task 2 already added `lastAppOpenAt` to `makeRow` and to the DTO expectation, and the `lastAppOpenAt` row to the sort table. Add only the filter cases, inside `describe('listAdminMothers', …)`, after the "filters by verification status" test:

```ts
  it.each([
    ['WITHIN_7', { lastAppOpenAt: { gte: new Date('2026-10-13T12:00:00.000Z') } }],
    ['WITHIN_30', { lastAppOpenAt: { gte: new Date('2026-09-20T12:00:00.000Z') } }],
    [
      'NOT_30',
      { OR: [{ lastAppOpenAt: null }, { lastAppOpenAt: { lt: new Date('2026-09-20T12:00:00.000Z') } }] },
    ],
    [
      'NOT_90',
      { OR: [{ lastAppOpenAt: null }, { lastAppOpenAt: { lt: new Date('2026-07-22T12:00:00.000Z') } }] },
    ],
    ['NEVER', { lastAppOpenAt: null }],
    ['ANY', {}],
  ] as const)('filters by last app open %s', async (lastAppOpen, extra) => {
    // The window is measured from Date.now(); pin it so the cut-offs are exact.
    const now = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-20T12:00:00.000Z').getTime());
    try {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await listAdminMothers('ALL', { page: 1, limit: 20, sortBy: 'registered', sortDir: 'desc', lastAppOpen });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: 'MOTHER', deletedAt: null, ...extra } }),
      );
    } finally {
      now.mockRestore();
    }
  });
```

`apps/backend/src/__tests__/admin-permissions.test.ts` — add after `it('accepts any one of the sections on a shared route', …)`:

```ts
  it('lets a notifications manager read groups and pick mothers, but not change groups', () => {
    expect(allows('GET', '/groups', 'OPERATOR', { notifications: 'MANAGE' })).toBe(true);
    expect(allows('GET', '/groups/3', 'OPERATOR', { notifications: 'MANAGE' })).toBe(true);
    expect(allows('GET', '/mother-picker', 'OPERATOR', { notifications: 'MANAGE' })).toBe(true);
    expect(allows('GET', '/groups', 'OPERATOR', { notifications: 'VIEW' })).toBe(false);
    expect(allows('POST', '/groups', 'OPERATOR', { notifications: 'MANAGE' })).toBe(false);
    expect(allows('POST', '/groups/rules-preview', 'OPERATOR', { notifications: 'MANAGE' })).toBe(false);
    expect(allows('POST', '/groups/rules-preview', 'OPERATOR', { groups: 'MANAGE' })).toBe(true);
    expect(allows('POST', '/groups/rules-preview', 'OPERATOR', { groups: 'VIEW' })).toBe(false);
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/backend test:unit -- 'admin-mother|admin-permissions'`
Expected: FAIL — `listAdminMothers` does not accept `lastAppOpen` (ts-jest type error) and ignores the filter, and `POST /groups/rules-preview` resolves to no requirement.

Run: `tmux new -d -s nanny-a45 "pnpm --filter @nanny-app/backend test:integration -- a45 2>&1 | tee ~/logs/nanny-a45.log"`; `tail -60 ~/logs/nanny-a45.log` when done.
Expected: the Task 4 cases PASS; the new "over the admin API" cases FAIL. `kind` is not stored (Task 2's `createUserGroup` writes only name/description), rules-preview answers 403, members answer 200 instead of 409, the picker ignores `rules`, and the Mothers list ignores `lastAppOpen`. The `lastAppOpenAt` sort assertions already pass (Task 2).

- [ ] **Step 4: Rewrite `apps/backend/src/services/admin-group.service.ts`**

This replaces the whole file as Task 2 left it. Task 2's `rulesOf` helper gives way to `parseGroupRules` from `group-audience.service` (the same `DynamicGroupRulesSchema.parse(raw ?? [])`), because `toDto` now also needs the parsed rules for the live count. `UserGroupKind` becomes a value import. Everything below `assertNameFree` keeps its Task 2 behaviour, except the DYNAMIC guards and the `kind`/`rules` writes.

```ts
import { type Prisma, Role, UserGroupKind } from '@prisma/client';

import type {
  DynamicGroupRules,
  GroupRulesPreview,
  UserGroup,
  UserGroupInput,
  UserGroupUpdateInput,
} from '@nanny-app/shared';
import { UserGroupInputSchema, UserGroupUpdateSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { countDynamicGroupMembers, parseGroupRules } from '@backend/services/group-audience.service';

const withMemberCount = {
  _count: { select: { members: { where: { deletedAt: null } } } },
} as const;

type GroupRow = {
  id: number;
  name: string;
  description: string | null;
  kind: UserGroupKind;
  rules: Prisma.JsonValue;
  createdAt: Date;
  _count: { members: number };
};

/**
 * A static group counts its member rows; a dynamic group has none — its
 * members are whoever its rules match right now, so the count is live.
 */
async function toDto(row: GroupRow): Promise<UserGroup> {
  const base = {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.kind === UserGroupKind.DYNAMIC) {
    const rules = parseGroupRules(row.rules);
    return { ...base, kind: 'DYNAMIC', rules, memberCount: await countDynamicGroupMembers(rules) };
  }
  return { ...base, kind: 'STATIC', rules: null, memberCount: row._count.members };
}

async function requireGroup(id: number): Promise<GroupRow> {
  const row = await prisma.userGroup.findFirst({ where: { id, deletedAt: null }, include: withMemberCount });
  if (!row) throw errors.notFound('Group not found.');
  return row;
}

/** Member rows belong to static groups only. */
function assertStatic(row: GroupRow): void {
  if (row.kind === UserGroupKind.DYNAMIC) throw errors.conflict('Dynamic groups have no hand-picked members.');
}

/** Names are unique among live groups, ignoring case. */
async function assertNameFree(name: string, exceptId?: number): Promise<void> {
  const clash = await prisma.userGroup.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw errors.conflict('A group with this name already exists.');
}

export async function listUserGroups(): Promise<UserGroup[]> {
  const rows = await prisma.userGroup.findMany({
    where: { deletedAt: null },
    include: withMemberCount,
    orderBy: { name: 'asc' },
  });
  return Promise.all(rows.map(toDto));
}

export async function getUserGroup(id: number): Promise<UserGroup> {
  return toDto(await requireGroup(id));
}

export async function createUserGroup(adminId: number, input: UserGroupInput): Promise<UserGroup> {
  const { name, description, kind, rules } = UserGroupInputSchema.parse(input);
  await assertNameFree(name);
  const row = await prisma.userGroup.create({
    data: {
      name,
      description,
      kind,
      createdById: adminId,
      // STATIC leaves the column NULL; DYNAMIC always stores an array ([] = every active mother).
      ...(kind === UserGroupKind.DYNAMIC ? { rules: (rules ?? []) as Prisma.InputJsonValue } : {}),
    },
    include: withMemberCount,
  });
  return toDto(row);
}

/** Name, description and — for a dynamic group — its rules. `kind` is fixed at creation. */
export async function updateUserGroup(id: number, input: UserGroupUpdateInput): Promise<UserGroup> {
  const { name, description, rules } = UserGroupUpdateSchema.parse(input);
  const existing = await requireGroup(id);
  if (rules !== undefined && existing.kind !== UserGroupKind.DYNAMIC) {
    throw errors.badRequest('Only dynamic groups have rules.');
  }
  await assertNameFree(name, id);
  const row = await prisma.userGroup.update({
    where: { id },
    data: {
      name,
      description,
      ...(rules !== undefined ? { rules: rules as Prisma.InputJsonValue } : {}),
    },
    include: withMemberCount,
  });
  return toDto(row);
}

export async function deleteUserGroup(id: number): Promise<void> {
  await requireGroup(id);
  await prisma.userGroup.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function addUserGroupMembers(id: number, userIds: number[]): Promise<UserGroup> {
  assertStatic(await requireGroup(id));
  const ids = [...new Set(userIds)];
  const mothers = await prisma.user.count({ where: { id: { in: ids }, role: Role.MOTHER, deletedAt: null } });
  if (mothers !== ids.length) throw errors.badRequest('Only mothers can be added to a group.');

  await prisma.$transaction([
    // Someone removed earlier comes back on the same row.
    prisma.userGroupMember.updateMany({
      where: { groupId: id, userId: { in: ids }, deletedAt: { not: null } },
      data: { deletedAt: null },
    }),
    prisma.userGroupMember.createMany({
      data: ids.map((userId) => ({ groupId: id, userId })),
      skipDuplicates: true,
    }),
  ]);
  return getUserGroup(id);
}

export async function removeUserGroupMembers(id: number, userIds: number[]): Promise<UserGroup> {
  assertStatic(await requireGroup(id));
  await prisma.userGroupMember.updateMany({
    where: { groupId: id, userId: { in: userIds }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return getUserGroup(id);
}

/** The live count for a rule set being edited, before it is saved. */
export async function previewGroupRules(rules: DynamicGroupRules): Promise<GroupRulesPreview> {
  return { count: await countDynamicGroupMembers(rules) };
}
```

- [ ] **Step 5: Filter the picker by rules**

In `apps/backend/src/services/mother-picker.service.ts`, extend the `group-rules-sql` import to:

```ts
import { COMPLETED_BOOKING_STATS_JOIN, RECEIVABLE_MOTHER_SQL, rulesToSql } from '@backend/lib/group-rules-sql';
```

and add, right after the `if (q.excludeGroupId) { … }` block:

```ts
  // A dynamic group's members: the same SQL the resolver sends to. The count
  // query carries the stats join, so booking rules count correctly too.
  if (q.rules) {
    conditions.push(Prisma.sql`(${rulesToSql(q.rules)})`);
  }
```

(The `lastAppOpenAt` sort key, column and row field went in with Task 4.)

- [ ] **Step 6: The last-app-open filter in the Mothers list**

Task 2 already selects, returns and sorts by `lastAppOpenAt` in `apps/backend/src/services/admin-user.service.ts` (`motherSelect`, `toMotherDto`, `motherOrderBy`), and already imports `AdminMotherListQuery` and `AdminMotherSortKey`. This step adds only the filter.

1. Add `AdminMotherLastAppOpenFilter,` to the `@nanny-app/shared` type import.
2. Insert directly above the `listAdminMothers` doc comment:

```ts
const DAY_MS = 86_400_000;

/** The Mothers tab's "Last app open" filter; "not within N days" includes never. */
function lastAppOpenWhere(filter: AdminMotherLastAppOpenFilter): Prisma.UserWhereInput {
  const since = (days: number) => new Date(Date.now() - days * DAY_MS);
  switch (filter) {
    case 'WITHIN_7':
      return { lastAppOpenAt: { gte: since(7) } };
    case 'WITHIN_30':
      return { lastAppOpenAt: { gte: since(30) } };
    case 'NOT_30':
      return { OR: [{ lastAppOpenAt: null }, { lastAppOpenAt: { lt: since(30) } }] };
    case 'NOT_90':
      return { OR: [{ lastAppOpenAt: null }, { lastAppOpenAt: { lt: since(90) } }] };
    case 'NEVER':
      return { lastAppOpenAt: null };
    case 'ANY':
      return {};
  }
}
```

3. Replace the signature and `where` Task 2 left:

```ts
export async function listAdminMothers(
  status: AdminApprovalStatusFilter,
  { page, limit, sortBy, sortDir }: Pick<AdminMotherListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir'>,
): Promise<{ mothers: AdminMother[]; meta: PaginationMeta }> {
  const where: Prisma.UserWhereInput = {
    role: 'MOTHER',
    deletedAt: null,
    ...(status !== 'ALL' ? { approvalStatus: status as ApprovalStatus } : {}),
  };
```

with:

```ts
export async function listAdminMothers(
  status: AdminApprovalStatusFilter,
  {
    page,
    limit,
    sortBy,
    sortDir,
    lastAppOpen = 'ANY',
  }: Pick<AdminMotherListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir'> & { lastAppOpen?: AdminMotherLastAppOpenFilter },
): Promise<{ mothers: AdminMother[]; meta: PaginationMeta }> {
  const where: Prisma.UserWhereInput = {
    role: 'MOTHER',
    deletedAt: null,
    ...(status !== 'ALL' ? { approvalStatus: status as ApprovalStatus } : {}),
    ...lastAppOpenWhere(lastAppOpen),
  };
```

The rest of the function (count + page in one `$transaction`, `toMotherDto`, meta) is unchanged. The route (`GET /admin/mothers`) already passes `{ status, ...query }` from the validated `AdminMotherListQuery`, which carries `lastAppOpen`, so it needs no change.

- [ ] **Step 7: Routes**

In `admin.routes.ts`: add `GroupRulesPreviewInputSchema,` and `UserGroupUpdateSchema,` to the `@nanny-app/shared` import and `previewGroupRules,` to the `admin-group.service` import. Change the `PATCH /groups/:id` validator from `validateBody(UserGroupInputSchema)` to `validateBody(UserGroupUpdateSchema)`, and add after the `POST /groups` handler:

```ts
adminRouter.post(
  '/groups/rules-preview',
  validateBody(GroupRulesPreviewInputSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await previewGroupRules(req.body.rules)));
    } catch (err) {
      next(err);
    }
  },
);
```

Change the section comment above the groups handlers to `// ── User groups (audiences for surveys and notifications) ──────`.

- [ ] **Step 8: Permissions**

In `admin-permissions.ts`, replace the Groups block's rows with:

```ts
  // ── Groups (audiences reused by Surveys and the notification center) ──
  // Reading groups and the picker is also open to whoever can send a survey or
  // a notification: their editors list groups and mothers to pick from.
  { method: 'GET', pattern: '/groups', requires: anyOf(['groups', 'VIEW'], ['surveys', 'MANAGE'], ['notifications', 'MANAGE']) },
  { method: 'POST', pattern: '/groups', requires: section('groups', 'MANAGE') },
  { method: 'POST', pattern: '/groups/rules-preview', requires: section('groups', 'MANAGE') },
  { method: 'GET', pattern: '/groups/:id', requires: anyOf(['groups', 'VIEW'], ['notifications', 'MANAGE']) },
  { method: 'PATCH', pattern: '/groups/:id', requires: section('groups', 'MANAGE') },
  { method: 'DELETE', pattern: '/groups/:id', requires: section('groups', 'MANAGE') },
  { method: 'POST', pattern: '/groups/:id/members', requires: section('groups', 'MANAGE') },
  { method: 'DELETE', pattern: '/groups/:id/members', requires: section('groups', 'MANAGE') },
```

and the picker row with:

```ts
  { method: 'GET', pattern: '/mother-picker', requires: anyOf(['groups', 'VIEW'], ['surveys', 'MANAGE'], ['notifications', 'MANAGE']) },
```

- [ ] **Step 9: Run the tests**

Run: `pnpm --filter @nanny-app/backend test:unit -- 'admin-mother|admin-permissions|group-rules-sql'` and `pnpm --filter @nanny-app/backend typecheck`.
Expected: PASS.

Run: `tmux new -d -s nanny-a45 "pnpm --filter @nanny-app/backend test:integration -- 'a45|a35|a36|a12' 2>&1 | tee ~/logs/nanny-a45.log"`; `tail -60 ~/logs/nanny-a45.log` when done.
Expected: PASS — a45 in full; a35 (static groups, rename via the new update schema), a36 (picker) and a12 (operator matrix, now including `POST /groups/rules-preview`) unchanged.

- [ ] **Step 10: Commit**

```bash
git add apps/backend
git commit -F - <<'EOF'
feat(backend): static and dynamic groups, rules preview, last app open in picker and Mothers list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
```

---

### Task 6: Notification templates CRUD and audience preview (backend)

> Note: beyond the contract, this task exports `BROADCAST_INCLUDE` / `BroadcastRow` (the row shape `toBroadcastDto` takes) and `audienceSummary` from the template service, adds `listLiveDeviceTokens(userIds)` to `notification.service.ts` (the token lookup both the preview and Task 7's send use — chunked, because a `GROUPS` audience can exceed Postgres' bind-parameter limit), and creates the test helper `apps/backend/test/journeys/notification.ts`.

**Files:**
- Create: `apps/backend/src/services/admin-notification-template.service.ts`
- Modify: `apps/backend/src/services/notification.service.ts`, `apps/backend/src/routes/admin.routes.ts`, `apps/backend/src/lib/admin-permissions.ts`
- Create: `apps/backend/test/journeys/notification.ts`
- Test: `apps/backend/src/__integration__/journeys/a46-notification-templates.test.ts`, `apps/backend/src/__tests__/admin-permissions.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces: `src/services/admin-notification-template.service.ts`:
  - `listNotificationTemplates(): Promise<NotificationTemplateListItem[]>` (newest `updatedAt` first, non-deleted).
  - `getNotificationTemplate(id): Promise<NotificationTemplate>` (404 `'Notification template not found.'`).
  - `createNotificationTemplate(adminId, input: NotificationTemplateValues): Promise<NotificationTemplate>`; `updateNotificationTemplate(id, input)`; `deleteNotificationTemplate(id): Promise<void>` (soft).
  - Save-time validation: packageId/promoCodeId must exist and not be soft-deleted (400 `'That package no longer exists.'` / `'That promo code no longer exists.'`); MOTHERS ids must be receivable mothers (400 `"Some of the chosen people can't receive notifications — only active mothers can."`); GROUPS ids must exist (400 `'One of the chosen groups no longer exists.'`).
  - `resolveNotificationAudience(audience: NotificationAudience): Promise<{ userIds: number[]; skippedGroupIds: number[] }>` (MOTHERS: filter through the receivable base, no throw; GROUPS: `resolveGroupMembers`).
  - `previewNotificationAudience(audience): Promise<NotificationAudiencePreview>` (`withPushDevice` = recipients with ≥1 live `DeviceToken`).
  - `listTemplateBroadcasts(templateId): Promise<NotificationBroadcast[]>` (newest first; stale `SENDING` mapped to `FAILED`/`"Timed out"`) and helper `toBroadcastDto(row, now = new Date())`.
  - Routes: `GET/POST /admin/notification-templates`, `GET/PATCH/DELETE /admin/notification-templates/:id`, `POST /admin/notification-templates/audience-preview`, `GET /admin/notification-templates/:id/broadcasts`, with permission rows.

- [ ] **Step 1: Add the journey helpers**

`apps/backend/test/journeys/notification.ts`:

```ts
import type { NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../auth';

/** A plain announcement to the given audience; override only what the test is about. */
export function templateInput(
  audience: NotificationTemplateInput['audience'],
  overrides: Partial<NotificationTemplateInput> = {},
): NotificationTemplateInput {
  return {
    name: 'Win-back 30d',
    title: 'We miss you',
    body: 'Book a nanny this week and save 20%.',
    imageUrl: null,
    channel: 'BOTH',
    targetType: null,
    packageId: null,
    promoCodeId: null,
    audience,
    ...overrides,
  };
}

export async function createTemplate(
  adminToken: string,
  input: NotificationTemplateInput,
): Promise<NotificationTemplate> {
  const res = await request(app)
    .post('/admin/notification-templates')
    .set(...authHeader(adminToken))
    .send(input);
  expect(res.status).toBe(201);
  return res.body.data as NotificationTemplate;
}

/** `device_tokens.token` is unique; the pid keeps it so across workers. */
let tokenSeq = 0;

/** Registers a live push device for the user and returns its FCM token. */
export async function giveDevice(userId: number): Promise<string> {
  tokenSeq += 1;
  const token = `fcm-${process.pid}-${tokenSeq}`;
  await prisma.deviceToken.create({ data: { userId, token, platform: 'ANDROID' } });
  return token;
}
```

- [ ] **Step 2: Write the failing integration test**

`apps/backend/src/__integration__/journeys/a46-notification-templates.test.ts`:

```ts
/**
 * A46 — notification templates: what an admin saves before publishing. A
 * template holds content, channel, an optional package/promo link and an
 * audience (groups, or hand-picked mothers); PATCH replaces it whole. Saving
 * refuses links and audiences that point at nothing or at people who can't
 * receive. The audience preview counts deduplicated mothers and those with a
 * live push device. Deleting is soft; send history is read per template.
 */
import type { NotificationTemplateInput } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import {
  makeAdmin,
  makeMother,
  makeNanny,
  makeOperator,
  makePackage,
  makePromoCode,
} from '../../../test/factories';
import { createTemplate, giveDevice, templateInput } from '../../../test/journeys/notification';

const IMAGE = 'https://cdn.example.com/notifications/win-back.jpg';
const BASE = '/admin/notification-templates';

async function makeGroup(token: string, body: object): Promise<number> {
  const res = await request(app).post('/admin/groups').set(...authHeader(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

describe('A46 — notification templates', () => {
  it('creates, reads, lists and fully replaces a template', async () => {
    const admin = await makeAdmin();
    const amal = await makeMother({ firstName: 'Amal' });
    const basma = await makeMother({ firstName: 'Basma' });
    const promo = await makePromoCode({ code: 'SAVE20' });
    const groupId = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });

    const created = await createTemplate(
      admin.token,
      templateInput(
        { type: 'GROUPS', groupIds: [groupId] },
        { imageUrl: IMAGE, targetType: 'PROMO_CODE', promoCodeId: promo.id },
      ),
    );
    expect(created).toMatchObject({
      name: 'Win-back 30d',
      title: 'We miss you',
      body: 'Book a nanny this week and save 20%.',
      imageUrl: IMAGE,
      channel: 'BOTH',
      targetType: 'PROMO_CODE',
      packageId: null,
      promoCodeId: promo.id,
      package: null,
      promoCode: { id: promo.id, code: 'SAVE20' },
      audience: { type: 'GROUPS', groupIds: [groupId] },
      audienceGroups: [{ id: groupId, name: 'Everyone', kind: 'DYNAMIC' }],
      audienceMothers: [],
      publishCount: 0,
      lastPublishedAt: null,
    });

    const fetched = await request(app).get(`${BASE}/${created.id}`).set(...authHeader(admin.token));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data).toEqual(created);

    const list = await request(app).get(BASE).set(...authHeader(admin.token));
    expect(list.body.data).toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Win-back 30d',
        title: 'We miss you',
        channel: 'BOTH',
        targetType: 'PROMO_CODE',
        linkLabel: 'SAVE20',
        audienceSummary: '1 group',
        publishCount: 0,
        lastPublishedAt: null,
      }),
    ]);

    const replaced = await request(app)
      .patch(`${BASE}/${created.id}`)
      .set(...authHeader(admin.token))
      .send(templateInput({ type: 'MOTHERS', motherIds: [basma.id, amal.id, basma.id] }, { name: 'Renamed', channel: 'PUSH' }));
    expect(replaced.status).toBe(200);
    expect(replaced.body.data).toMatchObject({
      name: 'Renamed',
      channel: 'PUSH',
      imageUrl: null,
      targetType: null,
      promoCodeId: null,
      promoCode: null,
      audienceGroups: [],
    });
    expect([...replaced.body.data.audience.motherIds].sort((x: number, y: number) => x - y)).toEqual([amal.id, basma.id]);
    expect(replaced.body.data.audienceMothers.map((m: { name: string }) => m.name).sort()).toEqual([
      'Amal mother',
      'Basma mother',
    ]);

    const relisted = await request(app).get(BASE).set(...authHeader(admin.token));
    expect(relisted.body.data[0]).toMatchObject({ name: 'Renamed', linkLabel: null, audienceSummary: '2 mothers' });
  });

  it('lists templates most recently updated first', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const audience: NotificationTemplateInput['audience'] = { type: 'MOTHERS', motherIds: [mother.id] };
    const first = await createTemplate(admin.token, templateInput(audience, { name: 'First' }));
    await createTemplate(admin.token, templateInput(audience, { name: 'Second' }));
    const names = async () =>
      ((await request(app).get(BASE).set(...authHeader(admin.token))).body.data as { name: string }[]).map((t) => t.name);

    expect(await names()).toEqual(['Second', 'First']);
    await request(app)
      .patch(`${BASE}/${first.id}`)
      .set(...authHeader(admin.token))
      .send(templateInput(audience, { name: 'First' }))
      .expect(200);
    expect(await names()).toEqual(['First', 'Second']);
  });

  it('refuses an over-long title or body and a link without exactly one target', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const pkg = await makePackage();
    const promo = await makePromoCode();
    const audience: NotificationTemplateInput['audience'] = { type: 'MOTHERS', motherIds: [mother.id] };
    const post = (body: object) => request(app).post(BASE).set(...authHeader(admin.token)).send(body);

    const longTitle = await post(templateInput(audience, { title: 'x'.repeat(66) }));
    expect(longTitle.status).toBe(400);
    expect(longTitle.body.error).toMatch(/^title:/);

    const longBody = await post(templateInput(audience, { body: 'x'.repeat(241) }));
    expect(longBody.status).toBe(400);
    expect(longBody.body.error).toMatch(/^body:/);

    for (const link of [
      { targetType: 'PACKAGE' as const, packageId: pkg.id, promoCodeId: promo.id },
      { targetType: 'PACKAGE' as const, packageId: null, promoCodeId: null },
      { targetType: null, packageId: pkg.id, promoCodeId: null },
    ]) {
      const res = await post(templateInput(audience, link));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('targetType: Pick exactly one package or promo code for this link.');
    }

    expect((await post(templateInput({ type: 'MOTHERS', motherIds: [] }))).status).toBe(400);
    expect(await prisma.notificationTemplate.count()).toBe(0);
  });

  it('refuses a link, group or recipient that no longer exists or cannot receive', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const inactive = await makeMother({ isActive: false });
    const nanny = await makeNanny();
    const deletedPackage = await makePackage({ deletedAt: new Date() });
    const deletedPromo = await makePromoCode({ deletedAt: new Date() });
    const groupId = await makeGroup(admin.token, { name: 'Temp' });
    await request(app).delete(`/admin/groups/${groupId}`).set(...authHeader(admin.token)).expect(200);
    const mothers: NotificationTemplateInput['audience'] = { type: 'MOTHERS', motherIds: [mother.id] };
    const cantReceive = "Some of the chosen people can't receive notifications — only active mothers can.";

    const cases: [NotificationTemplateInput, string][] = [
      [templateInput(mothers, { targetType: 'PACKAGE', packageId: deletedPackage.id }), 'That package no longer exists.'],
      [templateInput(mothers, { targetType: 'PROMO_CODE', promoCodeId: deletedPromo.id }), 'That promo code no longer exists.'],
      [templateInput({ type: 'GROUPS', groupIds: [groupId] }), 'One of the chosen groups no longer exists.'],
      [templateInput({ type: 'MOTHERS', motherIds: [mother.id, nanny.id] }), cantReceive],
      [templateInput({ type: 'MOTHERS', motherIds: [inactive.id] }), cantReceive],
    ];
    for (const [input, message] of cases) {
      const res = await request(app).post(BASE).set(...authHeader(admin.token)).send(input);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(message);
    }

    const valid = await createTemplate(admin.token, templateInput(mothers));
    const patched = await request(app)
      .patch(`${BASE}/${valid.id}`)
      .set(...authHeader(admin.token))
      .send(templateInput(mothers, { name: 'Changed', targetType: 'PACKAGE', packageId: deletedPackage.id }));
    expect(patched.status).toBe(400);
    expect((await request(app).get(`${BASE}/${valid.id}`).set(...authHeader(admin.token))).body.data.name).toBe(
      'Win-back 30d',
    );
    expect(await prisma.notificationTemplate.count()).toBe(1);
  });

  it('soft-deletes a template: gone from the list and 404 by id, the row kept', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));

    const del = await request(app).delete(`${BASE}/${template.id}`).set(...authHeader(admin.token));
    expect(del.status).toBe(200);

    expect((await request(app).get(BASE).set(...authHeader(admin.token))).body.data).toEqual([]);
    const gone = await request(app).get(`${BASE}/${template.id}`).set(...authHeader(admin.token));
    expect(gone.status).toBe(404);
    expect(gone.body.error).toBe('Notification template not found.');
    expect((await request(app).delete(`${BASE}/${template.id}`).set(...authHeader(admin.token))).status).toBe(404);
    const row = await prisma.notificationTemplate.findUnique({ where: { id: template.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('previews the audience: deduplicated mothers, and how many have a live push device', async () => {
    const admin = await makeAdmin();
    const a = await makeMother();
    const b = await makeMother();
    await makeMother();
    const nanny = await makeNanny();
    await giveDevice(a.id);
    await giveDevice(a.id);
    const stale = await giveDevice(b.id);
    await prisma.deviceToken.update({ where: { token: stale }, data: { deletedAt: new Date() } });
    await giveDevice(nanny.id);
    const picked = await makeGroup(admin.token, { name: 'Picked' });
    await request(app)
      .post(`/admin/groups/${picked}/members`)
      .set(...authHeader(admin.token))
      .send({ userIds: [a.id, b.id] })
      .expect(200);
    const everyone = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const preview = (audience: object) =>
      request(app).post(`${BASE}/audience-preview`).set(...authHeader(admin.token)).send({ audience });

    const groups = await preview({ type: 'GROUPS', groupIds: [picked, everyone] });
    expect(groups.status).toBe(200);
    expect(groups.body.data).toEqual({ mothers: 3, withPushDevice: 1 });

    // A preview filters hand-picked ids instead of refusing them: the nanny just isn't counted.
    const picks = await preview({ type: 'MOTHERS', motherIds: [a.id, nanny.id] });
    expect(picks.body.data).toEqual({ mothers: 1, withPushDevice: 1 });

    expect((await preview({ type: 'GROUPS', groupIds: [] })).status).toBe(400);
  });

  it("lists a template's send history newest first, with who sent it", async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));
    const history = () => request(app).get(`${BASE}/${template.id}/broadcasts`).set(...authHeader(admin.token));

    expect((await history()).body.data).toEqual([]);

    const seed = (hoursAgo: number, status: 'SENT' | 'PARTIAL') => {
      const at = new Date(Date.now() - hoursAgo * 3_600_000);
      return prisma.notificationBroadcast.create({
        data: {
          templateId: template.id,
          publishedById: admin.id,
          title: 'We miss you',
          body: 'Book a nanny this week and save 20%.',
          channel: 'BOTH',
          audience: { type: 'MOTHERS', motherIds: [mother.id] },
          status,
          targeted: 1,
          inAppCreated: 1,
          pushSent: status === 'SENT' ? 1 : 0,
          pushFailed: status === 'PARTIAL' ? 1 : 0,
          createdAt: at,
          completedAt: at,
        },
      });
    };
    const older = await seed(2, 'SENT');
    const newer = await seed(1, 'PARTIAL');

    const res = await history();
    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { id: number }) => b.id)).toEqual([newer.id, older.id]);
    expect(res.body.data[0]).toMatchObject({
      templateId: template.id,
      status: 'PARTIAL',
      title: 'We miss you',
      channel: 'BOTH',
      targeted: 1,
      inAppCreated: 1,
      pushSent: 0,
      pushFailed: 1,
      noDevice: 0,
      skippedGroupIds: [],
      error: null,
      publishedBy: { id: admin.id, name: 'Test admin' },
      createdAt: newer.createdAt.toISOString(),
    });

    const detail = await request(app).get(`${BASE}/${template.id}`).set(...authHeader(admin.token));
    expect(detail.body.data).toMatchObject({ publishCount: 2, lastPublishedAt: newer.createdAt.toISOString() });
  });

  it('lets a view-only operator read templates but change nothing', async () => {
    const admin = await makeAdmin();
    const viewer = await makeOperator({ notifications: 'VIEW' });
    const mother = await makeMother();
    const input = templateInput({ type: 'MOTHERS', motherIds: [mother.id] });
    const template = await createTemplate(admin.token, input);
    const as = authHeader(viewer.token);

    expect((await request(app).get(BASE).set(...as)).status).toBe(200);
    expect((await request(app).get(`${BASE}/${template.id}`).set(...as)).status).toBe(200);
    expect((await request(app).get(`${BASE}/${template.id}/broadcasts`).set(...as)).status).toBe(200);
    expect((await request(app).post(BASE).set(...as).send(input)).status).toBe(403);
    expect((await request(app).patch(`${BASE}/${template.id}`).set(...as).send(input)).status).toBe(403);
    expect((await request(app).delete(`${BASE}/${template.id}`).set(...as)).status).toBe(403);
    expect(
      (await request(app).post(`${BASE}/audience-preview`).set(...as).send({ audience: input.audience })).status,
    ).toBe(403);
  });
});
```

- [ ] **Step 3: Extend the permission unit test (failing)**

In `apps/backend/src/__tests__/admin-permissions.test.ts`, add after the notifications-manager test from Task 5:

```ts
  it('gates notification templates: VIEW reads, MANAGE writes', () => {
    const view = { notifications: 'VIEW' } satisfies OperatorPermissions;
    const manage = { notifications: 'MANAGE' } satisfies OperatorPermissions;

    expect(allows('GET', '/notification-templates', 'OPERATOR', view)).toBe(true);
    expect(allows('GET', '/notification-templates/4', 'OPERATOR', view)).toBe(true);
    expect(allows('GET', '/notification-templates/4/broadcasts', 'OPERATOR', view)).toBe(true);
    expect(allows('POST', '/notification-templates', 'OPERATOR', view)).toBe(false);
    expect(allows('PATCH', '/notification-templates/4', 'OPERATOR', view)).toBe(false);
    expect(allows('DELETE', '/notification-templates/4', 'OPERATOR', view)).toBe(false);
    expect(allows('POST', '/notification-templates/audience-preview', 'OPERATOR', view)).toBe(false);

    expect(allows('POST', '/notification-templates', 'OPERATOR', manage)).toBe(true);
    expect(allows('POST', '/notification-templates/audience-preview', 'OPERATOR', manage)).toBe(true);
    expect(allows('GET', '/notification-templates', 'OPERATOR', { groups: 'MANAGE' })).toBe(false);
  });
```

- [ ] **Step 4: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/backend test:unit -- admin-permissions`
Expected: FAIL — the notification-template paths resolve to no requirement.

Run: `tmux new -d -s nanny-a46 "pnpm --filter @nanny-app/backend test:integration -- a46 2>&1 | tee ~/logs/nanny-a46.log"`; `tail -60 ~/logs/nanny-a46.log` when done.
Expected: FAIL — every request answers 403 (no `ADMIN_ROUTE_PERMISSIONS` entry, deny-by-default).

- [ ] **Step 5: Add the token lookup to `notification.service.ts`**

Add after `dispatchPush`:

```ts
/** Kept well under Postgres' 32,767 bind parameters per statement. */
const TOKEN_LOOKUP_CHUNK = 10_000;

/** Every live push token of these users, chunked so a large audience stays one bind list per query. */
export async function listLiveDeviceTokens(userIds: number[]): Promise<{ userId: number; token: string }[]> {
  const tokens: { userId: number; token: string }[] = [];
  for (let i = 0; i < userIds.length; i += TOKEN_LOOKUP_CHUNK) {
    const rows = await prisma.deviceToken.findMany({
      where: { userId: { in: userIds.slice(i, i + TOKEN_LOOKUP_CHUNK) }, deletedAt: null },
      select: { userId: true, token: true },
    });
    tokens.push(...rows);
  }
  return tokens;
}
```

- [ ] **Step 6: Implement `apps/backend/src/services/admin-notification-template.service.ts`**

```ts
import { type Prisma, Role } from '@prisma/client';

import type {
  NotificationAudience,
  NotificationAudiencePreview,
  NotificationBroadcast,
  NotificationTemplate,
  NotificationTemplateListItem,
  NotificationTemplateValues,
} from '@nanny-app/shared';
import { BROADCAST_STALE_MS, NotificationAudienceSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { displayName } from '@backend/lib/display-name';
import { errors } from '@backend/lib/errors';
import { resolveGroupMembers } from '@backend/services/group-audience.service';
import { listLiveDeviceTokens } from '@backend/services/notification.service';

/** Who can receive an announcement: an active, non-deleted mother. Never a nanny. */
const RECEIVABLE_MOTHER: Prisma.UserWhereInput = { role: Role.MOTHER, deletedAt: null, isActive: true };

const TEMPLATE_INCLUDE = {
  package: { select: { id: true, name: true } },
  promoCode: { select: { id: true, code: true } },
  // The newest publish only — for "last published"; the count comes from _count.
  broadcasts: { select: { createdAt: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
  _count: { select: { broadcasts: true } },
} satisfies Prisma.NotificationTemplateInclude;

type TemplateRow = Prisma.NotificationTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>;

export const BROADCAST_INCLUDE = {
  publishedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.NotificationBroadcastInclude;

export type BroadcastRow = Prisma.NotificationBroadcastGetPayload<{ include: typeof BROADCAST_INCLUDE }>;

function countLabel(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** "2 groups" / "1 group" / "37 mothers" / "1 mother" — the list's audience column. */
export function audienceSummary(audience: NotificationAudience): string {
  return audience.type === 'GROUPS'
    ? countLabel(audience.groupIds.length, 'group', 'groups')
    : countLabel(audience.motherIds.length, 'mother', 'mothers');
}

function linkLabel(row: TemplateRow): string | null {
  if (row.targetType === 'PACKAGE') return row.package?.name ?? null;
  if (row.targetType === 'PROMO_CODE') return row.promoCode?.code ?? null;
  return null;
}

function toListItem(row: TemplateRow): NotificationTemplateListItem {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    channel: row.channel,
    targetType: row.targetType,
    linkLabel: linkLabel(row),
    audienceSummary: audienceSummary(NotificationAudienceSchema.parse(row.audience)),
    publishCount: row._count.broadcasts,
    lastPublishedAt: row.broadcasts[0]?.createdAt.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The editor's view: the audience with group names/kinds and mother names resolved. */
async function toTemplateDto(row: TemplateRow): Promise<NotificationTemplate> {
  const audience = NotificationAudienceSchema.parse(row.audience);
  let audienceGroups: NotificationTemplate['audienceGroups'] = [];
  let audienceMothers: NotificationTemplate['audienceMothers'] = [];

  // In the template's order. A group or mother gone since saving is left out;
  // publish reports a deleted group as skipped.
  if (audience.type === 'GROUPS') {
    const groups = await prisma.userGroup.findMany({
      where: { id: { in: audience.groupIds }, deletedAt: null },
      select: { id: true, name: true, kind: true },
    });
    const byId = new Map(groups.map((g) => [g.id, g]));
    audienceGroups = audience.groupIds.flatMap((id) => {
      const group = byId.get(id);
      return group ? [{ id: group.id, name: group.name, kind: group.kind }] : [];
    });
  } else {
    const mothers = await prisma.user.findMany({
      where: { id: { in: audience.motherIds }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    const byId = new Map(mothers.map((m) => [m.id, m]));
    audienceMothers = audience.motherIds.flatMap((id) => {
      const mother = byId.get(id);
      return mother ? [{ id: mother.id, name: displayName(mother.firstName, mother.lastName) }] : [];
    });
  }

  return {
    id: row.id,
    name: row.name,
    title: row.title,
    body: row.body,
    imageUrl: row.imageUrl,
    channel: row.channel,
    targetType: row.targetType,
    packageId: row.packageId,
    promoCodeId: row.promoCodeId,
    package: row.package,
    promoCode: row.promoCode,
    audience,
    audienceGroups,
    audienceMothers,
    publishCount: row._count.broadcasts,
    lastPublishedAt: row.broadcasts[0]?.createdAt.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireTemplate(id: number): Promise<TemplateRow> {
  const row = await prisma.notificationTemplate.findFirst({ where: { id, deletedAt: null }, include: TEMPLATE_INCLUDE });
  if (!row) throw errors.notFound('Notification template not found.');
  return row;
}

/**
 * What a save checks against the database. Whether a promo is still active or
 * unexpired is checked at publish (Task 7): a template may be prepared ahead.
 */
async function assertSavable(input: NotificationTemplateValues): Promise<void> {
  if (input.targetType === 'PACKAGE') {
    const pkg = await prisma.package.findFirst({ where: { id: input.packageId ?? -1, deletedAt: null }, select: { id: true } });
    if (!pkg) throw errors.badRequest('That package no longer exists.');
  }
  if (input.targetType === 'PROMO_CODE') {
    const promo = await prisma.promoCode.findFirst({
      where: { id: input.promoCodeId ?? -1, deletedAt: null },
      select: { id: true },
    });
    if (!promo) throw errors.badRequest('That promo code no longer exists.');
  }

  const { audience } = input;
  if (audience.type === 'GROUPS') {
    const live = await prisma.userGroup.count({ where: { id: { in: audience.groupIds }, deletedAt: null } });
    if (live !== audience.groupIds.length) throw errors.badRequest('One of the chosen groups no longer exists.');
  } else {
    const receivable = await prisma.user.count({ where: { id: { in: audience.motherIds }, ...RECEIVABLE_MOTHER } });
    if (receivable !== audience.motherIds.length) {
      throw errors.badRequest("Some of the chosen people can't receive notifications — only active mothers can.");
    }
  }
}

/** The columns a create or a full-replace update writes. The ids follow targetType. */
function templateData(input: NotificationTemplateValues) {
  return {
    name: input.name,
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl,
    channel: input.channel,
    targetType: input.targetType,
    packageId: input.targetType === 'PACKAGE' ? input.packageId : null,
    promoCodeId: input.targetType === 'PROMO_CODE' ? input.promoCodeId : null,
    audience: input.audience as Prisma.InputJsonValue,
  };
}

export async function listNotificationTemplates(): Promise<NotificationTemplateListItem[]> {
  const rows = await prisma.notificationTemplate.findMany({
    where: { deletedAt: null },
    include: TEMPLATE_INCLUDE,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map(toListItem);
}

export async function getNotificationTemplate(id: number): Promise<NotificationTemplate> {
  return toTemplateDto(await requireTemplate(id));
}

export async function createNotificationTemplate(
  adminId: number,
  input: NotificationTemplateValues,
): Promise<NotificationTemplate> {
  await assertSavable(input);
  const row = await prisma.notificationTemplate.create({
    data: { ...templateData(input), createdById: adminId },
    include: TEMPLATE_INCLUDE,
  });
  return toTemplateDto(row);
}

/** A full replace: the editor always sends the whole template. */
export async function updateNotificationTemplate(
  id: number,
  input: NotificationTemplateValues,
): Promise<NotificationTemplate> {
  await requireTemplate(id);
  await assertSavable(input);
  const row = await prisma.notificationTemplate.update({
    where: { id },
    data: templateData(input),
    include: TEMPLATE_INCLUDE,
  });
  return toTemplateDto(row);
}

/** Soft delete; its broadcasts and the inbox rows they wrote stay. */
export async function deleteNotificationTemplate(id: number): Promise<void> {
  await requireTemplate(id);
  await prisma.notificationTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Who a template would reach right now: hand-picked ids filtered through the
 * receivable base (a mother deactivated since saving is dropped, not refused),
 * or the union of the groups. Sorted, deduplicated.
 */
export async function resolveNotificationAudience(
  audience: NotificationAudience,
): Promise<{ userIds: number[]; skippedGroupIds: number[] }> {
  if (audience.type === 'GROUPS') return resolveGroupMembers(audience.groupIds);
  const rows = await prisma.user.findMany({
    where: { id: { in: audience.motherIds }, ...RECEIVABLE_MOTHER },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return { userIds: rows.map((r) => r.id), skippedGroupIds: [] };
}

/** "1,240 mothers · 1,031 with push enabled" in the editor. */
export async function previewNotificationAudience(
  audience: NotificationAudience,
): Promise<NotificationAudiencePreview> {
  const { userIds } = await resolveNotificationAudience(audience);
  const tokens = await listLiveDeviceTokens(userIds);
  return { mothers: userIds.length, withPushDevice: new Set(tokens.map((t) => t.userId)).size };
}

/**
 * A broadcast as the console shows it. One still SENDING after
 * BROADCAST_STALE_MS was cut off (the serverless function was killed): it reads
 * as FAILED / "Timed out", and Task 7's publish guard ignores it.
 */
export function toBroadcastDto(row: BroadcastRow, now: Date = new Date()): NotificationBroadcast {
  const timedOut = row.status === 'SENDING' && now.getTime() - row.createdAt.getTime() > BROADCAST_STALE_MS;
  return {
    id: row.id,
    templateId: row.templateId,
    status: timedOut ? 'FAILED' : row.status,
    title: row.title,
    channel: row.channel,
    targeted: row.targeted,
    inAppCreated: row.inAppCreated,
    pushSent: row.pushSent,
    pushFailed: row.pushFailed,
    noDevice: row.noDevice,
    skippedGroupIds: row.skippedGroups,
    error: timedOut ? 'Timed out' : row.error,
    publishedBy: { id: row.publishedBy.id, name: displayName(row.publishedBy.firstName, row.publishedBy.lastName) },
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function listTemplateBroadcasts(templateId: number): Promise<NotificationBroadcast[]> {
  await requireTemplate(templateId);
  const rows = await prisma.notificationBroadcast.findMany({
    where: { templateId },
    include: BROADCAST_INCLUDE,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const now = new Date();
  return rows.map((row) => toBroadcastDto(row, now));
}
```

(`NotificationBroadcast` has no `deletedAt` (Task 2): broadcasts are history and are never deleted. It does have `updatedAt`, which Prisma maintains when Task 7 writes the outcome; the DTO does not expose it.)

- [ ] **Step 7: Routes**

In `admin.routes.ts`, add `NotificationAudiencePreviewInputSchema,` and `NotificationTemplateInputSchema,` to the `@nanny-app/shared` import, import the service:

```ts
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  getNotificationTemplate,
  listNotificationTemplates,
  listTemplateBroadcasts,
  previewNotificationAudience,
  updateNotificationTemplate,
} from '@backend/services/admin-notification-template.service';
```

and add a block after the Surveys block:

```ts
// ── Notification center (admin announcements to mothers) ───────

adminRouter.get('/notification-templates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listNotificationTemplates()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/notification-templates',
  validateBody(NotificationTemplateInputSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.adminUser) throw errors.unauthorized();
      res.status(201).json(ok(await createNotificationTemplate(req.adminUser.id, req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/notification-templates/audience-preview',
  validateBody(NotificationAudiencePreviewInputSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await previewNotificationAudience(req.body.audience)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/notification-templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getNotificationTemplate(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});

adminRouter.patch(
  '/notification-templates/:id',
  validateBody(NotificationTemplateInputSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateNotificationTemplate(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete('/notification-templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteNotificationTemplate(routeIdParam(req.params.id));
    res.json(ok(null));
  } catch (err) {
    next(err);
  }
});

adminRouter.get(
  '/notification-templates/:id/broadcasts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await listTemplateBroadcasts(routeIdParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);
```

- [ ] **Step 8: Permissions**

In `admin-permissions.ts`, after the Surveys rows:

```ts
  // ── Notifications (admin-composed announcements to mothers) ──
  { method: 'GET', pattern: '/notification-templates', requires: section('notifications', 'VIEW') },
  { method: 'POST', pattern: '/notification-templates', requires: section('notifications', 'MANAGE') },
  // Resolves an audience being edited — part of writing a template, not a read of one.
  { method: 'POST', pattern: '/notification-templates/audience-preview', requires: section('notifications', 'MANAGE') },
  { method: 'GET', pattern: '/notification-templates/:id', requires: section('notifications', 'VIEW') },
  { method: 'PATCH', pattern: '/notification-templates/:id', requires: section('notifications', 'MANAGE') },
  { method: 'DELETE', pattern: '/notification-templates/:id', requires: section('notifications', 'MANAGE') },
  { method: 'GET', pattern: '/notification-templates/:id/broadcasts', requires: section('notifications', 'VIEW') },
```

- [ ] **Step 9: Run the tests**

Run: `pnpm --filter @nanny-app/backend test:unit -- admin-permissions` and `pnpm --filter @nanny-app/backend typecheck`.
Expected: PASS (the router walk finds every new route declared).

Run: `tmux new -d -s nanny-a46 "pnpm --filter @nanny-app/backend test:integration -- 'a46|a12' 2>&1 | tee ~/logs/nanny-a46.log"`; `tail -60 ~/logs/nanny-a46.log` when done.
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/backend
git commit -F - <<'EOF'
feat(backend): notification templates — CRUD, save-time checks, audience preview, send history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
```

---

### Task 7: Publish and batched push (backend)

> Note: the spec lists the 409 check as step 2, before resolving recipients. Here it runs inside the transaction that inserts the broadcast, after a `SELECT … FOR UPDATE` on the template row, so two concurrent publishes of one template are serialised and the second sees the first's `SENDING` row. A consequence: a publish whose link is invalid or whose audience is empty answers 400 even while another publish is sending. The contract leaves the per-case link messages open; they are defined below and asserted in a47.
> Note: FCM is unreachable in integration (the Admin SDK is initialised for the Auth emulator only, with no credential), and no existing journey sends a real push — they register no device tokens, so `dispatchPush` returns early. a47 registers tokens and replaces `firebaseMessaging.sendEachForMulticast` with a `jest.spyOn` stub (the same spy-on-a-live-object pattern a43 uses for Prisma), which also records exactly what was sent.

**Files:**
- Modify: `apps/backend/src/services/notification.service.ts`
- Create: `apps/backend/src/services/notification-broadcast.service.ts`
- Modify: `apps/backend/src/routes/admin.routes.ts`, `apps/backend/src/lib/admin-permissions.ts`, `apps/backend/test/journeys/notification.ts`
- Test: `apps/backend/src/__tests__/notification-push-batch.test.ts`, `apps/backend/src/__integration__/journeys/a47-notification-publish.test.ts`, `apps/backend/src/__tests__/admin-permissions.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1, 2, 6.
- Produces:
  - `notification.service.ts`: `dispatchPushToTokens(tokens: string[], message: { title: string; body: string; imageUrl?: string | null; data: Record<string, string> }): Promise<{ sent: number; failed: number }>` — batches of 500, 4 concurrent, soft-deletes not-registered/invalid tokens using the same error-code check as `dispatchPush`; sets `notification.imageUrl` and `android.notification.imageUrl` when an image is given.
  - `src/services/notification-broadcast.service.ts`: `publishNotificationTemplate(templateId: number, adminId: number): Promise<NotificationBroadcast>` implementing the spec's 7-step flow and error table (404 / 400 link / 400 empty `'No mothers match this audience.'` / 409 `'This notification is already being sent.'`). Push `data`: `{ type: 'ANNOUNCEMENT', broadcastId, targetType?, packageId?, promoCode? }` (strings, keys omitted when absent).
  - Route `POST /admin/notification-templates/:id/publish` → 201 with the broadcast; permission row.

- [ ] **Step 1: Write the failing unit test for the batched sender**

`apps/backend/src/__tests__/notification-push-batch.test.ts`:

```ts
/**
 * The broadcast push sender: FCM multicast in batches of 500 tokens, at most 4
 * batches in flight, dead tokens soft-deleted with the same error-code check as
 * the per-user dispatchPush, and an exact sent/failed tally — including a batch
 * whose whole call throws.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: { deviceToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } },
}));
jest.mock('@backend/lib/firebase', () => ({
  firebaseMessaging: { sendEachForMulticast: jest.fn() },
}));

import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';

import { prisma } from '@backend/db/prisma';
import { firebaseMessaging } from '@backend/lib/firebase';
import { dispatchPushToTokens } from '@backend/services/notification.service';

const send = firebaseMessaging.sendEachForMulticast as unknown as jest.Mock<
  Promise<BatchResponse>,
  [MulticastMessage]
>;
const updateMany = prisma.deviceToken.updateMany as unknown as jest.Mock;

const MESSAGE = {
  title: 'We miss you',
  body: 'Book this week and save 20%.',
  data: { type: 'ANNOUNCEMENT', broadcastId: '7' },
};
const IMAGE = 'https://cdn.example.com/notifications/win-back.jpg';

const tokens = (n: number): string[] => Array.from({ length: n }, (_, i) => `tok-${i}`);

function deliverAll(message: MulticastMessage): BatchResponse {
  return {
    successCount: message.tokens.length,
    failureCount: 0,
    responses: message.tokens.map(() => ({ success: true, messageId: 'm' })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  send.mockImplementation(async (message) => deliverAll(message));
});

describe('dispatchPushToTokens', () => {
  it('sends 1,201 tokens as three multicasts of 500, 500 and 201', async () => {
    const result = await dispatchPushToTokens(tokens(1201), MESSAGE);

    expect(send.mock.calls.map(([message]) => message.tokens.length)).toEqual([500, 500, 201]);
    expect(send.mock.calls.flatMap(([message]) => message.tokens)).toEqual(tokens(1201));
    expect(result).toEqual({ sent: 1201, failed: 0 });
  });

  it('keeps at most 4 batches in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    send.mockImplementation(async (message) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return deliverAll(message);
    });

    const result = await dispatchPushToTokens(tokens(5000), MESSAGE);

    expect(send).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
    expect(result).toEqual({ sent: 5000, failed: 0 });
  });

  it('puts the image on the notification and on the Android notification', async () => {
    await dispatchPushToTokens(['a'], { ...MESSAGE, imageUrl: IMAGE });

    expect(send).toHaveBeenCalledWith({
      tokens: ['a'],
      notification: { title: MESSAGE.title, body: MESSAGE.body, imageUrl: IMAGE },
      android: { notification: { imageUrl: IMAGE } },
      data: MESSAGE.data,
    });
  });

  it('sends no imageUrl and no android block without an image', async () => {
    await dispatchPushToTokens(['a'], { ...MESSAGE, imageUrl: null });

    const [message] = send.mock.calls[0]!;
    expect(message.notification).toEqual({ title: MESSAGE.title, body: MESSAGE.body });
    expect(message.android).toBeUndefined();
  });

  it('soft-deletes dead tokens and counts every failure', async () => {
    send.mockImplementationOnce(async () => {
      const response = {
        successCount: 1,
        failureCount: 3,
        responses: [
          { success: true, messageId: 'm' },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: false, error: { code: 'messaging/invalid-registration-token' } },
          { success: false, error: { code: 'messaging/internal-error' } },
        ],
      };
      return response as unknown as BatchResponse;
    });

    const result = await dispatchPushToTokens(['ok', 'gone', 'bad', 'flaky'], MESSAGE);

    expect(result).toEqual({ sent: 1, failed: 3 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { token: { in: ['gone', 'bad'] }, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('counts a batch whose call throws as failed and still sends the others', async () => {
    send.mockRejectedValueOnce(new Error('FCM unavailable'));

    const result = await dispatchPushToTokens(tokens(700), MESSAGE);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 200, failed: 500 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('sends each token once and nothing for an empty list', async () => {
    await dispatchPushToTokens(['a', 'b', 'a'], MESSAGE);
    expect(send.mock.calls[0]![0].tokens).toEqual(['a', 'b']);

    send.mockClear();
    expect(await dispatchPushToTokens([], MESSAGE)).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/backend test:unit -- notification-push-batch`
Expected: FAIL — `dispatchPushToTokens` is not exported (TS2305 from ts-jest).

- [ ] **Step 3: Implement `dispatchPushToTokens` in `notification.service.ts`**

Add the import beside the other type imports:

```ts
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
```

Add above `dispatchPush`:

```ts
/** FCM codes meaning a token will never work again: the app was removed or the token rotated. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

function isDeadToken(code: string | undefined): boolean {
  return code !== undefined && DEAD_TOKEN_CODES.has(code);
}
```

In `dispatchPush`, replace the two-line `if (result.error?.code === … || result.error?.code === …)` condition with:

```ts
      if (isDeadToken(result.error?.code)) {
```

and add after `dispatchPush`:

```ts
/** FCM's multicast limit. */
export const PUSH_MULTICAST_SIZE = 500;
/** Batches in flight at once: 10k mothers is ~20 calls, well inside the 60 s function limit. */
export const PUSH_CONCURRENCY = 4;

export interface BroadcastPushMessage {
  title: string;
  body: string;
  imageUrl?: string | null;
  data: Record<string, string>;
}

function multicastFor(tokens: string[], message: BroadcastPushMessage): MulticastMessage {
  const image = message.imageUrl ?? undefined;
  return {
    tokens,
    notification: { title: message.title, body: message.body, ...(image ? { imageUrl: image } : {}) },
    // Android shows the image in the banner. iOS banners stay text-only until a
    // Notification Service Extension ships (out of scope).
    ...(image ? { android: { notification: { imageUrl: image } } } : {}),
    data: message.data,
  };
}

/**
 * One message to many devices — the announcement fan-out. Tokens go out in
 * multicasts of 500, four at a time. A dead token is soft-deleted; any other
 * failure, or a whole call that throws, is only counted. Transactional pushes
 * keep using the per-user dispatchPush.
 */
export async function dispatchPushToTokens(
  tokens: string[],
  message: BroadcastPushMessage,
): Promise<{ sent: number; failed: number }> {
  const unique = [...new Set(tokens)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += PUSH_MULTICAST_SIZE) {
    batches.push(unique.slice(i, i + PUSH_MULTICAST_SIZE));
  }

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  let next = 0;

  // Each worker takes the next unsent batch; taking it is synchronous, so no two share one.
  async function worker(): Promise<void> {
    while (next < batches.length) {
      const batch = batches[next];
      next += 1;
      if (!batch) return;
      let response: BatchResponse;
      try {
        response = await firebaseMessaging.sendEachForMulticast(multicastFor(batch, message));
      } catch {
        failed += batch.length;
        continue;
      }
      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((result, index) => {
        const token = batch[index];
        if (token && isDeadToken(result.error?.code)) dead.push(token);
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, batches.length) }, () => worker()));

  if (dead.length > 0) {
    await prisma.deviceToken.updateMany({
      where: { token: { in: dead }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
  return { sent, failed };
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm --filter @nanny-app/backend test:unit -- 'notification-push-batch|notification-type-map'`
Expected: PASS.

- [ ] **Step 5: Add publish helpers to the journey file**

In `apps/backend/test/journeys/notification.ts`, replace the import block with:

```ts
import type { NotificationBroadcast, NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { firebaseMessaging } from '@backend/lib/firebase';

import { authHeader } from '../auth';
```

and append:

```ts
export async function publishTemplate(adminToken: string, templateId: number): Promise<NotificationBroadcast> {
  const res = await request(app)
    .post(`/admin/notification-templates/${templateId}/publish`)
    .set(...authHeader(adminToken));
  expect(res.status).toBe(201);
  return res.body.data as NotificationBroadcast;
}

/** FCM's answer when every token in the multicast took the message. */
export function deliverAll(message: MulticastMessage): BatchResponse {
  return {
    successCount: message.tokens.length,
    failureCount: 0,
    responses: message.tokens.map(() => ({ success: true, messageId: 'test-message' })),
  };
}

/**
 * Stands in for FCM. Integration runs have no FCM credentials (the Admin SDK
 * is initialised for the Auth emulator only), so a real send would fail every
 * batch; the spy also records exactly what was sent. Undo with
 * `jest.restoreAllMocks()`.
 */
export function spyOnPush() {
  return jest
    .spyOn(firebaseMessaging, 'sendEachForMulticast')
    .mockImplementation(async (message) => deliverAll(message));
}
```

- [ ] **Step 6: Write the failing integration test**

`apps/backend/src/__integration__/journeys/a47-notification-publish.test.ts`:

```ts
/**
 * A47 — publishing a notification template. A publish snapshots the template
 * into a NotificationBroadcast, writes one ANNOUNCEMENT inbox row per mother
 * (linked to the broadcast) unless the channel is push-only, and pushes to
 * every live device unless it is in-app-only. A mother reached through two
 * groups gets one row and one push per device. Publishing is refused, with
 * nothing sent, when the link went bad since saving, when nobody matches, or
 * while another publish of the template is still sending — unless that one has
 * been stuck for over five minutes, when it reads as timed out instead.
 */
import type { Prisma } from '@prisma/client';
import type { BatchResponse } from 'firebase-admin/messaging';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeOperator, makePackage, makePromoCode } from '../../../test/factories';
import {
  createTemplate,
  giveDevice,
  publishTemplate,
  spyOnPush,
  templateInput,
} from '../../../test/journeys/notification';

const IMAGE = 'https://cdn.example.com/notifications/win-back.jpg';
const BODY = 'Book a nanny this week and save 20%.';
const BASE = '/admin/notification-templates';
const MINUTE = 60_000;

const announcements = (where: Prisma.NotificationWhereInput = {}) =>
  prisma.notification.count({ where: { type: 'ANNOUNCEMENT', ...where } });

async function makeGroup(token: string, body: object): Promise<number> {
  const res = await request(app).post('/admin/groups').set(...authHeader(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

/** A broadcast another request started at `startedAt` and is (or was) still sending. */
function seedSending(templateId: number, publishedById: number, startedAt: Date) {
  return prisma.notificationBroadcast.create({
    data: {
      templateId,
      publishedById,
      title: 'We miss you',
      body: BODY,
      channel: 'BOTH',
      audience: { type: 'MOTHERS', motherIds: [] },
      status: 'SENDING',
      createdAt: startedAt,
    },
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('A47 — publishing a template', () => {
  it('sends in-app and push, linking every inbox row to its broadcast', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const [a, b, c] = [await makeMother(), await makeMother(), await makeMother()];
    const tokenA = await giveDevice(a.id);
    const tokenB = await giveDevice(b.id);
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [a.id, b.id, c.id] }));

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({
      templateId: template.id,
      status: 'SENT',
      title: 'We miss you',
      channel: 'BOTH',
      targeted: 3,
      inAppCreated: 3,
      pushSent: 2,
      pushFailed: 0,
      noDevice: 1,
      skippedGroupIds: [],
      error: null,
      publishedBy: { id: admin.id, name: 'Test admin' },
    });
    expect(broadcast.completedAt).toEqual(expect.any(String));

    const rows = await prisma.notification.findMany({ where: { type: 'ANNOUNCEMENT' }, orderBy: { userId: 'asc' } });
    expect(rows.map((r) => [r.userId, r.broadcastId, r.title, r.body, r.isRead])).toEqual(
      [a, b, c].map((m) => [m.id, broadcast.id, 'We miss you', BODY, false]),
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect([...send.mock.calls[0]![0].tokens].sort()).toEqual([tokenA, tokenB].sort());

    const detail = await request(app).get(`${BASE}/${template.id}`).set(...authHeader(admin.token));
    expect(detail.body.data).toMatchObject({ publishCount: 1, lastPublishedAt: broadcast.createdAt });
    const history = await request(app).get(`${BASE}/${template.id}/broadcasts`).set(...authHeader(admin.token));
    expect(history.body.data).toEqual([broadcast]);
  });

  it('push-only writes no inbox row; in-app-only sends no push', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    await giveDevice(mother.id);
    const audience = { type: 'MOTHERS' as const, motherIds: [mother.id] };

    const pushOnly = await createTemplate(admin.token, templateInput(audience, { name: 'Push', channel: 'PUSH' }));
    const pushed = await publishTemplate(admin.token, pushOnly.id);
    expect(pushed).toMatchObject({ status: 'SENT', targeted: 1, inAppCreated: 0, pushSent: 1, noDevice: 0 });
    expect(await announcements()).toBe(0);

    const inboxOnly = await createTemplate(admin.token, templateInput(audience, { name: 'Inbox', channel: 'IN_APP' }));
    const posted = await publishTemplate(admin.token, inboxOnly.id);
    expect(posted).toMatchObject({ status: 'SENT', targeted: 1, inAppCreated: 1, pushSent: 0, pushFailed: 0, noDevice: 0 });
    expect(await announcements({ broadcastId: posted.id })).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a mother in two groups gets one inbox row and one push per device', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const both = await makeMother();
    const other = await makeMother();
    const phone = await giveDevice(both.id);
    const tablet = await giveDevice(both.id);
    const picked = await makeGroup(admin.token, { name: 'Picked' });
    await request(app)
      .post(`/admin/groups/${picked}/members`)
      .set(...authHeader(admin.token))
      .send({ userIds: [both.id] })
      .expect(200);
    const everyone = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const template = await createTemplate(admin.token, templateInput({ type: 'GROUPS', groupIds: [picked, everyone] }));

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({ status: 'SENT', targeted: 2, inAppCreated: 2, pushSent: 2, noDevice: 1 });
    expect(await announcements({ userId: both.id })).toBe(1);
    expect(await announcements({ userId: other.id })).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect([...send.mock.calls[0]![0].tokens].sort()).toEqual([phone, tablet].sort());
  });

  it('carries the link and the image in the push, and snapshots them on the broadcast', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    await giveDevice(mother.id);
    const promo = await makePromoCode({ code: 'SAVE20' });
    const pkg = await makePackage();
    const audience = { type: 'MOTHERS' as const, motherIds: [mother.id] };

    const promoTemplate = await createTemplate(
      admin.token,
      templateInput(audience, { name: 'Promo', imageUrl: IMAGE, targetType: 'PROMO_CODE', promoCodeId: promo.id }),
    );
    const promoSend = await publishTemplate(admin.token, promoTemplate.id);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        notification: { title: 'We miss you', body: BODY, imageUrl: IMAGE },
        android: { notification: { imageUrl: IMAGE } },
        data: { type: 'ANNOUNCEMENT', broadcastId: String(promoSend.id), targetType: 'PROMO_CODE', promoCode: 'SAVE20' },
      }),
    );
    expect(await prisma.notificationBroadcast.findUniqueOrThrow({ where: { id: promoSend.id } })).toMatchObject({
      imageUrl: IMAGE,
      targetType: 'PROMO_CODE',
      packageId: null,
      promoCodeId: promo.id,
      promoCodeText: 'SAVE20',
    });

    const packageTemplate = await createTemplate(
      admin.token,
      templateInput(audience, { name: 'Package', targetType: 'PACKAGE', packageId: pkg.id }),
    );
    const packageSend = await publishTemplate(admin.token, packageTemplate.id);
    const packageMessage = send.mock.calls[1]![0];
    expect(packageMessage.data).toEqual({
      type: 'ANNOUNCEMENT',
      broadcastId: String(packageSend.id),
      targetType: 'PACKAGE',
      packageId: String(pkg.id),
    });
    expect(packageMessage.notification).toEqual({ title: 'We miss you', body: BODY });
    expect(packageMessage.android).toBeUndefined();

    const plain = await createTemplate(admin.token, templateInput(audience, { name: 'Plain' }));
    const plainSend = await publishTemplate(admin.token, plain.id);
    expect(send.mock.calls[2]![0].data).toEqual({ type: 'ANNOUNCEMENT', broadcastId: String(plainSend.id) });
  });

  it('counts a dead token as failed, removes it, and reports PARTIAL', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const a = await makeMother();
    const b = await makeMother();
    const live = await giveDevice(a.id);
    const dead = await giveDevice(b.id);
    send.mockImplementationOnce(async (message) => {
      const response = {
        successCount: 1,
        failureCount: 1,
        responses: message.tokens.map((token) =>
          token === dead
            ? { success: false, error: { code: 'messaging/registration-token-not-registered', message: 'gone' } }
            : { success: true, messageId: 'test-message' },
        ),
      };
      return response as unknown as BatchResponse;
    });
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [a.id, b.id] }));

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({ status: 'PARTIAL', inAppCreated: 2, pushSent: 1, pushFailed: 1, noDevice: 0 });
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token: dead } })).deletedAt).not.toBeNull();
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token: live } })).deletedAt).toBeNull();
  });

  it('records groups deleted since saving as skipped and still sends to the rest', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const kept = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const dropped = await makeGroup(admin.token, { name: 'Dropped' });
    const template = await createTemplate(admin.token, templateInput({ type: 'GROUPS', groupIds: [kept, dropped] }));
    await request(app).delete(`/admin/groups/${dropped}`).set(...authHeader(admin.token)).expect(200);

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({ status: 'SENT', targeted: 1, inAppCreated: 1, skippedGroupIds: [dropped] });
    expect(await announcements({ userId: mother.id })).toBe(1);
  });

  it('marks the broadcast FAILED and sends no push when an in-app chunk fails', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    await giveDevice(mother.id);
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));
    jest.spyOn(prisma.notification, 'createMany').mockRejectedValueOnce(new Error('disk full'));

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({ status: 'FAILED', error: 'disk full', targeted: 1, inAppCreated: 0, pushSent: 0 });
    expect(broadcast.completedAt).toEqual(expect.any(String));
    expect(send).not.toHaveBeenCalled();
  });
});

const PACKAGE_BREAKERS: [string, Prisma.PackageUpdateInput, string][] = [
  ['inactive', { isActive: false }, 'That package is no longer active.'],
  ['expired', { expiresAt: new Date(Date.now() - MINUTE) }, 'That package has expired.'],
  ['deleted', { deletedAt: new Date() }, 'That package no longer exists.'],
];

const PROMO_BREAKERS: [string, Prisma.PromoCodeUpdateInput, string][] = [
  ['inactive', { isActive: false }, 'That promo code is no longer active.'],
  ['expired', { expiresAt: new Date(Date.now() - MINUTE) }, 'That promo code has expired.'],
  ['used up', { maxUsage: 3, usageCount: 3 }, 'That promo code has been used up.'],
  ['deleted', { deletedAt: new Date() }, 'That promo code no longer exists.'],
];

describe('A47 — publish guards', () => {
  it('a second publish while one is sending is refused', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));
    // Four minutes in: inside the five-minute window, so still "sending".
    await seedSending(template.id, admin.id, new Date(Date.now() - 4 * MINUTE));

    const res = await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(admin.token));

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This notification is already being sent.');
    expect(await prisma.notificationBroadcast.count()).toBe(1);
    expect(await announcements()).toBe(0);
    expect(send).not.toHaveBeenCalled();

    // The guard is per template.
    const other = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { name: 'Other' }));
    expect((await publishTemplate(admin.token, other.id)).status).toBe('SENT');
  });

  it('a stale SENDING broadcast reads as timed out and does not block', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));
    const stale = await seedSending(template.id, admin.id, new Date(Date.now() - 6 * MINUTE));
    const history = () => request(app).get(`${BASE}/${template.id}/broadcasts`).set(...authHeader(admin.token));

    expect((await history()).body.data).toEqual([
      expect.objectContaining({ id: stale.id, status: 'FAILED', error: 'Timed out', completedAt: null }),
    ]);

    const fresh = await publishTemplate(admin.token, template.id);
    expect(fresh.status).toBe('SENT');

    const after = (await history()).body.data as { id: number; status: string }[];
    expect(after.map((b) => [b.id, b.status])).toEqual([
      [fresh.id, 'SENT'],
      [stale.id, 'FAILED'],
    ]);
    // Only how the stuck row reads changed; the row itself is untouched.
    expect((await prisma.notificationBroadcast.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('SENDING');
  });

  it.each(PACKAGE_BREAKERS)('refuses a package that became %s, creating no broadcast', async (_state, change, message) => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const pkg = await makePackage();
    const template = await createTemplate(
      admin.token,
      templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { targetType: 'PACKAGE', packageId: pkg.id }),
    );
    await prisma.package.update({ where: { id: pkg.id }, data: change });

    const res = await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(admin.token));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
    expect(await prisma.notificationBroadcast.count()).toBe(0);
    expect(await announcements()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(PROMO_BREAKERS)('refuses a promo code that became %s, creating no broadcast', async (_state, change, message) => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const promo = await makePromoCode();
    const template = await createTemplate(
      admin.token,
      templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { targetType: 'PROMO_CODE', promoCodeId: promo.id }),
    );
    await prisma.promoCode.update({ where: { id: promo.id }, data: change });

    const res = await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(admin.token));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
    expect(await prisma.notificationBroadcast.count()).toBe(0);
    expect(await announcements()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an audience nobody matches', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const bigSpenders = await makeGroup(admin.token, {
      name: 'Big spenders',
      kind: 'DYNAMIC',
      rules: [{ field: 'completedBookings', op: 'gte', value: 5 }],
    });
    const byGroup = await createTemplate(admin.token, templateInput({ type: 'GROUPS', groupIds: [bigSpenders] }));
    const byHand = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { name: 'By hand' }));
    await prisma.user.update({ where: { id: mother.id }, data: { isActive: false } });

    for (const id of [byGroup.id, byHand.id]) {
      const res = await request(app).post(`${BASE}/${id}/publish`).set(...authHeader(admin.token));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No mothers match this audience.');
    }
    expect(await prisma.notificationBroadcast.count()).toBe(0);
  });

  it('404s a deleted template and refuses a view-only operator', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const viewer = await makeOperator({ notifications: 'VIEW' });
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));

    expect((await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(viewer.token))).status).toBe(403);

    await request(app).delete(`${BASE}/${template.id}`).set(...authHeader(admin.token)).expect(200);
    const res = await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(admin.token));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Notification template not found.');
    expect(await prisma.notificationBroadcast.count()).toBe(0);
  });
});
```

Extend `apps/backend/src/__tests__/admin-permissions.test.ts` — inside `it('gates notification templates: VIEW reads, MANAGE writes', …)` from Task 6, add:

```ts
    expect(allows('POST', '/notification-templates/4/publish', 'OPERATOR', view)).toBe(false);
    expect(allows('POST', '/notification-templates/4/publish', 'OPERATOR', manage)).toBe(true);
```

- [ ] **Step 7: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/backend test:unit -- admin-permissions` — Expected: FAIL (no rule for `POST /notification-templates/:id/publish`).

Run: `tmux new -d -s nanny-a47 "pnpm --filter @nanny-app/backend test:integration -- a47 2>&1 | tee ~/logs/nanny-a47.log"`; `tail -60 ~/logs/nanny-a47.log` when done.
Expected: FAIL — publish answers 403 (undeclared route).

- [ ] **Step 8: Implement `apps/backend/src/services/notification-broadcast.service.ts`**

```ts
import { NotificationBroadcastStatus, NotificationChannel, NotificationType, type Prisma } from '@prisma/client';

import type { NotificationBroadcast } from '@nanny-app/shared';
import { BROADCAST_STALE_MS, NotificationAudienceSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  BROADCAST_INCLUDE,
  resolveNotificationAudience,
  toBroadcastDto,
} from '@backend/services/admin-notification-template.service';
import { dispatchPushToTokens, listLiveDeviceTokens } from '@backend/services/notification.service';

/** In-app rows per insert. */
export const IN_APP_CHUNK = 1_000;

const WITH_LINK = { package: true, promoCode: true } as const;
type LinkedTemplate = Prisma.NotificationTemplateGetPayload<{ include: typeof WITH_LINK }>;

/**
 * The link must still lead somewhere a mother can use: a tap on a dead package
 * or an exhausted code would end in an error screen.
 */
function assertLinkUsable(template: LinkedTemplate, now: Date): void {
  if (template.targetType === 'PACKAGE') {
    const pkg = template.package;
    if (!pkg || pkg.deletedAt) throw errors.badRequest('That package no longer exists.');
    if (!pkg.isActive) throw errors.badRequest('That package is no longer active.');
    if (pkg.expiresAt && pkg.expiresAt <= now) throw errors.badRequest('That package has expired.');
  }
  if (template.targetType === 'PROMO_CODE') {
    const promo = template.promoCode;
    if (!promo || promo.deletedAt) throw errors.badRequest('That promo code no longer exists.');
    if (!promo.isActive) throw errors.badRequest('That promo code is no longer active.');
    if (promo.expiresAt && promo.expiresAt <= now) throw errors.badRequest('That promo code has expired.');
    if (promo.maxUsage != null && promo.usageCount >= promo.maxUsage) {
      throw errors.badRequest('That promo code has been used up.');
    }
  }
}

/** FCM data values must be strings; absent keys are left out, not sent empty. */
function pushData(broadcastId: number, template: LinkedTemplate): Record<string, string> {
  const data: Record<string, string> = { type: 'ANNOUNCEMENT', broadcastId: String(broadcastId) };
  if (template.targetType === 'PACKAGE' && template.packageId != null) {
    data.targetType = 'PACKAGE';
    data.packageId = String(template.packageId);
  }
  if (template.targetType === 'PROMO_CODE' && template.promoCode) {
    data.targetType = 'PROMO_CODE';
    data.promoCode = template.promoCode.code;
  }
  return data;
}

/**
 * Sends a template now (spec, "Publish flow"): validate the link, resolve the
 * audience, claim the send with a SENDING broadcast, write the inbox rows,
 * push, then record the outcome. In-request: Vercel has no worker, and token
 * batching keeps 10k mothers to ~20 FCM calls.
 */
export async function publishNotificationTemplate(templateId: number, adminId: number): Promise<NotificationBroadcast> {
  const template = await prisma.notificationTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
    include: WITH_LINK,
  });
  if (!template) throw errors.notFound('Notification template not found.');
  assertLinkUsable(template, new Date());

  const audience = NotificationAudienceSchema.parse(template.audience);
  const { userIds, skippedGroupIds } = await resolveNotificationAudience(audience);
  if (userIds.length === 0) throw errors.badRequest('No mothers match this audience.');

  const claimed = await prisma.$transaction(async (tx) => {
    // Serialise publishes of this template: a double-click or a second admin
    // waits here until the first has committed its SENDING row, then sees it.
    await tx.$queryRaw`SELECT id FROM notification_templates WHERE id = ${templateId} FOR UPDATE`;
    const inFlight = await tx.notificationBroadcast.findFirst({
      where: {
        templateId,
        status: NotificationBroadcastStatus.SENDING,
        // One stuck longer than this was killed mid-send; it reads as timed out and no longer blocks.
        createdAt: { gt: new Date(Date.now() - BROADCAST_STALE_MS) },
      },
      select: { id: true },
    });
    if (inFlight) throw errors.conflict('This notification is already being sent.');

    return tx.notificationBroadcast.create({
      data: {
        templateId,
        title: template.title,
        body: template.body,
        imageUrl: template.imageUrl,
        channel: template.channel,
        targetType: template.targetType,
        packageId: template.packageId,
        promoCodeId: template.promoCodeId,
        // The code itself, so a tap opens the booking flow without a lookup.
        promoCodeText: template.targetType === 'PROMO_CODE' ? (template.promoCode?.code ?? null) : null,
        audience: audience as Prisma.InputJsonValue,
        targeted: userIds.length,
        skippedGroups: skippedGroupIds,
        publishedById: adminId,
      },
      select: { id: true },
    });
  });

  return deliver(claimed.id, template, userIds);
}

async function deliver(broadcastId: number, template: LinkedTemplate, userIds: number[]): Promise<NotificationBroadcast> {
  const counts = { inAppCreated: 0, pushSent: 0, pushFailed: 0, noDevice: 0 };
  let status: NotificationBroadcastStatus = NotificationBroadcastStatus.SENT;
  let error: string | null = null;

  try {
    if (template.channel !== NotificationChannel.PUSH) {
      // A failed chunk stops here (caught below): FAILED with the rows so far, and no push.
      for (let i = 0; i < userIds.length; i += IN_APP_CHUNK) {
        const { count } = await prisma.notification.createMany({
          data: userIds.slice(i, i + IN_APP_CHUNK).map((userId) => ({
            userId,
            type: NotificationType.ANNOUNCEMENT,
            title: template.title,
            body: template.body,
            broadcastId,
          })),
        });
        counts.inAppCreated += count;
      }
    }

    if (template.channel !== NotificationChannel.IN_APP) {
      const tokens = await listLiveDeviceTokens(userIds);
      counts.noDevice = userIds.length - new Set(tokens.map((t) => t.userId)).size;
      const { sent, failed } = await dispatchPushToTokens(
        tokens.map((t) => t.token),
        { title: template.title, body: template.body, imageUrl: template.imageUrl, data: pushData(broadcastId, template) },
      );
      counts.pushSent = sent;
      counts.pushFailed = failed;
      if (failed > 0) status = NotificationBroadcastStatus.PARTIAL;
    }
  } catch (err) {
    status = NotificationBroadcastStatus.FAILED;
    error = err instanceof Error ? err.message : String(err);
  }

  const row = await prisma.notificationBroadcast.update({
    where: { id: broadcastId },
    data: { ...counts, status, error, completedAt: new Date() },
    include: BROADCAST_INCLUDE,
  });
  return toBroadcastDto(row);
}
```

- [ ] **Step 9: Route and permission**

`admin.routes.ts` — import `publishNotificationTemplate` from `@backend/services/notification-broadcast.service` and add after `GET /notification-templates/:id/broadcasts`:

```ts
adminRouter.post(
  '/notification-templates/:id/publish',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.adminUser) throw errors.unauthorized();
      res.status(201).json(ok(await publishNotificationTemplate(routeIdParam(req.params.id), req.adminUser.id)));
    } catch (err) {
      next(err);
    }
  },
);
```

`admin-permissions.ts`, last row of the Notifications block:

```ts
  { method: 'POST', pattern: '/notification-templates/:id/publish', requires: section('notifications', 'MANAGE') },
```

- [ ] **Step 10: Run the tests**

Run: `pnpm --filter @nanny-app/backend test:unit -- 'notification-push-batch|notification-type-map|admin-permissions'` and `pnpm --filter @nanny-app/backend typecheck`.
Expected: PASS.

Run: `tmux new -d -s nanny-a47 "pnpm --filter @nanny-app/backend test:integration -- 'a47|a46|a38|a12' 2>&1 | tee ~/logs/nanny-a47.log"`; `tail -80 ~/logs/nanny-a47.log` when done.
Expected: PASS — a47 in full (incl. "a second publish while one is sending is refused", "a stale SENDING broadcast reads as timed out and does not block", every link breaker, "a mother in two groups gets one inbox row and one push per device"); a46 and a38 unchanged (the per-user `dispatchPush` only had its dead-token check extracted).

- [ ] **Step 11: Commit**

```bash
git add apps/backend
git commit -F - <<'EOF'
feat(backend): publish notification templates with token-batched FCM multicast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
```

---

### Task 8: Inbox payload: image and link (backend)

> Note: Task 2 Step 5 left `toNotificationResponse` returning the placeholders `imageUrl: null, link: null` (under the comment `// Announcement image and link come through the broadcast (Task 8).`), and added the `ANNOUNCEMENT` mapping and its unit test. This task replaces the placeholders with values read through the broadcast. It does not touch `toApiNotificationType` or Task 2's test case.

**Files:**
- Modify: `apps/backend/src/services/notification.service.ts`
- Test: `apps/backend/src/__tests__/notification-type-map.test.ts` (extend), `apps/backend/src/__integration__/journeys/a47-notification-publish.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1, 2.
- Produces: `listNotifications` includes `broadcast: { select: { imageUrl, targetType, packageId, promoCodeText } }` and maps to `imageUrl` and `link` (`{type:'package', packageId}` / `{type:'promo_code', code}` / `null`). Non-announcement rows return `imageUrl: null, link: null`.

- [ ] **Step 1: Extend the unit test (failing)**

In `apps/backend/src/__tests__/notification-type-map.test.ts`, change the service import to:

```ts
import { toApiNotificationType, toNotificationLink } from '@backend/services/notification.service';
```

and append:

```ts
describe('toNotificationLink', () => {
  const none = { imageUrl: null, targetType: null, packageId: null, promoCodeText: null };

  it('links a package broadcast to its package', () => {
    expect(toNotificationLink({ ...none, targetType: 'PACKAGE', packageId: 4 })).toEqual({
      type: 'package',
      packageId: 4,
    });
  });

  it('links a promo-code broadcast by the code text it snapshotted', () => {
    expect(toNotificationLink({ ...none, targetType: 'PROMO_CODE', promoCodeText: 'SAVE20' })).toEqual({
      type: 'promo_code',
      code: 'SAVE20',
    });
  });

  it('has no link without a broadcast, without a target, or with a half-filled one', () => {
    expect(toNotificationLink(null)).toBeNull();
    expect(toNotificationLink(undefined)).toBeNull();
    expect(toNotificationLink(none)).toBeNull();
    expect(toNotificationLink({ ...none, targetType: 'PACKAGE' })).toBeNull();
    expect(toNotificationLink({ ...none, targetType: 'PROMO_CODE' })).toBeNull();
  });
});
```

- [ ] **Step 2: Extend a47 with the inbox journey (failing)**

In `apps/backend/src/__integration__/journeys/a47-notification-publish.test.ts`, add `import type { NotificationResponse } from '@nanny-app/shared';` as the first import, and append:

```ts
describe('A47 — the inbox shows image and link', () => {
  const inbox = async (token: string): Promise<NotificationResponse[]> => {
    const res = await request(app).get('/notifications').set(...authHeader(token));
    expect(res.status).toBe(200);
    return res.body.data as NotificationResponse[];
  };

  it('returns the image and the promo-code link on an announcement, and nulls on other rows', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const promo = await makePromoCode({ code: 'SAVE20' });
    await prisma.notification.create({
      data: { userId: mother.id, type: 'SURVEY', title: 'Tell us how we did', body: 'Two minutes.' },
    });
    const template = await createTemplate(
      admin.token,
      templateInput(
        { type: 'MOTHERS', motherIds: [mother.id] },
        { channel: 'IN_APP', imageUrl: IMAGE, targetType: 'PROMO_CODE', promoCodeId: promo.id },
      ),
    );
    await publishTemplate(admin.token, template.id);

    const rows = await inbox(mother.token);
    expect(rows.find((n) => n.type === 'announcement')).toMatchObject({
      title: 'We miss you',
      body: BODY,
      isRead: false,
      imageUrl: IMAGE,
      link: { type: 'promo_code', code: 'SAVE20' },
    });
    expect(rows.find((n) => n.type === 'survey')).toMatchObject({ imageUrl: null, link: null });
  });

  it('keeps the published link and image when the template changes later, including after marking read', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const pkg = await makePackage();
    const audience = { type: 'MOTHERS' as const, motherIds: [mother.id] };
    const template = await createTemplate(
      admin.token,
      templateInput(audience, { channel: 'IN_APP', imageUrl: IMAGE, targetType: 'PACKAGE', packageId: pkg.id }),
    );
    await publishTemplate(admin.token, template.id);
    await request(app)
      .patch(`${BASE}/${template.id}`)
      .set(...authHeader(admin.token))
      .send(templateInput(audience, { channel: 'IN_APP' }))
      .expect(200);

    const [announcement] = await inbox(mother.token);
    expect(announcement).toMatchObject({ imageUrl: IMAGE, link: { type: 'package', packageId: pkg.id } });

    const read = await request(app)
      .patch(`/notifications/${announcement!.id}/read`)
      .set(...authHeader(mother.token));
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ isRead: true, imageUrl: IMAGE, link: { type: 'package', packageId: pkg.id } });
  });

  it('returns no link for an announcement published without one', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(
      admin.token,
      templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { channel: 'IN_APP' }),
    );
    await publishTemplate(admin.token, template.id);

    expect(await inbox(mother.token)).toEqual([
      expect.objectContaining({ type: 'announcement', imageUrl: null, link: null }),
    ]);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/backend test:unit -- notification-type-map`
Expected: FAIL — `toNotificationLink` is not exported.

Run: `tmux new -d -s nanny-a47 "pnpm --filter @nanny-app/backend test:integration -- a47 2>&1 | tee ~/logs/nanny-a47.log"`; `tail -60 ~/logs/nanny-a47.log` when done.
Expected: the publish cases PASS; the three "inbox shows image and link" cases FAIL (`imageUrl` / `link` missing or null on the announcement).

- [ ] **Step 4: Read image and link through the broadcast in `notification.service.ts`**

Change the Prisma type import to:

```ts
import type { CampaignTargetType, NotificationReferenceType, NotificationType, User } from '@prisma/client';
```

add `type NotificationLink,` to the `@nanny-app/shared` import, and replace `toNotificationResponse` as Task 2 left it, i.e. ending in

```ts
    createdAt: row.createdAt.toISOString(),
    // Announcement image and link come through the broadcast (Task 8).
    imageUrl: null,
    link: null,
  };
}
```

with:

```ts
/**
 * What an inbox row reads through its broadcast — the image and where a tap
 * goes. Read through the relation, not copied onto every row; the broadcast is
 * a snapshot, so editing the template later never changes a sent message.
 */
const BROADCAST_LINK_SELECT = {
  imageUrl: true,
  targetType: true,
  packageId: true,
  promoCodeText: true,
} as const;

type BroadcastLink = {
  imageUrl: string | null;
  targetType: CampaignTargetType | null;
  packageId: number | null;
  promoCodeText: string | null;
};

/** The tap target of an announcement; null for a plain one and for every other notification. */
export function toNotificationLink(broadcast: BroadcastLink | null | undefined): NotificationLink | null {
  if (!broadcast) return null;
  if (broadcast.targetType === 'PACKAGE' && broadcast.packageId != null) {
    return { type: 'package', packageId: broadcast.packageId };
  }
  if (broadcast.targetType === 'PROMO_CODE' && broadcast.promoCodeText) {
    return { type: 'promo_code', code: broadcast.promoCodeText };
  }
  return null;
}

function toNotificationResponse(row: {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  referenceId: number | null;
  referenceType: NotificationReferenceType | null;
  createdAt: Date;
  broadcast?: BroadcastLink | null;
}): NotificationResponse {
  return {
    id: row.id,
    type: toApiNotificationType(row.type),
    title: row.title,
    body: row.body,
    isRead: row.isRead,
    referenceId: row.referenceId,
    referenceType: toApiReferenceType(row.referenceType),
    createdAt: row.createdAt.toISOString(),
    imageUrl: row.broadcast?.imageUrl ?? null,
    link: toNotificationLink(row.broadcast),
  };
}
```

In `listNotifications`, give the `findMany` the relation:

```ts
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: { broadcast: { select: BROADCAST_LINK_SELECT } },
    }),
```

and in `markNotificationRead`, so the row it returns matches the list:

```ts
  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
    include: { broadcast: { select: BROADCAST_LINK_SELECT } },
  });
```

`createInAppNotification` returns a fresh row with no broadcast, so it maps to `imageUrl: null, link: null` unchanged.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @nanny-app/backend test:unit -- 'notification-type-map|notification-push-batch'` and `pnpm --filter @nanny-app/backend typecheck`.
Expected: PASS.

Run: `tmux new -d -s nanny-a47 "pnpm --filter @nanny-app/backend test:integration -- 'a47|a38|a39' 2>&1 | tee ~/logs/nanny-a47.log"`; `tail -60 ~/logs/nanny-a47.log` when done.
Expected: PASS — a47 in full; a38/a39 (survey notifications in the inbox) unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/backend
git commit -F - <<'EOF'
feat(backend): inbox announcements carry their image and package/promo link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
```

---

---

### Task 9: Admin — API client, Notifications section, nav and template list page

> Note: the contract lists both routes for this task; `/notifications/:id` is registered in Task 10, together with the page it renders, so no route ever points at a page that does not exist yet.
> Note: Campaigns already uses lucide `Megaphone` in the sidebar. Notifications takes `Megaphone` as the contract says, and Campaigns moves to `Images` (it is an image carousel), so two entries never share an icon.
> Note: this task also creates three small pieces the later admin tasks share — `components/ui/segmented-control.tsx` (channel, link, audience and group-kind pickers), `lib/use-debounced-value.ts` (live counts) and `features/groups/group-labels.ts` (Static/Dynamic badges) — because Task 12 consumes only Tasks 1, 5 and 9.
> Note: "Publish" in a row's menu opens the template at `/notifications/:id?publish=1`; Task 11's editor opens its publish confirmation from that parameter, so the publish dialog exists in exactly one place.

**Files:**
- Modify: `apps/admin/src/lib/api.ts`, `apps/admin/src/app.tsx`, `apps/admin/src/components/admin-layout.tsx`, `apps/admin/src/components/ui/icon.tsx`, `apps/admin/src/components/ui/index.ts`, `apps/admin/src/styles/global.css`, `apps/admin/e2e/a12-operator-ui.spec.ts`
- Create: `apps/admin/src/components/ui/segmented-control.tsx`, `apps/admin/src/lib/use-debounced-value.ts`, `apps/admin/src/features/groups/group-labels.ts`, `apps/admin/src/features/notifications/notification-labels.ts`, `apps/admin/src/features/notifications/template-table.tsx`, `apps/admin/src/pages/notifications-page.tsx`
- Test: `apps/admin/src/pages/__tests__/notifications-page.test.tsx`, `apps/admin/src/components/ui/__tests__/segmented-control.test.tsx`, `apps/admin/src/lib/__tests__/use-debounced-value.test.ts`

**Interfaces:**
- Consumes (Task 1, `@nanny-app/shared`): `NotificationTemplate`, `NotificationTemplateInput`, `NotificationTemplateListItem`, `NotificationAudience`, `NotificationAudiencePreview`, `NotificationBroadcast`, `NotificationBroadcastStatus`, `NotificationChannel`, `DynamicGroupRules`, `GroupRulesPreview`, `UserGroupKind`, `UserGroupUpdateInput`, `CampaignTargetType`, `AdminSection` incl. `'notifications'`. Endpoints from Tasks 5 and 6.
- Produces (in `lib/api.ts`): `listNotificationTemplates(): Promise<NotificationTemplateListItem[]>`, `getNotificationTemplate(id: number): Promise<NotificationTemplate>`, `createNotificationTemplate(input: NotificationTemplateInput): Promise<NotificationTemplate>`, `updateNotificationTemplate(id: number, input: NotificationTemplateInput): Promise<NotificationTemplate>`, `deleteNotificationTemplate(id: number): Promise<void>`, `previewNotificationAudience(audience: NotificationAudience): Promise<NotificationAudiencePreview>`, `publishNotificationTemplate(id: number): Promise<NotificationBroadcast>`, `listTemplateBroadcasts(id: number): Promise<NotificationBroadcast[]>`, `previewGroupRules(rules: DynamicGroupRules): Promise<GroupRulesPreview>`; `updateUserGroup(id, input: UserGroupUpdateInput)` (was `UserGroupInput`); `fetchMotherPicker` gains `rules?: DynamicGroupRules` (sent as a JSON string).
- React Query keys: `['notification-templates']` (list), `['notification-templates', id]` (one template), `['notification-templates', id, 'broadcasts']` (history), `['notification-audience-preview', audience]` (live count).
- Route `/notifications` under `<Guarded section="notifications">`; nav item `{ to: '/notifications', label: 'Notifications', icon: Megaphone, section: 'notifications' }`.
- `pages/notifications-page.tsx` → `NotificationsPage()`; `features/notifications/template-table.tsx` → `TemplateTable({ templates })`.
- `features/notifications/notification-labels.ts`: `CHANNEL_LABEL`, `CHANNEL_HINT`, `LINK_TYPE_LABEL`, `BROADCAST_STATUS_LABEL`, `BROADCAST_STATUS_TONE`, `formatCount(n)`, `mothersLabel(n)`, `linkActionLabel(targetType, code)`.
- `features/groups/group-labels.ts`: `GROUP_KIND_LABEL`, `GROUP_KIND_TONE`, `GROUP_KIND_HINT`.
- `components/ui/segmented-control.tsx`: `SegmentedControl<V extends string>({ legend, hideLegend?, value, options, onChange, disabled?, describedBy?, id? })`, exported from the `@admin/components/ui` barrel.
- `lib/use-debounced-value.ts`: `useDebouncedValue<T>(value: T, delayMs: number): T`.

- [ ] **Step 1: Load the `nanny-app-admin-design` and `ui-ux-pro-max:ui-ux-pro-max` skills**

Read both before touching UI. From ui-ux-pro-max apply §1 (`focus-states`, `keyboard-nav`, `form-labels`, `color-not-only`) and §8 (`confirmation-dialogs`, `empty-states`, `toast-dismiss`). From the admin skill: the table-page shape (ID first, kebab last, every column sorts, `PageHeader` action), tokens only, reuse `components/ui`.

- [ ] **Step 2: Confirm the admin fixtures already match Task 1's shapes**

Task 1 Step 9 already added `kind: 'STATIC', rules: null` to the `UserGroup` fixtures and `lastAppOpenAt: null` to the `MotherPickerRow` fixtures in `groups-page.test.tsx`, `group-detail-page.test.tsx`, `mother-picker-table.test.tsx` and `recipient-picker-modal.test.tsx`. This task does not edit them again.

Run: `pnpm --filter @nanny-app/admin typecheck`
Expected: PASS. (`group-form.tsx` still compiles: `UserGroupInput` keeps `kind` defaulted and `rules` nullish, so `{ name, description }` fits it.)

- [ ] **Step 3: Write the failing tests**

`apps/admin/src/components/ui/__tests__/segmented-control.test.tsx`:

```tsx
/**
 * The segmented control is a native radio group: one Tab stop on the chosen
 * option, arrow keys move and choose, and the legend names the group.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SegmentedControl } from '@admin/components/ui';

type Channel = 'IN_APP' | 'PUSH' | 'BOTH';
const OPTIONS = [
  { value: 'IN_APP', label: 'In-app' },
  { value: 'PUSH', label: 'Push' },
  { value: 'BOTH', label: 'Both' },
] as const;

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<Channel>('IN_APP');
  return (
    <>
      <button type="button">before</button>
      <SegmentedControl legend="Channel" value={value} options={OPTIONS} onChange={setValue} disabled={disabled} />
      <output>{value}</output>
    </>
  );
}

describe('SegmentedControl', () => {
  it('is a radio group named by its legend, and a click chooses', async () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Channel' });
    expect(within(group).getByRole('radio', { name: 'In-app' })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: 'Both' }));
    expect(screen.getByRole('status')).toHaveTextContent('BOTH');
  });

  it('takes one Tab stop on the chosen option, and arrow keys move the choice', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'before' }));
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'In-app' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Push' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('PUSH');
  });

  it('locks every option when disabled', () => {
    render(<Harness disabled />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});
```

`apps/admin/src/lib/__tests__/use-debounced-value.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from '@admin/lib/use-debounced-value';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebouncedValue', () => {
  it('hands back the latest value only once it has stopped changing for the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 400), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');
    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(300));
    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });
});
```

`apps/admin/src/pages/__tests__/notifications-page.test.tsx`:

```tsx
/**
 * The Notifications page lists every template with its channel, link and
 * audience. "New template" opens a blank editor, a row's Publish opens the
 * template with its publish confirmation, and Delete asks first.
 */
import type { AdminUser, NotificationTemplateListItem } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { NotificationsPage } from '@admin/pages/notifications-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });

const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const VIEWER: AdminUser = { ...ADMIN, role: 'OPERATOR', permissions: { notifications: 'VIEW' } };

const WINBACK: NotificationTemplateListItem = {
  id: 4, name: 'Win-back 30d', title: 'We miss you', channel: 'BOTH', targetType: 'PROMO_CODE',
  linkLabel: 'SAVE20', audienceSummary: '2 groups', publishCount: 3,
  lastPublishedAt: '2026-10-19T10:00:00.000Z', updatedAt: '2026-10-19T09:00:00.000Z',
};
const WELCOME: NotificationTemplateListItem = {
  id: 5, name: 'Welcome', title: 'Welcome to NannyNow', channel: 'IN_APP', targetType: null,
  linkLabel: null, audienceSummary: '37 mothers', publishCount: 0,
  lastPublishedAt: null, updatedAt: '2026-10-20T09:00:00.000Z',
};

function Location() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

function renderPage(me: AdminUser = ADMIN) {
  server.use(http.get('/api/admin/me', () => ok(me)));
  return renderWithProviders(
    <MemoryRouter initialEntries={['/notifications']}>
      <ToastProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/notifications/:id" element={<Location />} />
          </Routes>
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('NotificationsPage', () => {
  it('lists templates with channel, link, audience and how often each was sent', async () => {
    server.use(http.get('/api/admin/notification-templates', () => ok([WINBACK, WELCOME])));
    renderPage();

    const winback = await rowOf('Win-back 30d');
    expect(within(winback).getByText('In-app + push')).toBeInTheDocument();
    expect(within(winback).getByText('Promo code')).toBeInTheDocument();
    expect(within(winback).getByText('SAVE20')).toBeInTheDocument();
    expect(within(winback).getByText('2 groups')).toBeInTheDocument();
    expect(within(winback).getByText('3')).toBeInTheDocument();

    const welcome = await rowOf('Welcome');
    expect(within(welcome).getByText('In-app')).toBeInTheDocument();
    expect(within(welcome).getByText('37 mothers')).toBeInTheDocument();
    expect(within(welcome).getByText('Never')).toBeInTheDocument();
  });

  it('opens a blank editor from "New template"', async () => {
    server.use(http.get('/api/admin/notification-templates', () => ok([])));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new template/i }));
    expect(await screen.findByRole('status', { name: 'location' })).toHaveTextContent('/notifications/new');
  });

  it("opens a row's template with its publish confirmation", async () => {
    server.use(http.get('/api/admin/notification-templates', () => ok([WINBACK])));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Win-back 30d' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Publish…' }));
    expect(await screen.findByRole('status', { name: 'location' })).toHaveTextContent('/notifications/4?publish=1');
  });

  it('deletes a template only after confirming', async () => {
    let deleted = false;
    server.use(
      http.get('/api/admin/notification-templates', () => ok(deleted ? [] : [WINBACK])),
      http.delete('/api/admin/notification-templates/4', () => {
        deleted = true;
        return ok(null);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Win-back 30d' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(deleted).toBe(false);
    const confirm = screen.getByRole('dialog', { name: 'Delete this template?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete template' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByText('Template deleted')).toBeInTheDocument();
  });

  it('shows the list to a view-only operator without any write controls', async () => {
    server.use(http.get('/api/admin/notification-templates', () => ok([WINBACK])));
    renderPage(VIEWER);
    expect(await screen.findByText('Win-back 30d')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new template/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Win-back 30d' })).toBeDisabled();
  });
});
```

(`<output>` has the implicit role `status`; `aria-label` names it.)

- [ ] **Step 4: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/admin test -- segmented-control use-debounced-value notifications-page`
Expected: FAIL — `SegmentedControl` is not exported from `@admin/components/ui`, `Cannot find module '@admin/lib/use-debounced-value'`, `Cannot find module '@admin/pages/notifications-page'`.

- [ ] **Step 5: Create the segmented control and the debounce hook**

`apps/admin/src/components/ui/segmented-control.tsx`:

```tsx
import { useId } from 'react';

export type SegmentedOption<V extends string> = { value: V; label: string };

type SegmentedControlProps<V extends string> = {
  /** Names the group for everyone; shown above the track unless `hideLegend`. */
  legend: string;
  /** A card title already says what this is: keep the legend for screen readers only. */
  hideLegend?: boolean;
  value: V;
  options: readonly SegmentedOption<V>[];
  onChange: (value: V) => void;
  disabled?: boolean;
  /** Id of a hint describing the current choice. */
  describedBy?: string;
  /** Lets an error summary link to (and focus) the group. */
  id?: string;
};

/**
 * A small set of mutually exclusive choices shown as one pill track (In-app /
 * Push / Both). Built on native radios, so it is one Tab stop that lands on the
 * chosen option, and the arrow keys move and choose — no custom key handling.
 * The radio itself is visually hidden; the focus ring is drawn on its label.
 */
export function SegmentedControl<V extends string>({
  legend,
  hideLegend = false,
  value,
  options,
  onChange,
  disabled = false,
  describedBy,
  id,
}: SegmentedControlProps<V>) {
  const name = useId();
  return (
    <fieldset
      className="segmented"
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-describedby={describedBy}
      disabled={disabled}
    >
      <legend className={hideLegend ? 'sr-only' : 'segmented-legend'}>{legend}</legend>
      <div className="segmented-track">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <label key={option.value} className={`segmented-option${on ? ' segmented-option--on' : ''}`}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={on}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
```

Add to `apps/admin/src/components/ui/index.ts`, under `// Form controls`:

```ts
export { SegmentedControl, type SegmentedOption } from './segmented-control';
```

`apps/admin/src/lib/use-debounced-value.ts`:

```ts
import { useEffect, useState } from 'react';

/**
 * `value`, but only after it has stopped changing for `delayMs` — so a live
 * count is asked for once the admin pauses, not on every tick or keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

Append to `apps/admin/src/styles/global.css`:

```css
/* ── Segmented control (channel, link, audience, group kind) ─────────
   Native radios in a pill track. The radio is visually hidden; its label is
   the target, and keyboard focus is drawn on the label. */
.segmented {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.segmented-legend {
  margin-bottom: 0.35rem;
  padding: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.segmented-track {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  width: fit-content;
  max-width: 100%;
  padding: 0.25rem;
  border: 1px solid var(--color-warm-border);
  border-radius: var(--radius-full);
  background: var(--color-surface-muted);
}

.segmented-option {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.35rem 0.95rem;
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.segmented-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.segmented-option:hover {
  color: var(--color-text-primary);
}

.segmented-option--on {
  background: var(--color-surface);
  color: var(--color-primary-dark);
  box-shadow: var(--shadow-card);
}

/* Keyboard focus stays visible although the radio is off-screen. */
.segmented-option:has(input:focus-visible) {
  outline: 2px solid var(--color-primary-dark);
  outline-offset: 2px;
}

.segmented:disabled .segmented-option {
  cursor: default;
  opacity: 0.55;
}

@media (prefers-reduced-motion: reduce) {
  .segmented-option {
    transition: none;
  }
}

/* A table cell holding a type badge and the linked thing's name. */
.link-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
```

- [ ] **Step 6: Add the API functions to `lib/api.ts`**

Add to the top `import type { … } from '@nanny-app/shared'` block: `DynamicGroupRules`, `GroupRulesPreview`, `NotificationAudience`, `NotificationAudiencePreview`, `NotificationBroadcast`, `NotificationTemplate`, `NotificationTemplateInput`, `NotificationTemplateListItem`, `UserGroupUpdateInput`.

Change `updateUserGroup` (a PATCH validates with `UserGroupUpdateSchema` since Task 5) and `fetchMotherPicker` (dynamic group members, Task 12):

```ts
export async function updateUserGroup(id: number, input: UserGroupUpdateInput): Promise<UserGroup> {
  const res = await apiClient.patch<ApiEnvelope<UserGroup>>(`/admin/groups/${id}`, input);
  return res.data.data;
}
```

```ts
export async function fetchMotherPicker(params: {
  search?: string;
  groupId?: number;
  excludeGroupId?: number;
  /** A dynamic group's rules: list only the mothers matching them now. */
  rules?: DynamicGroupRules;
  page: number;
  limit: number;
  sortBy: MotherPickerSortKey;
  sortDir: AdminSortDir;
}): Promise<Paged<MotherPickerRow[]>> {
  const { rules, ...rest } = params;
  const res = await apiClient.get<PagedEnvelope<MotherPickerRow[]>>('/admin/mother-picker', {
    params: {
      ...rest,
      search: rest.search || undefined,
      // A query param carries one string; the API parses it through DynamicGroupRulesSchema.
      rules: rules === undefined ? undefined : JSON.stringify(rules),
    },
  });
  return { data: res.data.data, meta: res.data.meta };
}
```

After the `fetchMotherPicker` function add:

```ts
export async function previewGroupRules(rules: DynamicGroupRules): Promise<GroupRulesPreview> {
  const res = await apiClient.post<ApiEnvelope<GroupRulesPreview>>('/admin/groups/rules-preview', { rules });
  return res.data.data;
}

// ── Notification templates (admin notification center) ─────────

export async function listNotificationTemplates(): Promise<NotificationTemplateListItem[]> {
  const res = await apiClient.get<ApiEnvelope<NotificationTemplateListItem[]>>('/admin/notification-templates');
  return res.data.data;
}

export async function getNotificationTemplate(id: number): Promise<NotificationTemplate> {
  const res = await apiClient.get<ApiEnvelope<NotificationTemplate>>(`/admin/notification-templates/${id}`);
  return res.data.data;
}

export async function createNotificationTemplate(input: NotificationTemplateInput): Promise<NotificationTemplate> {
  const res = await apiClient.post<ApiEnvelope<NotificationTemplate>>('/admin/notification-templates', input);
  return res.data.data;
}

/** A full replace: every field is sent, as the editor holds the whole template. */
export async function updateNotificationTemplate(
  id: number,
  input: NotificationTemplateInput,
): Promise<NotificationTemplate> {
  const res = await apiClient.patch<ApiEnvelope<NotificationTemplate>>(`/admin/notification-templates/${id}`, input);
  return res.data.data;
}

export async function deleteNotificationTemplate(id: number): Promise<void> {
  await apiClient.delete(`/admin/notification-templates/${id}`);
}

/** How many mothers an audience reaches now, and how many of them have a push device. */
export async function previewNotificationAudience(
  audience: NotificationAudience,
): Promise<NotificationAudiencePreview> {
  const res = await apiClient.post<ApiEnvelope<NotificationAudiencePreview>>(
    '/admin/notification-templates/audience-preview',
    { audience },
  );
  return res.data.data;
}

/** Sends the template now. Resolves with the broadcast and its counts. */
export async function publishNotificationTemplate(id: number): Promise<NotificationBroadcast> {
  const res = await apiClient.post<ApiEnvelope<NotificationBroadcast>>(`/admin/notification-templates/${id}/publish`);
  return res.data.data;
}

export async function listTemplateBroadcasts(id: number): Promise<NotificationBroadcast[]> {
  const res = await apiClient.get<ApiEnvelope<NotificationBroadcast[]>>(
    `/admin/notification-templates/${id}/broadcasts`,
  );
  return res.data.data;
}
```

`group-form.tsx` already passes `{ name, description }` to `updateUserGroup`, which `UserGroupUpdateInput` accepts (`rules` is optional), so it compiles unchanged.

- [ ] **Step 7: Create the label modules**

`apps/admin/src/features/groups/group-labels.ts`:

```ts
import type { UserGroupKind } from '@nanny-app/shared';

export const GROUP_KIND_LABEL: Record<UserGroupKind, string> = { STATIC: 'Static', DYNAMIC: 'Dynamic' };

/** A dynamic group gets the sage fill so the two kinds differ by more than their word. */
export const GROUP_KIND_TONE: Record<UserGroupKind, 'neutral' | 'success'> = {
  STATIC: 'neutral',
  DYNAMIC: 'success',
};

export const GROUP_KIND_HINT: Record<UserGroupKind, string> = {
  STATIC: 'Hand-picked mothers. You add and remove them yourself.',
  DYNAMIC: 'Mothers who match rules you set, worked out again every time something is sent.',
};
```

`apps/admin/src/features/notifications/notification-labels.ts`:

```ts
import type {
  CampaignTargetType,
  NotificationBroadcastStatus,
  NotificationChannel,
} from '@nanny-app/shared';

type Tone = 'neutral' | 'success' | 'danger' | 'warning';

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  IN_APP: 'In-app',
  PUSH: 'Push',
  BOTH: 'In-app + push',
};

/** What each channel does, under the channel control. */
export const CHANNEL_HINT: Record<NotificationChannel, string> = {
  IN_APP: 'An entry in the app’s Notifications inbox. No phone notification.',
  PUSH: 'A phone notification only — nothing is kept in the inbox.',
  BOTH: 'A phone notification, and an entry in the app’s Notifications inbox.',
};

export const LINK_TYPE_LABEL: Record<CampaignTargetType, string> = {
  PACKAGE: 'Package',
  PROMO_CODE: 'Promo code',
};

export const BROADCAST_STATUS_LABEL: Record<NotificationBroadcastStatus, string> = {
  SENDING: 'Sending',
  SENT: 'Sent',
  PARTIAL: 'Partly sent',
  FAILED: 'Failed',
};

export const BROADCAST_STATUS_TONE: Record<NotificationBroadcastStatus, Tone> = {
  SENDING: 'neutral',
  SENT: 'success',
  PARTIAL: 'warning',
  FAILED: 'danger',
};

/** 1240 → "1,240". One number style for every count on these pages. */
export const formatCount = (n: number) => n.toLocaleString('en-US');

/** 1 → "1 mother", 1240 → "1,240 mothers". */
export const mothersLabel = (n: number) => `${formatCount(n)} ${n === 1 ? 'mother' : 'mothers'}`;

/** The action line a mother sees on the inbox card. */
export function linkActionLabel(targetType: CampaignTargetType | null, code: string | null): string | null {
  if (targetType === 'PACKAGE') return 'View package';
  if (targetType === 'PROMO_CODE') return code ? `Book with code ${code}` : 'Book with this code';
  return null;
}
```

- [ ] **Step 8: Create the template table and the page**

Add `Images` and `Send` to the `lucide-react` re-exports in `apps/admin/src/components/ui/icon.tsx` (`Images` under `// Navigation`, `Send` under `// Row actions`).

`apps/admin/src/features/notifications/template-table.tsx`:

```tsx
import type { NotificationTemplateListItem } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  idColumn,
  MenuItem,
  MenuSeparator,
  Pencil,
  Send,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDate } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

import { CHANNEL_LABEL, LINK_TYPE_LABEL, formatCount } from './notification-labels';

type TemplateSortKey =
  | 'id'
  | 'name'
  | 'title'
  | 'channel'
  | 'link'
  | 'audience'
  | 'publishCount'
  | 'lastPublishedAt';

const EMPTY = <span className="table-empty">—</span>;

/** Every notification template (loaded in full, sorted in the browser). A row opens its editor. */
export function TemplateTable({ templates }: { templates: NotificationTemplateListItem[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('notifications');
  const [deleting, setDeleting] = useState<NotificationTemplateListItem | null>(null);

  const { rows, sort, onSortChange } = useClientSort<NotificationTemplateListItem, TemplateSortKey>(
    templates,
    {
      id: (t) => t.id,
      name: (t) => t.name,
      title: (t) => t.title,
      channel: (t) => CHANNEL_LABEL[t.channel],
      link: (t) => t.linkLabel,
      audience: (t) => t.audienceSummary,
      publishCount: (t) => t.publishCount,
      lastPublishedAt: (t) => t.lastPublishedAt,
    },
    { sortBy: 'id', sortDir: 'desc' },
  );

  const remove = useMutation({
    mutationFn: (t: NotificationTemplateListItem) => deleteNotificationTemplate(t.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template deleted');
      setDeleting(null);
    },
    onError: (err) => toast.error('Couldn’t delete the template', apiErrorMessage(err)),
  });

  const columns: Column<NotificationTemplateListItem, TemplateSortKey>[] = [
    idColumn((t) => t.id, 'id'),
    { key: 'name', header: 'Name', sortKey: 'name', width: '20%', render: (t) => t.name },
    { key: 'title', header: 'Title', sortKey: 'title', width: '24%', render: (t) => t.title },
    {
      key: 'channel',
      header: 'Channel',
      sortKey: 'channel',
      nowrap: true,
      render: (t) => <Badge>{CHANNEL_LABEL[t.channel]}</Badge>,
    },
    {
      key: 'link',
      header: 'Link',
      sortKey: 'link',
      render: (t) =>
        t.targetType && t.linkLabel ? (
          <span className="link-cell">
            <Badge>{LINK_TYPE_LABEL[t.targetType]}</Badge>
            <span>{t.linkLabel}</span>
          </span>
        ) : (
          EMPTY
        ),
    },
    { key: 'audience', header: 'Audience', sortKey: 'audience', nowrap: true, render: (t) => t.audienceSummary },
    {
      key: 'publishCount',
      header: 'Times sent',
      sortKey: 'publishCount',
      sortFirst: 'desc',
      align: 'right',
      render: (t) => formatCount(t.publishCount),
    },
    {
      key: 'lastPublishedAt',
      header: 'Last sent',
      sortKey: 'lastPublishedAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (t) => (t.lastPublishedAt ? formatDate(t.lastPublishedAt) : <span className="table-empty">Never</span>),
    },
    actionsColumn((t) => (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <ActionMenu label={`Actions for ${t.name}`} disabled={!canManage}>
          <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => navigate(`/notifications/${t.id}`)}>
            Edit
          </MenuItem>
          <MenuItem
            icon={<Send size={ICON_SIZE.menu} />}
            onSelect={() => navigate(`/notifications/${t.id}?publish=1`)}
          >
            Publish…
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(t)}>
            Delete
          </MenuItem>
        </ActionMenu>
      </div>
    )),
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={rows ?? []}
        rowKey={(t) => t.id}
        onRowClick={(t) => navigate(`/notifications/${t.id}`)}
        sort={sort}
        onSortChange={onSortChange}
        empty="No notifications yet. Write one with “New template”, then publish it whenever you want to send it."
      />
      {deleting && (
        <ConfirmDialog
          title="Delete this template?"
          message={`“${deleting.name}” will be removed. Its send history is kept, and mothers keep what they already received.`}
          confirmLabel="Delete template"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
```

`apps/admin/src/pages/notifications-page.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  Button,
  ErrorState,
  ICON_SIZE,
  PageHeader,
  Plus,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { TemplateTable } from '@admin/features/notifications/template-table';
import { listNotificationTemplates } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

/** Notification templates: write once, publish to mothers any number of times. */
export function NotificationsPage() {
  const canManage = useCanManage('notifications');
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: listNotificationTemplates,
  });

  return (
    <section>
      <PageHeader
        title="Notifications"
        subtitle="Write a notification once, then send it to mothers whenever you need to."
        action={
          canManage && (
            <Button onClick={() => navigate('/notifications/new')}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              New template
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={9} />}
      {error != null && !data && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {data && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <TemplateTable templates={data} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 9: Wire the nav, the route and the operator E2E list**

`apps/admin/src/components/admin-layout.tsx` — add `Images` to the `./ui` import, change the Campaigns entry and add Notifications after it:

```ts
  { to: '/campaigns', label: 'Campaigns', icon: Images, section: 'campaigns' },
  { to: '/notifications', label: 'Notifications', icon: Megaphone, section: 'notifications' },
```

`apps/admin/src/app.tsx` — `import { NotificationsPage } from './pages/notifications-page';` and, after the `campaigns` route:

```tsx
          <Route
            path="notifications"
            element={
              <Guarded section="notifications">
                <NotificationsPage />
              </Guarded>
            }
          />
```

`apps/admin/e2e/a12-operator-ui.spec.ts` — add `'Notifications',` after `'Campaigns',` in `ALL_NAV_LABELS` (a superuser sees every section).

- [ ] **Step 10: Run the tests to verify they pass**

Run: `pnpm --filter @nanny-app/admin test -- segmented-control use-debounced-value notifications-page`
Expected: PASS (3 + 1 + 5 tests).

- [ ] **Step 11: Run the whole admin suite, typecheck and lint**

Run: `pnpm --filter @nanny-app/admin test && pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint`
Expected: PASS, no type errors, no lint errors.

- [ ] **Step 12: Commit**

```bash
git add apps/admin
git commit -m "$(cat <<'EOF'
feat(admin): Notifications section with the template list

API client for templates, audience preview, publish and history; the
Notifications nav item and page; a shared segmented control and debounce
hook for the editor and group rules.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---

### Task 10: Admin — template editor: content, image, channel, link, preview, save

> Note: the spec says to reuse `CampaignImageCropper`; it is generalised to `components/image-cropper.tsx` (`ImageCropper`, with `width`/`height` props) and campaigns move onto it, so the two croppers can never drift.
> Note: `GET /admin/packages` and `GET /admin/promo-codes` stay gated by their own sections (the backend contract adds `notifications` only to the groups and mother-picker routes). The link picker therefore lists packages/promo codes only for admins who can view those sections; anyone else keeps the saved link and is told why they can't choose another.
> Note: `POST …/audience-preview` needs `notifications` MANAGE (every non-GET does), so a view-only operator sees the saved audience by name but no live count.
> Note: the audience section is the slot the contract describes. This task ships `template-audience-fields.tsx` as a groups-only picker (real, saving code); Task 11 replaces that file with the full Groups / Specific mothers picker behind the same props.
> Note: text fields show their problem on blur. The link and audience pickers have no "finished typing" moment, so their problems appear after a Save attempt (with the summary).

**Files:**
- Create: `apps/admin/src/components/image-cropper.tsx` (moved from `features/campaigns/campaign-image-cropper.tsx`, which is deleted)
- Modify: `apps/admin/src/features/campaigns/campaign-form.tsx`, `apps/admin/src/features/campaigns/__tests__/campaign-form.test.tsx`, `apps/admin/src/components/ui/select.tsx`, `apps/admin/src/app.tsx`, `apps/admin/src/styles/global.css`, `apps/admin/src/styles/__tests__/contrast.test.ts`
- Create: `apps/admin/src/features/notifications/template-issues.ts`, `apps/admin/src/features/notifications/template-content-fields.tsx`, `apps/admin/src/features/notifications/template-link-fields.tsx`, `apps/admin/src/features/notifications/template-preview.tsx`, `apps/admin/src/features/notifications/template-audience-fields.tsx`, `apps/admin/src/features/notifications/template-editor.tsx`, `apps/admin/src/pages/notification-template-page.tsx`
- Test: `apps/admin/src/components/__tests__/image-cropper.test.tsx` (moved from `features/campaigns/__tests__/campaign-image-cropper.test.tsx`), `apps/admin/src/features/notifications/__tests__/fixtures.ts`, `apps/admin/src/features/notifications/__tests__/template-editor.test.tsx`

**Interfaces:**
- Consumes: Task 9's API functions, query keys, `SegmentedControl`, `notification-labels.ts`, `group-labels.ts`; Task 1's `NotificationTemplateInputSchema`, `NOTIFICATION_*` limits and image size.
- Produces:
  - `components/image-cropper.tsx`: `ImageCropper({ src, width, height, busy?, onCancel, onConfirm(area: PixelArea), onError })`.
  - `pages/notification-template-page.tsx`: `NotificationTemplatePage()` — `id === 'new'` renders a blank editor; otherwise loads `['notification-templates', id]`.
  - `features/notifications/template-editor.tsx`: `TemplateEditor({ template?: NotificationTemplate })` holding form state `NotificationTemplateInput`; the first Save of a new template creates it and `navigate(`/notifications/${id}`, { replace: true })`; `toTemplateInput(template)`.
  - `features/notifications/template-issues.ts`: `TemplateField`, `TEMPLATE_FIELD_ID`, `templateIssues(error, values)`, `issueSummary(issues)`.
  - `features/notifications/template-content-fields.tsx`: `TemplateContentFields({ values, onChange, onBlurField, errors, readOnly, onImageBusyChange })`.
  - `features/notifications/template-link-fields.tsx`: `TemplateLinkFields({ value, onChange, saved, readOnly, error })`, `useLinkActionLabel(value, saved, readOnly)`.
  - `features/notifications/template-preview.tsx`: `TemplatePreview({ title, body, imageUrl, channel, linkLabel })`.
  - `features/notifications/template-audience-fields.tsx`: `TemplateAudienceFields({ value, onChange, saved, readOnly, error, errorId })` (props fixed here; Task 11 replaces the body), `SavedAudience({ value, saved })`, types `AudienceValue`, `SavedAudienceNames`.
  - `components/ui/select.tsx`: `Select` gains `aria-describedby?` and `aria-invalid?`.
  - Route `/notifications/:id` under `<Guarded section="notifications">`.

#### Cycle A — one image cropper for campaigns and notifications

- [ ] **Step 1: Load the `nanny-app-admin-design` and `ui-ux-pro-max:ui-ux-pro-max` skills**

Apply ui-ux-pro-max §8 `inline-validation` (validate on blur), `error-placement` (error under the field, `aria-describedby`), `error-summary` + `focus-management` (focusable summary after a failed save), `input-helper-text`, `sheet-dismiss-confirm` (unsaved-changes guard), `success-feedback` ("Saved" toast); §1 `form-labels` (`<label for>`), `focus-states`, `color-not-only` (the counter says "N left", not only a colour), `alt-text`. Admin skill: tokens only; `Card`, `DetailHeader`, `Button`, `Select`, `ConfirmDialog`, `ActionMenu` from the barrel.

- [ ] **Step 2: Move the cropper test and make it size-agnostic (failing)**

```bash
mkdir -p apps/admin/src/components/__tests__
git mv apps/admin/src/features/campaigns/__tests__/campaign-image-cropper.test.tsx apps/admin/src/components/__tests__/image-cropper.test.tsx
```

Replace the contents of `apps/admin/src/components/__tests__/image-cropper.test.tsx`:

```tsx
/**
 * react-easy-crop measures the DOM, which jsdom can't, so it's replaced by a
 * stub that reports one crop. Pinned: the frame is the ratio of the size it is
 * given (the campaign banner, the 2:1 notification image), the reported pixel
 * area is what "Use image" hands back, and nothing can be confirmed before an
 * area exists.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CAMPAIGN_IMAGE_HEIGHT,
  CAMPAIGN_IMAGE_WIDTH,
  NOTIFICATION_IMAGE_HEIGHT,
  NOTIFICATION_IMAGE_WIDTH,
} from '@nanny-app/shared';

import { ImageCropper } from '@admin/components/image-cropper';

const AREA = { x: 10, y: 20, width: 800, height: 450 };
const cropperProps = vi.fn();
// The stub reports a crop area on mount unless a test turns this off.
let reportArea = true;

vi.mock('react-easy-crop', () => ({
  default: (props: {
    aspect: number;
    zoom: number;
    mediaProps: { onError: () => void };
    onCropComplete: (area: typeof AREA, areaPixels: typeof AREA) => void;
  }) => {
    cropperProps(props);
    const { onCropComplete } = props;
    useEffect(() => {
      if (reportArea) onCropComplete(AREA, AREA);
    }, [onCropComplete]);
    return <div data-testid="easy-crop" />;
  },
}));

beforeEach(() => {
  cropperProps.mockClear();
  reportArea = true;
});

function renderCropper(props: Partial<Parameters<typeof ImageCropper>[0]> = {}) {
  return render(
    <ImageCropper
      src="blob:pick"
      width={CAMPAIGN_IMAGE_WIDTH}
      height={CAMPAIGN_IMAGE_HEIGHT}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
      onError={vi.fn()}
      {...props}
    />,
  );
}

describe('ImageCropper', () => {
  it('frames the ratio it is given and confirms the chosen pixel area', async () => {
    const onConfirm = vi.fn();
    renderCropper({ onConfirm });
    expect(cropperProps).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect: CAMPAIGN_IMAGE_WIDTH / CAMPAIGN_IMAGE_HEIGHT,
        // The image fills the frame; 'contain' would shrink the frame to a tall image's width.
        objectFit: 'cover',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use image' }));
    expect(onConfirm).toHaveBeenCalledWith(AREA);
  });

  it('frames a notification image at 2:1', () => {
    renderCropper({ width: NOTIFICATION_IMAGE_WIDTH, height: NOTIFICATION_IMAGE_HEIGHT });
    expect(cropperProps).toHaveBeenCalledWith(expect.objectContaining({ aspect: 2 }));
  });

  it('cancels without confirming', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderCropper({ onCancel, onConfirm });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks both buttons while busy', () => {
    renderCropper({ busy: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use image' })).toBeDisabled();
  });

  it('cannot confirm before the cropper has reported an area', () => {
    reportArea = false;
    renderCropper();
    expect(screen.getByRole('button', { name: 'Use image' })).toBeDisabled();
  });

  it("passes the image-decode failure handler to the cropper's <img>", () => {
    const onError = vi.fn();
    renderCropper({ onError });
    const props = cropperProps.mock.calls[0]?.[0] as { mediaProps: { onError: () => void } };
    props.mediaProps.onError();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
```

In `apps/admin/src/features/campaigns/__tests__/campaign-form.test.tsx` point the mock at the new module (the stub's body is unchanged):

```tsx
vi.mock('@admin/components/image-cropper', () => ({
  ImageCropper: ({
    onCancel,
    onConfirm,
    onError,
  }: {
    onCancel: () => void;
    onConfirm: (area: typeof AREA) => void;
    onError: () => void;
  }) => (
    <div>
      <button type="button" onClick={onCancel}>
        Cancel crop
      </button>
      <button type="button" onClick={() => onConfirm(AREA)}>
        Use image
      </button>
      <button type="button" onClick={onError}>
        Break image
      </button>
    </div>
  ),
}));
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/admin test -- image-cropper campaign-form`
Expected: FAIL — `Cannot find module '@admin/components/image-cropper'`.

- [ ] **Step 4: Move the cropper and give it a size**

```bash
git mv apps/admin/src/features/campaigns/campaign-image-cropper.tsx apps/admin/src/components/image-cropper.tsx
```

Replace the contents of `apps/admin/src/components/image-cropper.tsx`:

```tsx
import { useCallback, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';

import { Button } from '@admin/components/ui';
import type { PixelArea } from '@admin/lib/crop-image';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type ImageCropperProps = {
  /** Object URL of the file the admin just picked. */
  src: string;
  /** The output size in px; the frame takes its ratio (1200×675 banner, 1024×512 notification). */
  width: number;
  height: number;
  /** Cropping/uploading in flight: the buttons lock. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (area: PixelArea) => void;
  /** The browser couldn't decode the picked file (HEIC in Chrome, a corrupt file). */
  onError: () => void;
};

/**
 * Frame a picked image to a fixed shape. The frame is fixed at `width:height`;
 * the admin pans and zooms the image under it, so what's inside the frame is
 * exactly what a mother sees. Rendered inline in the form that owns it — a
 * nested Modal would close that form on the same Escape.
 */
export function ImageCropper({ src, width, height, busy = false, onCancel, onConfirm, onError }: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<PixelArea | null>(null);

  const handleCropComplete = useCallback((_: Area, areaPixels: Area) => setArea(areaPixels), []);

  return (
    <div className="crop-stage">
      <div className="crop-stage-frame" style={{ aspectRatio: `${width} / ${height}` }}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={width / height}
          objectFit="cover"
          mediaProps={{ onError }}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>
      <input
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        onChange={(event) => setZoom(Number(event.target.value))}
        aria-label="Zoom"
        className="crop-stage-zoom"
        disabled={busy}
      />
      <div className="crop-stage-actions">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => area && onConfirm(area)} disabled={busy || area === null}>
          Use image
        </Button>
      </div>
    </div>
  );
}
```

In `apps/admin/src/features/campaigns/campaign-form.tsx` replace `import { CampaignImageCropper } from '@admin/features/campaigns/campaign-image-cropper';` with `import { ImageCropper } from '@admin/components/image-cropper';`, and the element with:

```tsx
            <ImageCropper
              src={pending.src}
              width={CAMPAIGN_IMAGE_WIDTH}
              height={CAMPAIGN_IMAGE_HEIGHT}
              busy={uploading}
              onCancel={discardPending}
              onConfirm={(area) => void handleCropConfirm(area)}
              onError={handleCropperError}
            />
```

- [ ] **Step 5: Run them to verify they pass**

Run: `pnpm --filter @nanny-app/admin test -- image-cropper campaign-form`
Expected: PASS (6 cropper tests; the campaign-form suite unchanged).

- [ ] **Step 6: Typecheck, lint, commit**

Run: `pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint && ! grep -rn "campaign-image-cropper\|CampaignImageCropper" apps/admin/src`
Expected: PASS, and the grep prints nothing.

```bash
git add apps/admin
git commit -m "$(cat <<'EOF'
refactor(admin): one image cropper sized by its caller

CampaignImageCropper becomes components/image-cropper.tsx with width and
height props, so the notification editor frames 1024x512 images with the
same tool.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

#### Cycle B — the editor

- [ ] **Step 7: Write the shared test fixtures**

`apps/admin/src/features/notifications/__tests__/fixtures.ts`:

```ts
/**
 * One backend for the notification editor tests (Tasks 10 and 11). The
 * handlers cover every request the editor makes on its own — groups, packages,
 * promo codes, the live count and the send history — so a test only adds the
 * request it is about.
 */
import type {
  AdminUser,
  NotificationBroadcast,
  NotificationTemplate,
  Package,
  PromoCode,
  UserGroup,
} from '@nanny-app/shared';
import { http, HttpResponse } from 'msw';

export function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

export const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
/** Sees notifications, changes nothing. */
export const VIEWER: AdminUser = { ...ADMIN, id: 2, role: 'OPERATOR', permissions: { notifications: 'VIEW' } };
/** Writes notifications, but has no Groups section. */
export const NOTIFIER: AdminUser = { ...ADMIN, id: 3, role: 'OPERATOR', permissions: { notifications: 'MANAGE' } };

export const LAPSED: UserGroup = {
  id: 2, name: 'Lapsed 30d', description: null, kind: 'DYNAMIC',
  rules: [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }],
  memberCount: 1240, createdAt: '2026-10-01T00:00:00.000Z',
};
export const BETA: UserGroup = {
  id: 9, name: 'Beta testers', description: null, kind: 'STATIC', rules: null,
  memberCount: 12, createdAt: '2026-10-01T00:00:00.000Z',
};

export const PACKAGE: Package = {
  id: 3, name: '10 hours', description: null, hours: 10, price: 1500, validityDays: 30,
  maxSkills: 0, isActive: true, expiresAt: null, createdAt: '2026-09-01T00:00:00.000Z',
};
export const PROMO: PromoCode = {
  id: 7, code: 'SAVE20', discountType: 'PERCENTAGE', value: 20, maxUsage: null,
  maxUsagePerUser: null, usageCount: 0, expiresAt: null, isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

export const TEMPLATE: NotificationTemplate = {
  id: 4, name: 'Win-back 30d', title: 'We miss you', body: 'Book this week and save 20%.',
  imageUrl: null, channel: 'BOTH', targetType: 'PROMO_CODE', packageId: null, promoCodeId: 7,
  package: null, promoCode: { id: 7, code: 'SAVE20' },
  audience: { type: 'GROUPS', groupIds: [2] },
  audienceGroups: [{ id: 2, name: 'Lapsed 30d', kind: 'DYNAMIC' }],
  audienceMothers: [], publishCount: 0, lastPublishedAt: null,
  createdAt: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-20T08:00:00.000Z',
};

export const BROADCAST: NotificationBroadcast = {
  id: 31, templateId: 4, status: 'SENT', title: 'We miss you', channel: 'BOTH',
  targeted: 1240, inAppCreated: 1240, pushSent: 1031, pushFailed: 0, noDevice: 209,
  skippedGroupIds: [], error: null, publishedBy: { id: 1, name: 'Ops Admin' },
  createdAt: '2026-10-20T09:00:00.000Z', completedAt: '2026-10-20T09:00:04.000Z',
};

export const editorHandlers = [
  http.get('/api/admin/groups', () => ok([LAPSED, BETA])),
  http.get('/api/admin/packages', () => ok([PACKAGE])),
  http.get('/api/admin/promo-codes', () => ok([PROMO])),
  http.post('/api/admin/notification-templates/audience-preview', () =>
    ok({ mothers: 1240, withPushDevice: 1031 }),
  ),
  http.get('/api/admin/notification-templates/:id/broadcasts', () => ok([])),
];
```

- [ ] **Step 8: Write the failing editor test**

`apps/admin/src/features/notifications/__tests__/template-editor.test.tsx`:

```tsx
/**
 * Writing a notification template: content with live character counts, a
 * cropped image, channel, link and audience, saved in one request. Problems
 * show beside their field once it is left, and a failed Save focuses a summary
 * that links to each one.
 */
import type { AdminUser, NotificationTemplate } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { TemplateEditor } from '@admin/features/notifications/template-editor';
import { cropImageToFile } from '@admin/lib/crop-image';
import { PermissionsProvider } from '@admin/lib/permissions';
import { uploadImageToFirebase } from '@admin/lib/storage';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

import { ADMIN, TEMPLATE, VIEWER, editorHandlers, ok } from './fixtures';

const AREA = { x: 0, y: 0, width: 1024, height: 512 };
const CROPPED = new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' });

vi.mock('@admin/lib/storage', () => ({
  uploadImageToFirebase: vi.fn().mockResolvedValue('https://cdn.example/n.jpg'),
}));
vi.mock('@admin/lib/crop-image', () => ({ cropImageToFile: vi.fn() }));
vi.mock('@admin/components/image-cropper', () => ({
  ImageCropper: ({ onConfirm }: { onConfirm: (area: typeof AREA) => void }) => (
    <button type="button" onClick={() => onConfirm(AREA)}>
      Use image
    </button>
  ),
}));

beforeEach(() => {
  vi.mocked(cropImageToFile).mockReset().mockResolvedValue(CROPPED);
  vi.mocked(uploadImageToFirebase).mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:picked');
  URL.revokeObjectURL = vi.fn();
});

function renderEditor({ template, me = ADMIN }: { template?: NotificationTemplate; me?: AdminUser } = {}) {
  server.use(http.get('/api/admin/me', () => ok(me)), ...editorHandlers);
  // A data router, as the app uses: the unsaved-changes guard needs useBlocker.
  const router = createMemoryRouter(
    [
      { path: '/notifications/new', element: <TemplateEditor /> },
      { path: '/notifications/12', element: <p>Template 12 open</p> },
      { path: '/notifications/:id', element: <TemplateEditor template={template} /> },
      { path: '/notifications', element: <p>Notification list</p> },
    ],
    { initialEntries: [template ? `/notifications/${template.id}` : '/notifications/new'] },
  );
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <RouterProvider router={router} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

const saveButton = () => screen.getByRole('button', { name: /^save$/i });

describe('TemplateEditor', () => {
  it('creates the template on its first Save, says Saved, and opens it at its own URL', async () => {
    let body: unknown;
    server.use(
      http.post('/api/admin/notification-templates', async ({ request }) => {
        body = await request.json();
        return ok({ ...TEMPLATE, id: 12 });
      }),
    );
    renderEditor();

    await userEvent.type(await screen.findByLabelText('Name'), 'Win-back 30d');
    await userEvent.type(screen.getByLabelText('Title'), 'We miss you');
    await userEvent.type(screen.getByLabelText('Message'), 'Book this week and save 20%.');
    await userEvent.click(await screen.findByRole('checkbox', { name: /lapsed 30d/i }));
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(body).toEqual({
        name: 'Win-back 30d',
        title: 'We miss you',
        body: 'Book this week and save 20%.',
        imageUrl: null,
        channel: 'BOTH',
        targetType: null,
        packageId: null,
        promoCodeId: null,
        audience: { type: 'GROUPS', groupIds: [2] },
      }),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(await screen.findByText('Template 12 open')).toBeInTheDocument();
  });

  it('on a failed Save, focuses a summary that links to each problem, and sends nothing', async () => {
    let posted = false;
    server.use(
      http.post('/api/admin/notification-templates', () => {
        posted = true;
        return ok(TEMPLATE);
      }),
    );
    renderEditor();

    await userEvent.click(await screen.findByRole('button', { name: /^save$/i }));
    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    expect(within(summary).getByRole('heading', { name: 'Fix 4 problems before saving' })).toBeInTheDocument();
    expect(within(summary).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Give the template a name.',
      'Write a title.',
      'Write the message.',
      'Choose at least one group.',
    ]);

    await userEvent.click(within(summary).getByRole('link', { name: 'Write a title.' }));
    const title = screen.getByLabelText('Title');
    expect(title).toHaveFocus();
    // The inline error stays beside the field too.
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toBe(false);
  });

  it("shows a field's problem once it is left, linked to the field", async () => {
    renderEditor();
    const name = await screen.findByLabelText('Name');
    await userEvent.click(name);
    await userEvent.tab();

    const error = screen.getByText('Give the template a name.');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.getAttribute('aria-describedby')).toContain(error.id);
    // The title has not been left yet, so it says nothing.
    expect(screen.queryByText('Write a title.')).not.toBeInTheDocument();
  });

  it('counts characters and turns the counter to a warning near the limit', async () => {
    renderEditor();
    const title = await screen.findByLabelText('Title');
    expect(screen.getByText('0 / 65')).toBeInTheDocument();
    expect(title).toHaveAttribute('maxlength', '65');

    await userEvent.click(title);
    await userEvent.paste('x'.repeat(60));
    const counter = screen.getByText(/^60 \/ 65/);
    expect(counter).toHaveTextContent('60 / 65 · 5 left');
    expect(counter).toHaveClass('char-counter--warn');
  });

  it('links to a package instead of the promo code', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/admin/notification-templates/4', async ({ request }) => {
        body = await request.json();
        return ok(TEMPLATE);
      }),
    );
    renderEditor({ template: TEMPLATE });

    await userEvent.click(await screen.findByRole('radio', { name: 'Package' }));
    await userEvent.click(screen.getByRole('button', { name: 'Linked package' }));
    await userEvent.click(await screen.findByRole('option', { name: '10 hours' }));
    // The inbox preview's action follows the link.
    expect(screen.getByText('View package')).toBeInTheDocument();
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(body).toMatchObject({ targetType: 'PACKAGE', packageId: 3, promoCodeId: null }),
    );
  });

  it('crops a picked image to 1024 × 512 and uploads it to the notifications folder', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/admin/notification-templates/4', async ({ request }) => {
        body = await request.json();
        return ok(TEMPLATE);
      }),
    );
    renderEditor({ template: TEMPLATE });

    await userEvent.upload(
      await screen.findByLabelText('Image'),
      new File(['png'], 'photo.png', { type: 'image/png' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use image' }));

    await waitFor(() => expect(uploadImageToFirebase).toHaveBeenCalledWith(CROPPED, 'notifications'));
    expect(cropImageToFile).toHaveBeenCalledWith('blob:picked', AREA, 1024, 512, 'photo.png');
    expect(await screen.findByRole('button', { name: 'Remove image' })).toBeInTheDocument();
    await userEvent.click(saveButton());
    await waitFor(() => expect(body).toMatchObject({ imageUrl: 'https://cdn.example/n.jpg' }));
  });

  it('asks before leaving with unsaved changes; Stay keeps them, Leave goes', async () => {
    renderEditor({ template: TEMPLATE });
    await userEvent.type(await screen.findByLabelText('Title'), '!');

    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave without saving?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText('Title')).toHaveValue('We miss you!');

    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Notification list')).toBeInTheDocument();
  });

  it('is read-only for a view-only operator', async () => {
    renderEditor({ template: TEMPLATE, me: VIEWER });
    expect(await screen.findByLabelText('Title')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Image')).not.toBeInTheDocument();
    // The audience and link by name, without the controls that change them.
    expect(screen.getByText('Lapsed 30d')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Starts a booking with code SAVE20')).toBeInTheDocument();
  });
});
```

Add to `apps/admin/src/styles/__tests__/contrast.test.ts`, inside the `describe`:

```ts
  it('the near-limit character counter is readable on a card', () => {
    expect(contrast(token(ruleVar('.char-counter--warn', 'color')), token('--color-surface'))).toBeGreaterThanOrEqual(4.5);
  });
```

- [ ] **Step 9: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/admin test -- template-editor contrast`
Expected: FAIL — `Cannot find module '@admin/features/notifications/template-editor'`; the contrast case fails with `.char-counter--warn has no color: var(--…)`.

- [ ] **Step 10: Let `Select` carry a field's error**

In `apps/admin/src/components/ui/select.tsx` add to `SelectProps`:

```ts
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
```

destructure them in the signature (`'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid,`) and pass them to the trigger `<button>` next to `aria-label`:

```tsx
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
```

- [ ] **Step 11: Map validation issues to fields**

`apps/admin/src/features/notifications/template-issues.ts`:

```ts
import type { NotificationTemplateInput } from '@nanny-app/shared';
import { NOTIFICATION_AUDIENCE_MAX_GROUPS, NOTIFICATION_AUDIENCE_MAX_MOTHERS } from '@nanny-app/shared';

export type TemplateField = 'name' | 'title' | 'body' | 'imageUrl' | 'link' | 'audience';

/** The element each problem lives on — the error summary links to and focuses it. */
export const TEMPLATE_FIELD_ID: Record<TemplateField, string> = {
  name: 'notification-name',
  title: 'notification-title',
  body: 'notification-body',
  imageUrl: 'notification-image',
  link: 'notification-link',
  audience: 'notification-audience',
};

/** Form order: the summary lists problems top to bottom, as the fields appear. */
const ORDER: readonly TemplateField[] = ['name', 'title', 'body', 'imageUrl', 'link', 'audience'];

export type TemplateIssues = Partial<Record<TemplateField, string>>;

type IssueList = { issues: { path: PropertyKey[]; message: string; code?: string }[] };

/**
 * NotificationTemplateInputSchema issues → one message per field, in operator
 * words ("Write a title." rather than Zod's "String must contain at least 1
 * character(s)"). The first issue on a field wins.
 */
export function templateIssues(
  error: IssueList | undefined,
  values: Pick<NotificationTemplateInput, 'targetType' | 'audience'>,
): TemplateIssues {
  const out: TemplateIssues = {};
  if (!error) return out;
  const mothers = values.audience.type === 'MOTHERS';
  for (const issue of error.issues) {
    const [root] = issue.path;
    const tooSmall = issue.code === 'too_small';
    const tooBig = issue.code === 'too_big';
    if (root === 'name') out.name ??= tooSmall ? 'Give the template a name.' : issue.message;
    else if (root === 'title') out.title ??= tooSmall ? 'Write a title.' : issue.message;
    else if (root === 'body') out.body ??= tooSmall ? 'Write the message.' : issue.message;
    else if (root === 'imageUrl') out.imageUrl ??= 'The image didn’t upload properly. Choose it again.';
    else if (root === 'targetType' || root === 'packageId' || root === 'promoCodeId') {
      out.link ??=
        values.targetType === 'PACKAGE'
          ? 'Choose the package to link to.'
          : values.targetType === 'PROMO_CODE'
            ? 'Choose the promo code to link to.'
            : issue.message;
    } else if (root === 'audience') {
      out.audience ??= tooSmall
        ? mothers
          ? 'Choose at least one mother.'
          : 'Choose at least one group.'
        : tooBig
          ? mothers
            ? `Choose at most ${NOTIFICATION_AUDIENCE_MAX_MOTHERS.toLocaleString('en-US')} mothers.`
            : `Choose at most ${NOTIFICATION_AUDIENCE_MAX_GROUPS} groups.`
          : issue.message;
    }
  }
  return out;
}

export function issueSummary(issues: TemplateIssues): { field: TemplateField; message: string }[] {
  return ORDER.flatMap((field) => {
    const message = issues[field];
    return message ? [{ field, message }] : [];
  });
}
```

- [ ] **Step 12: Create the content fields (name, title, message, image)**

`apps/admin/src/features/notifications/template-content-fields.tsx`:

```tsx
import type { NotificationTemplateInput } from '@nanny-app/shared';
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_IMAGE_HEIGHT,
  NOTIFICATION_IMAGE_WIDTH,
  NOTIFICATION_TEMPLATE_NAME_MAX,
  NOTIFICATION_TITLE_MAX,
} from '@nanny-app/shared';
import { useEffect, useState, type ChangeEvent } from 'react';

import { ImageCropper } from '@admin/components/image-cropper';
import { Button } from '@admin/components/ui';
import { cropImageToFile, type PixelArea } from '@admin/lib/crop-image';
import { uploadImageToFirebase } from '@admin/lib/storage';

import { TEMPLATE_FIELD_ID, type TemplateField } from './template-issues';

type ContentValues = Pick<NotificationTemplateInput, 'name' | 'title' | 'body' | 'imageUrl'>;
type ContentField = 'name' | 'title' | 'body' | 'imageUrl';

type TemplateContentFieldsProps = {
  values: ContentValues;
  onChange: (patch: Partial<ContentValues>) => void;
  /** A text field was left — its problem may now show. */
  onBlurField: (field: TemplateField) => void;
  errors: Partial<Record<ContentField, string>>;
  readOnly: boolean;
  /** True while an image is being framed or uploaded; the editor holds Save until it settles. */
  onImageBusyChange: (busy: boolean) => void;
};

/** Name, title, message and image — the words and picture a mother sees. */
export function TemplateContentFields({
  values,
  onChange,
  onBlurField,
  errors,
  readOnly,
  onImageBusyChange,
}: TemplateContentFieldsProps) {
  return (
    <>
      <CountedField
        id={TEMPLATE_FIELD_ID.name}
        label="Name"
        hint="Only admins see this. It names the template in the list."
        value={values.name}
        max={NOTIFICATION_TEMPLATE_NAME_MAX}
        error={errors.name}
        disabled={readOnly}
        onChange={(name) => onChange({ name })}
        onBlur={() => onBlurField('name')}
      />
      <CountedField
        id={TEMPLATE_FIELD_ID.title}
        label="Title"
        hint="The bold first line. Phones cut long titles, so keep it short."
        value={values.title}
        max={NOTIFICATION_TITLE_MAX}
        error={errors.title}
        disabled={readOnly}
        onChange={(title) => onChange({ title })}
        onBlur={() => onBlurField('title')}
      />
      <CountedField
        id={TEMPLATE_FIELD_ID.body}
        label="Message"
        hint="Plain text. A push banner shows the first two lines; the inbox shows it all."
        value={values.body}
        max={NOTIFICATION_BODY_MAX}
        multiline
        error={errors.body}
        disabled={readOnly}
        onChange={(body) => onChange({ body })}
        onBlur={() => onBlurField('body')}
      />
      <ImageField
        imageUrl={values.imageUrl ?? null}
        onChange={(imageUrl) => onChange({ imageUrl })}
        readOnly={readOnly}
        error={errors.imageUrl}
        onBusyChange={onImageBusyChange}
      />
    </>
  );
}

type CountedFieldProps = {
  id: string;
  label: string;
  hint: string;
  value: string;
  max: number;
  multiline?: boolean;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

/**
 * A text field with a live character count. The count turns to a warning in
 * the last 10% and says how many are left, so it is not colour alone. The
 * browser stops typing at the limit, so it can never be over. Hint, count and
 * error are read out with the field via aria-describedby.
 */
function CountedField({ id, label, hint, value, max, multiline = false, error, disabled, onChange, onBlur }: CountedFieldProps) {
  const hintId = `${id}-hint`;
  const counterId = `${id}-count`;
  const errorId = `${id}-error`;
  const remaining = max - value.length;
  const warn = remaining <= Math.ceil(max * 0.1);
  const shared = {
    id,
    className: 'input',
    value,
    maxLength: max,
    disabled,
    // Arabic text reads right-to-left as it is typed.
    dir: 'auto' as const,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [hintId, counterId, error ? errorId : null].filter(Boolean).join(' '),
    onBlur,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? <textarea rows={4} {...shared} /> : <input type="text" {...shared} />}
      <div className="field-meta">
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
        <span id={counterId} className={`char-counter${warn ? ' char-counter--warn' : ''}`}>
          {value.length} / {max}
          {warn ? ` · ${remaining} left` : ''}
        </span>
      </div>
      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

type ImageFieldProps = {
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  readOnly: boolean;
  error?: string;
  onBusyChange: (busy: boolean) => void;
};

const IMAGE_HINT = `Optional. You’ll crop it to ${NOTIFICATION_IMAGE_WIDTH} × ${NOTIFICATION_IMAGE_HEIGHT} px (2:1). It shows in the inbox and on Android push banners; iPhone banners show the text only.`;

/** Pick → frame at 2:1 → upload to Firebase Storage `notifications/`. Remove clears it. */
function ImageField({ imageUrl, onChange, readOnly, error, onBusyChange }: ImageFieldProps) {
  const [pending, setPending] = useState<{ src: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const id = TEMPLATE_FIELD_ID.imageUrl;
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // The object URL lives exactly as long as the crop it backs.
  const pendingSrc = pending?.src;
  useEffect(() => {
    if (!pendingSrc) return;
    return () => URL.revokeObjectURL(pendingSrc);
  }, [pendingSrc]);

  const busy = pending !== null || uploading;
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires a change.
    event.target.value = '';
    if (!file) return;
    setUploadError(null);
    setPending({ src: URL.createObjectURL(file), name: file.name });
  }

  async function confirm(area: PixelArea) {
    if (!pending) return;
    setUploading(true);
    setUploadError(null);
    try {
      const file = await cropImageToFile(
        pending.src,
        area,
        NOTIFICATION_IMAGE_WIDTH,
        NOTIFICATION_IMAGE_HEIGHT,
        pending.name,
      );
      onChange(await uploadImageToFirebase(file, 'notifications'));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'The image didn’t upload. Try again.');
    } finally {
      setUploading(false);
      setPending(null);
    }
  }

  if (readOnly) {
    return imageUrl ? (
      <div className="field">
        <span className="field-label">Image</span>
        <img className="notif-image-thumb" src={imageUrl} alt="The notification’s image" />
      </div>
    ) : null;
  }

  if (pending) {
    // Not a <label>: it would hand its name to the cropper's first control (Zoom).
    return (
      <div className="field" role="group" aria-labelledby={labelId} aria-describedby={hintId}>
        <span className="field-label" id={labelId}>
          Image
        </span>
        <ImageCropper
          src={pending.src}
          width={NOTIFICATION_IMAGE_WIDTH}
          height={NOTIFICATION_IMAGE_HEIGHT}
          busy={uploading}
          onCancel={() => setPending(null)}
          onConfirm={(area) => void confirm(area)}
          onError={() => {
            setUploadError('Couldn’t read that image. Try a JPEG or PNG.');
            setPending(null);
          }}
        />
        <span className="field-hint" id={hintId} role="status">
          {uploading ? 'Uploading the image…' : IMAGE_HINT}
        </span>
      </div>
    );
  }

  const message = uploadError ?? error;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        Image
      </label>
      {imageUrl && (
        <div className="notif-image-current">
          <img className="notif-image-thumb" src={imageUrl} alt="The notification’s current image" />
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove image
          </Button>
        </div>
      )}
      <input
        id={id}
        className="input"
        type="file"
        accept="image/*"
        onChange={pick}
        aria-invalid={message ? true : undefined}
        aria-describedby={[hintId, message ? errorId : null].filter(Boolean).join(' ')}
      />
      <span className="field-hint" id={hintId}>
        {IMAGE_HINT}
      </span>
      {message && (
        <span className="field-error" id={errorId} role="alert">
          {message}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Create the link fields**

`apps/admin/src/features/notifications/template-link-fields.tsx`:

```tsx
import type {
  CampaignTargetType,
  NotificationTemplate,
  NotificationTemplateInput,
  Package,
  PromoCode,
} from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import { SegmentedControl, Select, type SegmentedOption, type SelectOption } from '@admin/components/ui';
import { fetchPackages, fetchPromoCodes } from '@admin/lib/api';
import { usePermissions } from '@admin/lib/permissions';

import { linkActionLabel } from './notification-labels';
import { TEMPLATE_FIELD_ID } from './template-issues';

export type LinkValue = Pick<NotificationTemplateInput, 'targetType' | 'packageId' | 'promoCodeId'>;
type SavedLink = Pick<NotificationTemplate, 'package' | 'promoCode'>;
type LinkKind = 'NONE' | CampaignTargetType;

const KIND_OPTIONS: readonly SegmentedOption<LinkKind>[] = [
  { value: 'NONE', label: 'None' },
  { value: 'PACKAGE', label: 'Package' },
  { value: 'PROMO_CODE', label: 'Promo code' },
];

/** Can a mother still use it? Publish refuses anything else, so only these are offered. */
const isLivePackage = (p: Package) =>
  p.isActive && (p.expiresAt === null || Date.parse(p.expiresAt) > Date.now());
const isLivePromo = (c: PromoCode) =>
  c.isActive &&
  (c.expiresAt === null || Date.parse(c.expiresAt) > Date.now()) &&
  (c.maxUsage === null || c.usageCount < c.maxUsage);

/**
 * The package and promo-code lists, loaded only for the kind being chosen and
 * only for an admin who may read those sections (they are not opened to the
 * notifications section on the API).
 */
function useLinkCatalog(targetType: CampaignTargetType | null, readOnly: boolean) {
  const { can } = usePermissions();
  const packagesAllowed = can('packages', 'VIEW');
  const promosAllowed = can('promoCodes', 'VIEW');
  const packages = useQuery({
    queryKey: ['packages'],
    queryFn: fetchPackages,
    enabled: !readOnly && packagesAllowed && targetType === 'PACKAGE',
  });
  const promoCodes = useQuery({
    queryKey: ['promo-codes'],
    queryFn: fetchPromoCodes,
    enabled: !readOnly && promosAllowed && targetType === 'PROMO_CODE',
  });
  return { packages, promoCodes, packagesAllowed, promosAllowed };
}

/** The action line for the inbox-card preview ("Book with code SAVE20"). */
export function useLinkActionLabel(value: LinkValue, saved: SavedLink, readOnly: boolean): string | null {
  const { promoCodes } = useLinkCatalog(value.targetType, readOnly);
  if (value.targetType !== 'PROMO_CODE') return linkActionLabel(value.targetType, null);
  const code =
    promoCodes.data?.find((c) => c.id === value.promoCodeId)?.code ??
    (saved.promoCode && saved.promoCode.id === value.promoCodeId ? saved.promoCode.code : null);
  return linkActionLabel('PROMO_CODE', code);
}

type TemplateLinkFieldsProps = {
  value: LinkValue;
  onChange: (next: LinkValue) => void;
  /** The names the saved template resolved, shown when the lists can't be loaded. */
  saved: SavedLink;
  readOnly: boolean;
  error?: string;
};

/** None / Package / Promo code, then which one. Exactly one id is ever set. */
export function TemplateLinkFields({ value, onChange, saved, readOnly, error }: TemplateLinkFieldsProps) {
  const { packages, promoCodes, packagesAllowed, promosAllowed } = useLinkCatalog(value.targetType, readOnly);
  const kind: LinkKind = value.targetType ?? 'NONE';
  const id = TEMPLATE_FIELD_ID.link;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  if (readOnly) {
    return (
      <p className="link-summary">
        {kind === 'PACKAGE'
          ? `Opens package: ${saved.package?.name ?? `#${value.packageId ?? ''}`}`
          : kind === 'PROMO_CODE'
            ? `Starts a booking with code ${saved.promoCode?.code ?? `#${value.promoCodeId ?? ''}`}`
            : 'No link. Tapping it opens the app.'}
      </p>
    );
  }

  const setKind = (next: LinkKind) =>
    onChange({ targetType: next === 'NONE' ? null : next, packageId: null, promoCodeId: null });

  const isPackage = kind === 'PACKAGE';
  let options: SelectOption<number>[] = [];
  let allowed = true;
  if (kind === 'PACKAGE') {
    allowed = packagesAllowed;
    options = packagesAllowed
      ? (packages.data ?? [])
          .filter((p) => isLivePackage(p) || p.id === value.packageId)
          .map((p) => ({ value: p.id, label: isLivePackage(p) ? p.name : `${p.name} (no longer available)` }))
      : saved.package
        ? [{ value: saved.package.id, label: saved.package.name }]
        : [];
  } else if (kind === 'PROMO_CODE') {
    allowed = promosAllowed;
    options = promosAllowed
      ? (promoCodes.data ?? [])
          .filter((c) => isLivePromo(c) || c.id === value.promoCodeId)
          .map((c) => ({ value: c.id, label: isLivePromo(c) ? c.code : `${c.code} (no longer usable)` }))
      : saved.promoCode
        ? [{ value: saved.promoCode.id, label: saved.promoCode.code }]
        : [];
  }

  const hint = !allowed
    ? `You need access to ${isPackage ? 'Packages' : 'Promo Codes'} to choose a different one.`
    : isPackage
      ? 'Tapping it opens this package, ready to buy. Only packages on sale are listed.'
      : 'Tapping it starts a booking with this code already applied. Only codes that can still be used are listed.';

  return (
    <div className="link-fields">
      <SegmentedControl legend="Link" hideLegend value={kind} options={KIND_OPTIONS} onChange={setKind} />
      {kind === 'NONE' ? (
        <p className="field-hint">No link. Tapping the notification opens the app.</p>
      ) : (
        <div className="field">
          <span className="field-label">{isPackage ? 'Package' : 'Promo code'}</span>
          <Select<number>
            id={id}
            aria-label={isPackage ? 'Linked package' : 'Linked promo code'}
            value={(isPackage ? value.packageId : value.promoCodeId) ?? 0}
            options={[{ value: 0, label: isPackage ? 'Choose a package…' : 'Choose a promo code…' }, ...options]}
            onChange={(picked) =>
              onChange(
                isPackage
                  ? { targetType: 'PACKAGE', packageId: picked === 0 ? null : picked, promoCodeId: null }
                  : { targetType: 'PROMO_CODE', packageId: null, promoCodeId: picked === 0 ? null : picked },
              )
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(' ')}
          />
          <span className="field-hint" id={hintId}>
            {hint}
          </span>
          {error && (
            <span className="field-error" id={errorId}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 14: Create the preview**

`apps/admin/src/features/notifications/template-preview.tsx`:

```tsx
import type { NotificationChannel } from '@nanny-app/shared';

type TemplatePreviewProps = {
  title: string;
  body: string;
  imageUrl: string | null;
  channel: NotificationChannel;
  /** "View package" / "Book with code SAVE20"; null without a link. */
  linkLabel: string | null;
};

/**
 * What a mother sees: the push banner (when the channel pushes) and the inbox
 * card (when it writes to the inbox), the image in the same fixed 2:1 box the
 * app uses. A decorative copy of the form, so its image has empty alt text.
 */
export function TemplatePreview({ title, body, imageUrl, channel, linkLabel }: TemplatePreviewProps) {
  const shownTitle = title.trim() || 'Your title';
  const shownBody = body.trim() || 'Your message';
  const sample = (filled: string) => (filled.trim() ? '' : ' notif-placeholder');
  return (
    <aside className="notif-preview" aria-label="Preview">
      <h3 className="notif-preview-heading">Preview</h3>
      {channel !== 'IN_APP' && (
        <figure className="notif-preview-block">
          <figcaption>Push notification</figcaption>
          <div className="notif-push">
            <div className="notif-push-head">
              <span className="notif-push-app" aria-hidden>
                N
              </span>
              <span>NannyNow</span>
              <span className="notif-push-time">now</span>
            </div>
            <p className={`notif-push-title${sample(title)}`} dir="auto">
              {shownTitle}
            </p>
            <p className={`notif-push-body${sample(body)}`} dir="auto">
              {shownBody}
            </p>
            {imageUrl && (
              <div className="notif-image-box">
                <img src={imageUrl} alt="" />
              </div>
            )}
          </div>
          {imageUrl && <p className="notif-preview-note">Android shows the image; iPhones show the text only.</p>}
        </figure>
      )}
      {channel !== 'PUSH' && (
        <figure className="notif-preview-block">
          <figcaption>Inbox</figcaption>
          <div className="notif-card">
            {imageUrl && (
              <div className="notif-image-box">
                <img src={imageUrl} alt="" />
              </div>
            )}
            <p className={`notif-card-title${sample(title)}`} dir="auto">
              {shownTitle}
            </p>
            <p className={`notif-card-body${sample(body)}`} dir="auto">
              {shownBody}
            </p>
            {linkLabel && <span className="notif-card-action">{linkLabel}</span>}
          </div>
        </figure>
      )}
    </aside>
  );
}
```

- [ ] **Step 15: Create the audience slot (groups only; Task 11 replaces it)**

`apps/admin/src/features/notifications/template-audience-fields.tsx`:

```tsx
import type { NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import { Badge, ErrorState, Skeleton } from '@admin/components/ui';
import { GROUP_KIND_LABEL, GROUP_KIND_TONE } from '@admin/features/groups/group-labels';
import { fetchUserGroups } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { formatCount, mothersLabel } from './notification-labels';
import { TEMPLATE_FIELD_ID } from './template-issues';

export type AudienceValue = NotificationTemplateInput['audience'];
export type SavedAudienceNames = {
  groups: NotificationTemplate['audienceGroups'];
  mothers: NotificationTemplate['audienceMothers'];
};

export type TemplateAudienceFieldsProps = {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
  /** Names the saved template resolved — for read-only display and the chosen-mothers list. */
  saved: SavedAudienceNames;
  readOnly: boolean;
  error?: string;
  errorId: string;
};

/** Groups to send to. (Task 11 adds "Specific mothers", the live count and Save-as-group.) */
export function TemplateAudienceFields({ value, onChange, saved, readOnly, error, errorId }: TemplateAudienceFieldsProps) {
  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchUserGroups, enabled: !readOnly });
  if (readOnly) return <SavedAudience value={value} saved={saved} />;

  const groupIds = value.type === 'GROUPS' ? value.groupIds : [];
  const toggle = (id: number) =>
    onChange({
      type: 'GROUPS',
      groupIds: groupIds.includes(id) ? groupIds.filter((g) => g !== id) : [...groupIds, id],
    });

  return (
    <fieldset
      className="audience-groups"
      id={TEMPLATE_FIELD_ID.audience}
      tabIndex={-1}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="sr-only">Groups</legend>
      {groups.isPending && (
        <>
          <span className="sr-only">Loading groups…</span>
          <Skeleton width="12rem" height="1.25rem" />
          <Skeleton width="10rem" height="1.25rem" />
        </>
      )}
      {groups.isError && (
        <ErrorState
          title="We couldn’t load the groups"
          message={apiErrorMessage(groups.error)}
          onRetry={() => void groups.refetch()}
          retrying={groups.isFetching}
        />
      )}
      {(groups.data ?? []).map((g) => (
        <label key={g.id} className="audience-group">
          <input type="checkbox" checked={groupIds.includes(g.id)} onChange={() => toggle(g.id)} />
          <span className="audience-group-name">{g.name}</span>
        </label>
      ))}
      {groups.data?.length === 0 && <p className="field-hint">No groups yet. Create one on the Groups page.</p>}
      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}
    </fieldset>
  );
}

/** The saved audience by name, for an admin who can't change it. */
export function SavedAudience({ value, saved }: { value: AudienceValue; saved: SavedAudienceNames }) {
  if (value.type === 'GROUPS') {
    const byId = new Map(saved.groups.map((g) => [g.id, g]));
    return (
      <ul className="audience-saved">
        {value.groupIds.map((id) => {
          const group = byId.get(id);
          return (
            <li key={id}>
              <span>{group?.name ?? `Group #${id} (deleted)`}</span>
              {group && <Badge tone={GROUP_KIND_TONE[group.kind]}>{GROUP_KIND_LABEL[group.kind]}</Badge>}
            </li>
          );
        })}
      </ul>
    );
  }
  const names = new Map(saved.mothers.map((m) => [m.id, m.name]));
  const shown = value.motherIds.slice(0, 8).map((id) => names.get(id) ?? `Mother #${id}`);
  const more = value.motherIds.length - shown.length;
  return (
    <p className="audience-saved-mothers">
      {mothersLabel(value.motherIds.length)}: {shown.join(', ')}
      {more > 0 ? `, and ${formatCount(more)} more` : ''}
    </p>
  );
}
```

- [ ] **Step 16: Create the editor and the page**

`apps/admin/src/features/notifications/template-editor.tsx`:

```tsx
import type { NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import { NotificationTemplateInputSchema } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';

import {
  ActionMenu,
  Button,
  Card,
  ConfirmDialog,
  DetailHeader,
  ICON_SIZE,
  MenuItem,
  SegmentedControl,
  Trash2,
  useToast,
  type SegmentedOption,
} from '@admin/components/ui';
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  updateNotificationTemplate,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

import { CHANNEL_HINT, CHANNEL_LABEL } from './notification-labels';
import { TemplateAudienceFields } from './template-audience-fields';
import { TemplateContentFields } from './template-content-fields';
import { TEMPLATE_FIELD_ID, issueSummary, templateIssues, type TemplateField } from './template-issues';
import { TemplateLinkFields, useLinkActionLabel } from './template-link-fields';
import { TemplatePreview } from './template-preview';

type Channel = NotificationTemplateInput['channel'];

const CHANNEL_OPTIONS: readonly SegmentedOption<Channel>[] = (['IN_APP', 'PUSH', 'BOTH'] as const).map(
  (value) => ({ value, label: CHANNEL_LABEL[value] }),
);

const BLANK: NotificationTemplateInput = {
  name: '',
  title: '',
  body: '',
  imageUrl: null,
  channel: 'BOTH',
  targetType: null,
  packageId: null,
  promoCodeId: null,
  audience: { type: 'GROUPS', groupIds: [] },
};

/** A saved template → the editor's form state (the same shape the API takes back). */
export function toTemplateInput(t: NotificationTemplate): NotificationTemplateInput {
  return {
    name: t.name,
    title: t.title,
    body: t.body,
    imageUrl: t.imageUrl,
    channel: t.channel,
    targetType: t.targetType,
    packageId: t.packageId,
    promoCodeId: t.promoCodeId,
    audience: t.audience,
  };
}

/** What is validated and sent: the text fields without stray spaces. */
const clean = (v: NotificationTemplateInput): NotificationTemplateInput => ({
  ...v,
  name: v.name.trim(),
  title: v.title.trim(),
  body: v.body.trim(),
});

type TemplateEditorProps = {
  /** The saved template. Omit for /notifications/new, whose first Save creates it. */
  template?: NotificationTemplate;
};

/** One notification template: content, image, channel, link and audience, saved in one request. */
export function TemplateEditor({ template }: TemplateEditorProps) {
  const isNew = template === undefined;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('notifications');
  const [values, setValues] = useState<NotificationTemplateInput>(() =>
    template ? toTemplateInput(template) : BLANK,
  );
  const [dirty, setDirty] = useState(false);
  // Fields the admin has left: their problems show from then on.
  const [touched, setTouched] = useState<ReadonlySet<TemplateField>>(new Set());
  // A Save was tried with problems: every problem shows, plus the summary.
  const [attempted, setAttempted] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Bumped on each failed Save so the summary takes focus every time, not only the first.
  const [summaryFocus, setSummaryFocus] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryHeadingId = useId();
  const channelHintId = useId();
  // Set just before navigating away on purpose (create, delete) so the guard lets it through.
  const leavingOnPurpose = useRef(false);

  // Unsaved edits: ask before an in-app navigation, and let the browser ask
  // before the tab closes or reloads.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leavingOnPurpose.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const payload = useMemo(() => clean(values), [values]);
  const validation = useMemo(() => NotificationTemplateInputSchema.safeParse(payload), [payload]);
  const issues = useMemo(
    () => templateIssues(validation.success ? undefined : validation.error, payload),
    [validation, payload],
  );
  const summary = issueSummary(issues);
  const shown = (field: TemplateField) => (attempted || touched.has(field) ? issues[field] : undefined);

  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus();
  }, [summaryFocus]);

  const update = (patch: Partial<NotificationTemplateInput>) => {
    setValues((v) => ({ ...v, ...patch }));
    setDirty(true);
  };
  const markTouched = (field: TemplateField) =>
    setTouched((t) => (t.has(field) ? t : new Set([...t, field])));

  const savedAudience = { groups: template?.audienceGroups ?? [], mothers: template?.audienceMothers ?? [] };
  const savedLink = { package: template?.package ?? null, promoCode: template?.promoCode ?? null };
  const linkLabel = useLinkActionLabel(values, savedLink, !canManage);

  const save = useMutation({
    mutationFn: () =>
      template ? updateNotificationTemplate(template.id, payload) : createNotificationTemplate(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(['notification-templates', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'], exact: true });
      setDirty(false);
      toast.success('Saved');
      if (isNew) {
        leavingOnPurpose.current = true;
        navigate(`/notifications/${saved.id}`, { replace: true });
      }
    },
    onError: (err) => toast.error('Couldn’t save the notification', apiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => deleteNotificationTemplate(template?.id ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template deleted');
      leavingOnPurpose.current = true;
      navigate('/notifications');
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error('Couldn’t delete the template', apiErrorMessage(err));
    },
  });

  // Inputs lock while a save is in flight so an edit can't be marked saved by its response.
  const locked = !canManage || save.isPending;
  // A new template has nothing on the server yet, so it always has something to save.
  const unsaved = dirty || isNew;

  const trySave = () => {
    if (imageBusy || save.isPending) return;
    if (validation.success) {
      save.mutate();
      return;
    }
    setAttempted(true);
    setSummaryFocus((n) => n + 1);
  };

  const problems = attempted ? summary.length : 0;
  const status =
    problems > 0
      ? `${problems} ${problems === 1 ? 'problem' : 'problems'} to fix before saving.`
      : imageBusy
        ? 'Finish the image before saving.'
        : !unsaved
          ? 'Saved. Ready to publish.'
          : isNew && !dirty
            ? 'Not saved yet. Save to create the template.'
            : 'Unsaved changes. Save before publishing.';

  return (
    <section>
      <DetailHeader
        title={values.name.trim() || (isNew ? 'New notification' : 'Untitled notification')}
        subtitle="A template: save it, then publish to send it now. Publish it again whenever you like."
        backTo="/notifications"
        backLabel="Notifications"
        actions={
          canManage && (
            <>
              <Button
                variant={unsaved ? 'primary' : 'ghost'}
                onClick={trySave}
                disabled={!unsaved || save.isPending || imageBusy}
              >
                Save
              </Button>
              {!isNew && (
                <ActionMenu label="More actions for this notification">
                  <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setConfirmDelete(true)}>
                    Delete template
                  </MenuItem>
                </ActionMenu>
              )}
            </>
          )
        }
      />
      {canManage && (
        <p role="status" className={`template-editor-status${problems > 0 ? ' template-editor-status--problem' : ''}`}>
          {status}
        </p>
      )}
      {attempted && summary.length > 0 && (
        <div
          className="error-summary"
          role="alert"
          aria-labelledby={summaryHeadingId}
          tabIndex={-1}
          ref={summaryRef}
        >
          <h3 id={summaryHeadingId}>
            Fix {summary.length} {summary.length === 1 ? 'problem' : 'problems'} before saving
          </h3>
          <ul>
            {summary.map(({ field, message }) => (
              <li key={field}>
                <a
                  href={`#${TEMPLATE_FIELD_ID[field]}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(TEMPLATE_FIELD_ID[field])?.focus();
                  }}
                >
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="template-editor">
        <div className="template-editor-form">
          <Card title="Content">
            <TemplateContentFields
              values={values}
              onChange={update}
              onBlurField={markTouched}
              errors={{ name: shown('name'), title: shown('title'), body: shown('body'), imageUrl: shown('imageUrl') }}
              readOnly={locked}
              onImageBusyChange={setImageBusy}
            />
          </Card>
          <Card title="Channel">
            <SegmentedControl
              legend="Channel"
              hideLegend
              value={values.channel}
              options={CHANNEL_OPTIONS}
              onChange={(channel) => update({ channel })}
              disabled={locked}
              describedBy={channelHintId}
            />
            <p className="field-hint" id={channelHintId}>
              {CHANNEL_HINT[values.channel]}
            </p>
          </Card>
          <Card title="Link">
            <TemplateLinkFields
              value={values}
              onChange={(link) => update(link)}
              saved={savedLink}
              readOnly={!canManage}
              error={shown('link')}
            />
          </Card>
          <Card title="Audience">
            <TemplateAudienceFields
              value={values.audience}
              onChange={(audience) => update({ audience })}
              saved={savedAudience}
              readOnly={!canManage}
              error={shown('audience')}
              errorId={`${TEMPLATE_FIELD_ID.audience}-error`}
            />
          </Card>
        </div>
        <TemplatePreview
          title={values.title}
          body={values.body}
          imageUrl={values.imageUrl ?? null}
          channel={values.channel}
          linkLabel={linkLabel}
        />
      </div>
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Leave without saving?"
          message="Your changes to this notification will be lost."
          confirmLabel="Leave"
          cancelLabel="Stay"
          danger
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this template?"
          message="Its send history is kept, and mothers keep what they already received."
          confirmLabel="Delete template"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
```

(`readOnly={locked}` on the content fields also locks them during a save; the link and audience pickers take `!canManage`, because their read-only form is a different rendering, not a disabled one.)

`apps/admin/src/pages/notification-template-page.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { ErrorState, LoadingState } from '@admin/components/ui';
import { TemplateEditor } from '@admin/features/notifications/template-editor';
import { getNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** /notifications/:id — one template's editor. `new` is a blank editor whose first Save creates it. */
export function NotificationTemplatePage() {
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const templateId = Number(id);
  const template = useQuery({
    queryKey: ['notification-templates', templateId],
    queryFn: () => getNotificationTemplate(templateId),
    enabled: !isNew,
  });

  if (isNew) return <TemplateEditor key="new" />;
  if (template.isLoading) return <LoadingState label="Loading notification…" />;
  if (template.error != null || !template.data) {
    return (
      <ErrorState
        message={apiErrorMessage(template.error)}
        onRetry={() => void template.refetch()}
        retrying={template.isFetching}
      />
    );
  }
  return <TemplateEditor key={template.data.id} template={template.data} />;
}
```

`apps/admin/src/app.tsx` — `import { NotificationTemplatePage } from './pages/notification-template-page';` and, after the `notifications` route:

```tsx
          <Route
            path="notifications/:id"
            element={
              <Guarded section="notifications">
                <NotificationTemplatePage />
              </Guarded>
            }
          />
```

- [ ] **Step 17: Add the editor styles**

Append to `apps/admin/src/styles/global.css`:

```css
/* ── Notification template editor ───────────────────────── */
/* Form on the left, a sticky preview on the right; one column below 1024px. */
.template-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);
  gap: 1.5rem;
  align-items: start;
}

.template-editor-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.template-editor-form .card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 0;
}

.template-editor-form .card > h3 {
  margin-bottom: 0;
}

@media (max-width: 1024px) {
  .template-editor {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* Under the editor header: why Save or Publish is or isn't available yet. */
.template-editor-status {
  margin: -0.5rem 0 1rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
}

.template-editor-status--problem {
  color: var(--color-error-text);
}

/* Hint on the left, character count on the right. */
.field-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.char-counter {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.char-counter--warn {
  color: var(--color-warning-text);
  font-weight: 700;
}

textarea.input {
  min-height: 6rem;
  line-height: 1.5;
  resize: vertical;
}

.dropdown-trigger[aria-invalid='true'] {
  border-color: var(--color-error-text);
}

/* After a failed save: what to fix, each line a link to its field. */
.error-summary {
  margin: 0 0 1rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--color-error);
  border-left-width: 4px;
  border-radius: var(--radius-md);
  background: var(--color-error-light);
}

.error-summary:focus-visible {
  outline: 2px solid var(--color-primary-dark);
  outline-offset: 2px;
}

.error-summary h3 {
  margin: 0 0 0.5rem;
  color: var(--color-error-text);
  font-size: 0.95rem;
}

.error-summary ul {
  margin: 0;
  padding-left: 1.25rem;
}

.error-summary a {
  color: var(--color-error-text);
  font-weight: 600;
}

.error-summary a:focus-visible {
  outline: 2px solid var(--color-primary-dark);
  outline-offset: 2px;
  border-radius: 2px;
}

.notif-image-current {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.notif-image-thumb {
  width: 12rem;
  max-width: 100%;
  aspect-ratio: 2 / 1;
  object-fit: cover;
  border: 1px solid var(--color-warm-border);
  border-radius: var(--radius-sm);
}

.link-fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.link-summary,
.audience-saved-mothers {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.audience-saved {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.audience-saved li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.audience-groups {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

/* The error summary focuses these groups; the ring must show. */
.audience-groups:focus-visible,
.audience-mothers:focus-visible {
  outline: 2px solid var(--color-primary-dark);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}

.audience-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.audience-group-name {
  font-weight: 600;
}

/* Preview: a push banner and the inbox card as a mother sees them. */
.notif-preview {
  position: sticky;
  top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--color-warm-border);
  border-radius: var(--radius-lg);
  background: var(--color-warm-subtle);
}

.notif-preview-heading {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.notif-preview-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
}

.notif-preview-block figcaption {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.notif-push,
.notif-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.85rem 0.95rem;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.notif-push {
  box-shadow: var(--shadow-pop);
}

.notif-card {
  border: 1px solid var(--color-warm-border);
  box-shadow: var(--shadow-card);
}

.notif-push-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.notif-push-app {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: var(--radius-full);
  background: var(--color-primary-dark);
  color: var(--color-surface);
  font-size: 0.7rem;
  font-weight: 800;
}

.notif-push-time {
  margin-left: auto;
}

.notif-push-title,
.notif-card-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 0.9rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

/* A push banner shows two lines of the message; the inbox shows all of it. */
.notif-push-body {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.notif-card-body {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.notif-card-action {
  margin-top: 0.25rem;
  color: var(--color-primary-dark);
  font-size: 0.85rem;
  font-weight: 700;
}

/* The app's fixed 2:1 image box, with a neutral fill while the image loads. */
.notif-image-box {
  aspect-ratio: 2 / 1;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
}

.notif-image-box img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Sample text until the field is filled: muted and italic, still readable. */
.notif-placeholder {
  color: var(--color-text-muted);
  font-style: italic;
}

.notif-preview-note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

@media (max-width: 1024px) {
  .notif-preview {
    position: static;
  }
}
```

- [ ] **Step 18: Run the tests to verify they pass**

Run: `pnpm --filter @nanny-app/admin test -- template-editor contrast image-cropper campaign-form`
Expected: PASS (8 editor tests, the contrast suite with the counter case, cropper and campaign form unchanged).

- [ ] **Step 19: Run the whole admin suite, typecheck and lint**

Run: `pnpm --filter @nanny-app/admin test && pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint`
Expected: PASS.

- [ ] **Step 20: Commit**

```bash
git add apps/admin
git commit -m "$(cat <<'EOF'
feat(admin): notification template editor

Name, title and message with live character counts, a 2:1 image through
the shared cropper, channel, package/promo link and a groups audience,
with a push and inbox preview. On-blur field errors, a focused error
summary on a failed save, an unsaved-changes guard and a Saved toast.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---

### Task 11: Admin — audience, save-as-group, publish, history

> Note: the spec names `recipient-picker-modal` for "Specific mothers", but that modal is bound to surveys (it takes a `surveyId` and calls the survey publish/add endpoints). The template reuses its building block instead — `MotherPickerTable` from `features/groups/` — inside a `Modal` (`ChooseMothersModal` in `template-audience-fields.tsx`), with the same "Discard your selection?" guard. Nothing under `features/surveys/` is imported.
> Note: the toast has no action button or warning tone today. `ToastProvider` gains an optional `action` (a toast with one stays until it is used or dismissed, so the action can't time out from under a keyboard or screen-reader user) and a `warning` tone, for "Use this group instead" and the PARTIAL/FAILED result.
> Note: `POST /admin/groups/:id/members` takes at most 1,000 ids (`UserGroupMembersSchema`), while a template can hold 5,000 mothers, so Save-as-group adds them in chunks of 1,000; a retry after a failed chunk reuses the group it already created.
> Note: the confirm copy shows "(M by push)" only when the channel pushes; for an In-app-only template the push count says nothing about the send.

**Files:**
- Modify: `apps/admin/src/components/ui/toast.tsx`, `apps/admin/src/features/groups/mother-picker-table.tsx`, `apps/admin/src/features/notifications/template-editor.tsx`, `apps/admin/src/styles/global.css`
- Replace: `apps/admin/src/features/notifications/template-audience-fields.tsx`
- Create: `apps/admin/src/features/notifications/save-as-group-dialog.tsx`, `apps/admin/src/features/notifications/publish-dialog.tsx`, `apps/admin/src/features/notifications/broadcast-history.tsx`
- Test: `apps/admin/src/components/ui/__tests__/toast.test.tsx`, `apps/admin/src/features/notifications/__tests__/template-audience-fields.test.tsx`, `apps/admin/src/features/notifications/__tests__/publish-flow.test.tsx`

**Interfaces:**
- Consumes: Task 9 (`previewNotificationAudience`, `publishNotificationTemplate`, `listTemplateBroadcasts`, `createUserGroup`, `addUserGroupMembers`, `fetchUserGroups`, labels, `useDebouncedValue`, `SegmentedControl`, `group-labels.ts`), Task 10 (`TemplateEditor`, `TemplateAudienceFields` props, `SavedAudience`, `AudienceValue`, `SavedAudienceNames`, `TEMPLATE_FIELD_ID`, `fixtures.ts`).
- Produces:
  - `template-audience-fields.tsx`: `TemplateAudienceFields({ value, onChange, saved, readOnly, error, errorId })` — segmented **Groups** / **Specific mothers**; groups multi-select with a Static/Dynamic badge and member count; chosen mothers via `ChooseMothersModal`; live count under query key `['notification-audience-preview', audience]`, debounced 400 ms.
  - `save-as-group-dialog.tsx`: `SaveAsGroupDialog({ motherIds, onClose, onSaved(group: UserGroup) })` — creates a STATIC group and adds the members; rendered only when `useCanManage('groups')`.
  - `publish-dialog.tsx`: `PublishDialog({ template, onClose })` — re-fetches the count on open, confirm copy *"Send '<name>' to N mothers (M by push) now? This can't be undone."*, button "Send to N mothers", sending state; `broadcastResultToast(broadcast)`.
  - `broadcast-history.tsx`: `BroadcastHistory({ templateId })` under query key `['notification-templates', id, 'broadcasts']`.
  - `toast.tsx`: `ToastInput.action?: { label: string; onClick: () => void }`, tone `'warning'`, `useToast().warning(title, message?)`.
  - `mother-picker-table.tsx`: optional `onRowsLoaded?: (rows: MotherPickerRow[]) => void`.
  - `TemplateEditor`: "Publish…" button (disabled while there are unsaved changes), the publish dialog driven by `?publish=1`, and the send history under the form.

#### Cycle A — audience, live count and save-as-group

- [ ] **Step 1: Load the `nanny-app-admin-design` and `ui-ux-pro-max:ui-ux-pro-max` skills**

Apply ui-ux-pro-max §1 `contextual-live-badge-updates` (the count is one polite status phrase), `focus-states`, `keyboard-nav`; §8 `confirmation-dialogs` (publish is irreversible), `submit-feedback` (sending state), `toast-accessibility` (toasts never take focus; an action toast stays until used), `undo-support`-style recovery ("Use this group instead" can be undone by switching back to Specific mothers, which keeps the list), `sheet-dismiss-confirm` (the mothers picker asks before discarding ticks). Admin skill: `Modal`, `FormModal`, `Table`, `Badge`, `ErrorState`, `LoadingState`, tokens only.

- [ ] **Step 2: Write the failing toast and audience tests**

`apps/admin/src/components/ui/__tests__/toast.test.tsx`:

```tsx
/** Toasts: an action runs once and closes the toast; warnings carry their own tone. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from '@admin/components/ui';

function Trigger({ onUse }: { onUse: () => void }) {
  const toast = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          toast.toast({ tone: 'success', title: 'Group created', action: { label: 'Use this group instead', onClick: onUse } })
        }
      >
        with action
      </button>
      <button type="button" onClick={() => toast.warning('Partly sent', '12 pushes failed')}>
        warning
      </button>
    </>
  );
}

describe('ToastProvider', () => {
  it('runs a toast action once and closes that toast', async () => {
    const onUse = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUse={onUse} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'with action' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this group instead' }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Group created')).not.toBeInTheDocument();
  });

  it('shows a warning in the warning tone', async () => {
    render(
      <ToastProvider>
        <Trigger onUse={vi.fn()} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'warning' }));
    expect(screen.getByText('Partly sent').closest('.toast')).toHaveClass('toast--warning');
    expect(screen.getByText('12 pushes failed')).toBeInTheDocument();
  });
});
```

`apps/admin/src/features/notifications/__tests__/template-audience-fields.test.tsx`:

```tsx
/**
 * Who gets a notification: groups (each marked Static or Dynamic, with its
 * size) or hand-picked mothers, with a live count of the reach. Picked mothers
 * can be saved as a static group, and the toast offers to send to that group
 * instead.
 */
import type { AdminUser, MotherPickerRow, UserGroup } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import {
  TemplateAudienceFields,
  type AudienceValue,
  type SavedAudienceNames,
} from '@admin/features/notifications/template-audience-fields';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

import { ADMIN, BETA, LAPSED, NOTIFIER, editorHandlers, ok } from './fixtures';

const mother = (id: number, name: string): MotherPickerRow => ({
  id, name, phone: null, completedBookings: 1, hoursBooked: 4, totalSpent: 400,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null, lastAppOpenAt: null,
});
const AMY = mother(11, 'Amy');
const BEA = mother(12, 'Bea');
const OCTOBER: UserGroup = {
  id: 30, name: 'October picks', description: null, kind: 'STATIC', rules: null,
  memberCount: 2, createdAt: '2026-10-20T10:00:00.000Z',
};

beforeEach(() => {
  server.use(http.get('/api/admin/me', () => ok(ADMIN)), ...editorHandlers);
});

function Harness({ initial, saved }: { initial: AudienceValue; saved: SavedAudienceNames }) {
  const [value, setValue] = useState<AudienceValue>(initial);
  return (
    <>
      <TemplateAudienceFields
        value={value}
        onChange={setValue}
        saved={saved}
        readOnly={false}
        errorId="audience-error"
      />
      <output aria-label="audience">{JSON.stringify(value)}</output>
    </>
  );
}

function renderFields(initial: AudienceValue, saved: SavedAudienceNames = { groups: [], mothers: [] }) {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <Harness initial={initial} saved={saved} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

describe('TemplateAudienceFields', () => {
  it('marks each group Static or Dynamic with its size, and counts the audience live', async () => {
    let body: unknown;
    server.use(
      http.post('/api/admin/notification-templates/audience-preview', async ({ request }) => {
        body = await request.json();
        return ok({ mothers: 1240, withPushDevice: 1031 });
      }),
    );
    renderFields({ type: 'GROUPS', groupIds: [] });

    expect(await screen.findByText(/choose who gets this notification/i)).toBeInTheDocument();
    const lapsed = await screen.findByRole('checkbox', { name: /lapsed 30d/i });
    const lapsedRow = lapsed.closest('label')!;
    expect(within(lapsedRow).getByText('Dynamic')).toBeInTheDocument();
    expect(within(lapsedRow).getByText('1,240 mothers now')).toBeInTheDocument();
    const betaRow = screen.getByRole('checkbox', { name: /beta testers/i }).closest('label')!;
    expect(within(betaRow).getByText('Static')).toBeInTheDocument();

    await userEvent.click(lapsed);
    expect(await screen.findByText('1,240 mothers · 1,031 with push enabled')).toBeInTheDocument();
    expect(body).toEqual({ audience: { type: 'GROUPS', groupIds: [2] } });
  });

  it('saves the chosen mothers as a static group, and "Use this group instead" switches to it', async () => {
    let created = false;
    let groupBody: unknown;
    let membersBody: unknown;
    server.use(
      http.get('/api/admin/groups', () => ok(created ? [LAPSED, BETA, OCTOBER] : [LAPSED, BETA])),
      http.get('/api/admin/mother-picker', () =>
        HttpResponse.json({ data: [AMY, BEA], error: null, meta: { page: 1, limit: 20, total: 2, totalPages: 1 } }),
      ),
      http.post('/api/admin/groups', async ({ request }) => {
        groupBody = await request.json();
        created = true;
        return ok({ ...OCTOBER, memberCount: 0 });
      }),
      http.post('/api/admin/groups/30/members', async ({ request }) => {
        membersBody = await request.json();
        return ok(OCTOBER);
      }),
    );
    renderFields({ type: 'MOTHERS', motherIds: [] });

    await userEvent.click(await screen.findByRole('button', { name: 'Choose mothers…' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose mothers' });
    await userEvent.click(await within(picker).findByRole('checkbox', { name: 'Select Amy' }));
    await userEvent.click(within(picker).getByRole('checkbox', { name: 'Select Bea' }));
    await userEvent.click(within(picker).getByRole('button', { name: 'Use 2 mothers' }));
    expect(screen.getByText(/Amy, Bea/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save these 2 mothers as a static group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save as a static group' });
    await userEvent.type(within(dialog).getByLabelText('Group name'), 'October picks');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(membersBody).toEqual({ userIds: [11, 12] }));
    expect(groupBody).toEqual({ name: 'October picks', description: '', kind: 'STATIC' });

    await userEvent.click(await screen.findByRole('button', { name: 'Use this group instead' }));
    expect(screen.getByRole('status', { name: 'audience' })).toHaveTextContent('{"type":"GROUPS","groupIds":[30]}');
    expect(screen.getByRole('radio', { name: 'Groups' })).toBeChecked();
    expect(await screen.findByRole('checkbox', { name: /october picks/i })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Use this group instead' })).not.toBeInTheDocument();
  });

  it('hides "Save as a static group" from an admin who cannot manage groups', async () => {
    server.use(http.get('/api/admin/me', () => ok<AdminUser>(NOTIFIER)));
    renderFields({ type: 'MOTHERS', motherIds: [11] }, { groups: [], mothers: [{ id: 11, name: 'Amy' }] });

    expect(await screen.findByText(/Amy/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change selection…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /as a static group/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/admin test -- toast template-audience-fields`
Expected: FAIL — `toast.warning is not a function` and no "Use this group instead" button; the audience tests find no "Dynamic" badge, no live count and no "Choose mothers…" button (Task 10's groups-only slot).

- [ ] **Step 4: Give toasts an action and a warning tone**

Replace `apps/admin/src/components/ui/toast.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { CircleAlert, CircleCheck, ICON_SIZE, Info, TriangleAlert, X } from './icon';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

/** One follow-up the toast offers, e.g. "Use this group instead". */
type ToastAction = { label: string; onClick: () => void };

type ToastData = {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  action?: ToastAction;
};

type ToastInput = {
  tone?: ToastTone;
  title: string;
  message?: string;
  /**
   * Auto-dismiss delay in ms (0 to disable). Default 4500 — or 0 when the toast
   * has an action, so the action never times out from under a keyboard or
   * screen-reader user.
   */
  duration?: number;
  action?: ToastAction;
};

type ToastApi = {
  toast: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  /** It happened, but not completely — stays a little longer than a success. */
  warning: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
  warning: TriangleAlert,
} as const;

const WARNING_DURATION = 8000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    ({ tone = 'info', title, message, duration, action }: ToastInput) => {
      const id = (idRef.current += 1);
      setToasts((prev) => [...prev, { id, tone, title, message, action }]);
      const ms = duration ?? (action ? 0 : 4500);
      if (ms > 0) {
        window.setTimeout(() => remove(id), ms);
      }
    },
    [remove],
  );

  const api = useRef<ToastApi>({
    toast,
    success: (title, message) => toast({ tone: 'success', title, message }),
    error: (title, message) => toast({ tone: 'error', title, message }),
    warning: (title, message) => toast({ tone: 'warning', title, message, duration: WARNING_DURATION }),
  });
  // Keep the stable api object pointing at the latest toast closure.
  api.current.toast = toast;
  api.current.success = (title, message) => toast({ tone: 'success', title, message });
  api.current.error = (title, message) => toast({ tone: 'error', title, message });
  api.current.warning = (title, message) =>
    toast({ tone: 'warning', title, message, duration: WARNING_DURATION });

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      {createPortal(
        <div className="toast-viewport">
          {toasts.map((item) => {
            const Icon = TONE_ICON[item.tone];
            return (
              <div className={`toast toast--${item.tone}`} key={item.id} role="status">
                <span className="toast-icon">
                  <Icon size={ICON_SIZE.inline} />
                </span>
                <div className="toast-body">
                  <p className="toast-title">{item.title}</p>
                  {item.message && <p className="toast-message">{item.message}</p>}
                  {item.action && (
                    <button
                      type="button"
                      className="toast-action"
                      onClick={() => {
                        item.action?.onClick();
                        remove(item.id);
                      }}
                    >
                      {item.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="toast-close"
                  aria-label="Dismiss"
                  onClick={() => remove(item.id)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
```

- [ ] **Step 5: Let the mother picker report the rows it loads**

In `apps/admin/src/features/groups/mother-picker-table.tsx` add to `MotherPickerTableProps`:

```ts
  /** Each page of rows as it loads — lets a caller name the mothers it has ticked. */
  onRowsLoaded?: (rows: MotherPickerRow[]) => void;
```

take `onRowsLoaded` in the destructured props, and after the `useQuery` call add:

```ts
  useEffect(() => {
    if (data) onRowsLoaded?.(data.data);
  }, [data, onRowsLoaded]);
```

(`useEffect` is already imported there.)

- [ ] **Step 6: Create the save-as-group dialog**

`apps/admin/src/features/notifications/save-as-group-dialog.tsx`:

```tsx
import type { UserGroup } from '@nanny-app/shared';
import { USER_GROUP_DESCRIPTION_MAX, USER_GROUP_NAME_MAX } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { Field, FormModal, Input } from '@admin/components/ui';
import { addUserGroupMembers, createUserGroup } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { mothersLabel } from './notification-labels';

/** POST /groups/:id/members takes at most this many ids at once (UserGroupMembersSchema). */
const MEMBERS_PER_CALL = 1000;

type SaveAsGroupDialogProps = {
  motherIds: number[];
  onClose: () => void;
  /** The group exists and holds every mother. */
  onSaved: (group: UserGroup) => void;
};

/**
 * Turn a hand-picked list into a static group, so it can be reused for
 * surveys and later notifications. Only rendered for admins who can manage
 * groups (POST /groups requires it).
 */
export function SaveAsGroupDialog({ motherIds, onClose, onSaved }: SaveAsGroupDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // A group created by an attempt whose member adds then failed: a retry fills it
  // rather than creating a second, half-empty group.
  const created = useRef<UserGroup | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const group =
        created.current ??
        (await createUserGroup({ name: name.trim(), description: description.trim(), kind: 'STATIC' }));
      created.current = group;
      let latest = group;
      for (let i = 0; i < motherIds.length; i += MEMBERS_PER_CALL) {
        latest = await addUserGroupMembers(group.id, motherIds.slice(i, i + MEMBERS_PER_CALL));
      }
      return latest;
    },
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      onSaved(group);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  const error = save.isError
    ? created.current
      ? `“${created.current.name}” was created, but adding the mothers didn’t finish: ${apiErrorMessage(save.error)} Try again to finish.`
      : apiErrorMessage(save.error)
    : null;

  return (
    <FormModal
      title="Save as a static group"
      submitLabel={created.current ? 'Add the mothers' : 'Create group'}
      onSubmit={() => save.mutate()}
      onClose={onClose}
      busy={save.isPending}
      submitDisabled={name.trim().length === 0}
      error={error}
      size="sm"
    >
      <p className="modal-text">
        A hand-picked group of these {mothersLabel(motherIds.length)}. You can send surveys and notifications to it
        later.
      </p>
      <Field label="Group name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={USER_GROUP_NAME_MAX}
          disabled={created.current !== null}
          autoFocus
        />
      </Field>
      <Field label="Description" hint="Optional. Who is in this group and why.">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={USER_GROUP_DESCRIPTION_MAX}
          disabled={created.current !== null}
        />
      </Field>
    </FormModal>
  );
}
```

- [ ] **Step 7: Replace the audience slot with the full picker**

Replace `apps/admin/src/features/notifications/template-audience-fields.tsx`:

```tsx
import type {
  MotherPickerRow,
  NotificationTemplate,
  NotificationTemplateInput,
  UserGroup,
} from '@nanny-app/shared';
import { NOTIFICATION_AUDIENCE_MAX_GROUPS, NOTIFICATION_AUDIENCE_MAX_MOTHERS } from '@nanny-app/shared';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useId, useState } from 'react';

import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  Modal,
  SegmentedControl,
  Skeleton,
  useToast,
  type SegmentedOption,
} from '@admin/components/ui';
import { GROUP_KIND_LABEL, GROUP_KIND_TONE } from '@admin/features/groups/group-labels';
import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import { fetchUserGroups, previewNotificationAudience } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useDebouncedValue } from '@admin/lib/use-debounced-value';

import { formatCount, mothersLabel } from './notification-labels';
import { SaveAsGroupDialog } from './save-as-group-dialog';
import { TEMPLATE_FIELD_ID } from './template-issues';

export type AudienceValue = NotificationTemplateInput['audience'];
export type SavedAudienceNames = {
  groups: NotificationTemplate['audienceGroups'];
  mothers: NotificationTemplate['audienceMothers'];
};

export type TemplateAudienceFieldsProps = {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
  /** Names the saved template resolved — for read-only display and the chosen-mothers list. */
  saved: SavedAudienceNames;
  readOnly: boolean;
  error?: string;
  errorId: string;
};

type Mode = AudienceValue['type'];

const MODE_OPTIONS: readonly SegmentedOption<Mode>[] = [
  { value: 'GROUPS', label: 'Groups' },
  { value: 'MOTHERS', label: 'Specific mothers' },
];

/** How many chosen mothers are named before "and N more". */
const NAMES_SHOWN = 8;

/**
 * Who gets the notification: one or more groups (static and dynamic, unioned)
 * or hand-picked mothers. A live count says how many it reaches and how many
 * of them have push turned on; hand-picked mothers can be saved as a group.
 */
export function TemplateAudienceFields({ value, onChange, saved, readOnly, error, errorId }: TemplateAudienceFieldsProps) {
  const toast = useToast();
  const canManageGroups = useCanManage('groups');
  const groupsHintId = useId();
  // What the other mode held, so flipping Groups ⇄ Specific mothers loses nothing.
  const [stash, setStash] = useState<{ groupIds: number[]; motherIds: number[] }>({ groupIds: [], motherIds: [] });
  // Names of the mothers seen so far (the saved template, then picker pages).
  const [names, setNames] = useState<ReadonlyMap<number, string>>(
    () => new Map(saved.mothers.map((m) => [m.id, m.name])),
  );
  const [choosing, setChoosing] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);

  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchUserGroups, enabled: !readOnly });

  // Ask for the count once the admin pauses, not on every tick.
  const debounced = useDebouncedValue(value, 400);
  const debouncedIds = debounced.type === 'GROUPS' ? debounced.groupIds : debounced.motherIds;
  const preview = useQuery({
    queryKey: ['notification-audience-preview', debounced],
    queryFn: () => previewNotificationAudience(debounced),
    enabled: !readOnly && debouncedIds.length > 0,
    placeholderData: keepPreviousData,
  });

  const rememberNames = useCallback(
    (rows: MotherPickerRow[]) =>
      setNames((prev) => {
        if (rows.every((r) => prev.get(r.id) === r.name)) return prev;
        const next = new Map(prev);
        for (const r of rows) next.set(r.id, r.name);
        return next;
      }),
    [],
  );

  if (readOnly) return <SavedAudience value={value} saved={saved} />;

  const ids = value.type === 'GROUPS' ? value.groupIds : value.motherIds;

  const switchMode = (mode: Mode) => {
    if (mode === value.type) return;
    if (value.type === 'GROUPS') {
      setStash((s) => ({ ...s, groupIds: value.groupIds }));
      onChange({ type: 'MOTHERS', motherIds: stash.motherIds });
    } else {
      setStash((s) => ({ ...s, motherIds: value.motherIds }));
      onChange({ type: 'GROUPS', groupIds: stash.groupIds });
    }
  };

  const switchToGroup = (group: UserGroup, motherIds: number[]) => {
    // The hand-picked list stays one click away under "Specific mothers".
    setStash((s) => ({ ...s, motherIds }));
    onChange({ type: 'GROUPS', groupIds: [group.id] });
  };

  const onGroupSaved = (group: UserGroup, motherIds: number[]) => {
    setSavingGroup(false);
    toast.toast({
      tone: 'success',
      title: 'Group created',
      message: `“${group.name}” has ${mothersLabel(motherIds.length)}.`,
      action: { label: 'Use this group instead', onClick: () => switchToGroup(group, motherIds) },
    });
  };

  const settled = debounced === value && !preview.isPlaceholderData;
  const countText =
    ids.length === 0
      ? 'Choose who gets this notification to see how many mothers it reaches.'
      : preview.isError
        ? 'We couldn’t count this audience.'
        : !preview.data || !settled
          ? 'Counting mothers…'
          : `${mothersLabel(preview.data.mothers)} · ${formatCount(preview.data.withPushDevice)} with push enabled`;

  return (
    <div className="audience-fields">
      <SegmentedControl legend="Send to" value={value.type} options={MODE_OPTIONS} onChange={switchMode} />

      {value.type === 'GROUPS' ? (
        <GroupChoices
          groups={groups}
          groupIds={value.groupIds}
          saved={saved}
          onChange={(groupIds) => onChange({ type: 'GROUPS', groupIds })}
          hintId={groupsHintId}
          errorId={error ? errorId : undefined}
        />
      ) : (
        <div
          className="audience-mothers"
          id={TEMPLATE_FIELD_ID.audience}
          tabIndex={-1}
          aria-describedby={error ? errorId : undefined}
        >
          {value.motherIds.length === 0 ? (
            <p className="field-hint">No mothers chosen yet.</p>
          ) : (
            <p className="audience-mothers-list">
              <strong>{mothersLabel(value.motherIds.length)}:</strong>{' '}
              {value.motherIds
                .slice(0, NAMES_SHOWN)
                .map((id) => names.get(id) ?? `Mother #${id}`)
                .join(', ')}
              {value.motherIds.length > NAMES_SHOWN
                ? `, and ${formatCount(value.motherIds.length - NAMES_SHOWN)} more`
                : ''}
            </p>
          )}
          <div className="audience-mothers-actions">
            <Button variant="ghost" onClick={() => setChoosing(true)}>
              {value.motherIds.length === 0 ? 'Choose mothers…' : 'Change selection…'}
            </Button>
            {canManageGroups && value.motherIds.length > 0 && (
              <Button variant="ghost" onClick={() => setSavingGroup(true)}>
                Save these {mothersLabel(value.motherIds.length)} as a static group
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}

      <div className="audience-count">
        <p role="status">{countText}</p>
        {preview.isError && (
          <Button variant="ghost" size="sm" onClick={() => void preview.refetch()}>
            Try again
          </Button>
        )}
      </div>

      {choosing && (
        <ChooseMothersModal
          initial={value.type === 'MOTHERS' ? value.motherIds : []}
          onRowsLoaded={rememberNames}
          onCancel={() => setChoosing(false)}
          onConfirm={(motherIds) => {
            setChoosing(false);
            onChange({ type: 'MOTHERS', motherIds });
          }}
        />
      )}
      {savingGroup && value.type === 'MOTHERS' && (
        <SaveAsGroupDialog
          motherIds={value.motherIds}
          onClose={() => setSavingGroup(false)}
          onSaved={(group) => onGroupSaved(group, value.motherIds)}
        />
      )}
    </div>
  );
}

type GroupChoicesProps = {
  groups: UseQueryResult<UserGroup[]>;
  groupIds: number[];
  saved: SavedAudienceNames;
  onChange: (groupIds: number[]) => void;
  hintId: string;
  errorId: string | undefined;
};

/** Every group as a checkbox: name, Static/Dynamic, and how many mothers it holds now. */
function GroupChoices({ groups, groupIds, saved, onChange, hintId, errorId }: GroupChoicesProps) {
  const atMax = groupIds.length >= NOTIFICATION_AUDIENCE_MAX_GROUPS;
  const toggle = (id: number) =>
    onChange(groupIds.includes(id) ? groupIds.filter((g) => g !== id) : [...groupIds, id]);
  const listed = new Set((groups.data ?? []).map((g) => g.id));
  // Chosen groups deleted since the template was saved: shown so they can be unticked.
  const missing = groups.data ? groupIds.filter((id) => !listed.has(id)) : [];
  const savedName = (id: number) => saved.groups.find((g) => g.id === id)?.name;

  return (
    <fieldset
      className="audience-groups"
      id={TEMPLATE_FIELD_ID.audience}
      tabIndex={-1}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ')}
    >
      <legend className="sr-only">Groups</legend>
      {groups.isPending && (
        <>
          <span className="sr-only">Loading groups…</span>
          <Skeleton width="14rem" height="1.25rem" />
          <Skeleton width="11rem" height="1.25rem" />
        </>
      )}
      {groups.isError && (
        <ErrorState
          title="We couldn’t load the groups"
          message={apiErrorMessage(groups.error)}
          onRetry={() => void groups.refetch()}
          retrying={groups.isFetching}
        />
      )}
      {(groups.data ?? []).map((g) => {
        const checked = groupIds.includes(g.id);
        return (
          <label key={g.id} className="audience-group">
            <input type="checkbox" checked={checked} disabled={!checked && atMax} onChange={() => toggle(g.id)} />
            <span className="audience-group-name">{g.name}</span>
            <Badge tone={GROUP_KIND_TONE[g.kind]}>{GROUP_KIND_LABEL[g.kind]}</Badge>
            <span className="audience-group-count">
              {mothersLabel(g.memberCount)}
              {g.kind === 'DYNAMIC' ? ' now' : ''}
            </span>
          </label>
        );
      })}
      {missing.map((id) => (
        <label key={id} className="audience-group audience-group--missing">
          <input type="checkbox" checked onChange={() => toggle(id)} />
          <span className="audience-group-name">{savedName(id) ?? `Group #${id}`}</span>
          <span className="audience-group-count">Deleted. Untick it before saving.</span>
        </label>
      ))}
      {groups.data?.length === 0 && <p className="field-hint">No groups yet. Create one on the Groups page.</p>}
      <p className="field-hint" id={hintId}>
        A mother in several chosen groups gets it once. Dynamic groups are worked out when you publish. Up to{' '}
        {NOTIFICATION_AUDIENCE_MAX_GROUPS} groups.
      </p>
    </fieldset>
  );
}

type ChooseMothersModalProps = {
  initial: number[];
  onRowsLoaded: (rows: MotherPickerRow[]) => void;
  onCancel: () => void;
  onConfirm: (motherIds: number[]) => void;
};

/** The mother picker in a dialog; ticks survive paging and searching. */
function ChooseMothersModal({ initial, onRowsLoaded, onCancel, onConfirm }: ChooseMothersModalProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initial));
  const [discarding, setDiscarding] = useState(false);
  const changed = selected.size !== initial.length || initial.some((id) => !selected.has(id));
  const over = selected.size > NOTIFICATION_AUDIENCE_MAX_MOTHERS;
  // Ticks across pages are real work: ask before Escape or Cancel drops them.
  const requestClose = () => (changed ? setDiscarding(true) : onCancel());

  return (
    <Modal
      title="Choose mothers"
      size="lg"
      onClose={requestClose}
      dismissible={!changed}
      footer={
        <>
          <span className="recipient-summary" aria-live="polite">
            {over
              ? `${formatCount(selected.size)} ticked. Choose at most ${formatCount(NOTIFICATION_AUDIENCE_MAX_MOTHERS)}.`
              : `${mothersLabel(selected.size)} chosen.`}
          </span>
          <Button variant="ghost" onClick={requestClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm([...selected].sort((a, b) => a - b))} disabled={over || !changed}>
            {selected.size === 0 ? 'Clear the selection' : `Use ${mothersLabel(selected.size)}`}
          </Button>
        </>
      }
    >
      <MotherPickerTable selected={selected} onSelectedChange={setSelected} onRowsLoaded={onRowsLoaded} />
      {discarding && (
        <ConfirmDialog
          title="Discard your selection?"
          message="The mothers you ticked or unticked here won’t be used."
          confirmLabel="Discard"
          cancelLabel="Keep picking"
          danger
          onConfirm={onCancel}
          onCancel={() => setDiscarding(false)}
        />
      )}
    </Modal>
  );
}

/** The saved audience by name, for an admin who can't change it. */
export function SavedAudience({ value, saved }: { value: AudienceValue; saved: SavedAudienceNames }) {
  if (value.type === 'GROUPS') {
    const byId = new Map(saved.groups.map((g) => [g.id, g]));
    return (
      <ul className="audience-saved">
        {value.groupIds.map((id) => {
          const group = byId.get(id);
          return (
            <li key={id}>
              <span>{group?.name ?? `Group #${id} (deleted)`}</span>
              {group && <Badge tone={GROUP_KIND_TONE[group.kind]}>{GROUP_KIND_LABEL[group.kind]}</Badge>}
            </li>
          );
        })}
      </ul>
    );
  }
  const names = new Map(saved.mothers.map((m) => [m.id, m.name]));
  const shown = value.motherIds.slice(0, NAMES_SHOWN).map((id) => names.get(id) ?? `Mother #${id}`);
  const more = value.motherIds.length - shown.length;
  return (
    <p className="audience-saved-mothers">
      {mothersLabel(value.motherIds.length)}: {shown.join(', ')}
      {more > 0 ? `, and ${formatCount(more)} more` : ''}
    </p>
  );
}
```

- [ ] **Step 8: Add the audience and toast styles**

Append to `apps/admin/src/styles/global.css`:

```css
/* Toast: warning tone and an optional follow-up action. */
.toast--warning {
  border-left-color: var(--color-warning);
}

.toast--warning .toast-icon {
  color: var(--color-warning-text);
}

.toast-action {
  margin-top: 0.5rem;
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--color-warm-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-primary-dark);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.toast-action:hover {
  background: var(--color-warm-subtle);
}

.toast-action:focus-visible,
.toast-close:focus-visible {
  outline: 2px solid var(--color-primary-dark);
  outline-offset: 2px;
}

/* Notification audience: mode, the choice, then the live count. */
.audience-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.audience-group-count {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.audience-group--missing .audience-group-count {
  color: var(--color-error-text);
  font-weight: 600;
}

.audience-mothers {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.audience-mothers-list {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.audience-mothers-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.audience-count {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  background: var(--color-primary-muted);
}

.audience-count p {
  margin: 0;
  color: var(--color-primary-dark);
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Publish confirmation: what is happening while the request runs. */
.publish-sending {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}
```

- [ ] **Step 9: Run them to verify they pass**

Run: `pnpm --filter @nanny-app/admin test -- toast template-audience-fields template-editor mother-picker-table`
Expected: PASS (2 + 3 tests; the Task 10 editor tests still pass with the full picker — their group checkbox query is `/lapsed 30d/i`; the mother picker suite is unchanged).

- [ ] **Step 10: Typecheck, lint, commit**

Run: `pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint`
Expected: PASS.

```bash
git add apps/admin
git commit -m "$(cat <<'EOF'
feat(admin): notification audience with live count and save-as-group

Groups (Static/Dynamic with sizes) or hand-picked mothers, with a
debounced count of mothers and push-enabled devices. Picked mothers can
be saved as a static group; the toast offers to send to it instead.
Toasts gain an action and a warning tone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

#### Cycle B — publish and send history

- [ ] **Step 11: Write the failing publish-flow test**

`apps/admin/src/features/notifications/__tests__/publish-flow.test.tsx`:

```tsx
/**
 * Publishing a saved template from its page: the confirmation re-counts the
 * audience, names it, and can't be sent twice while it runs; the result toast
 * says what went out and warns when part of it didn't. The send history lists
 * every publish. View-only operators see the history, never Publish.
 */
import type { AdminUser } from '@nanny-app/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { NotificationTemplatePage } from '@admin/pages/notification-template-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

import { ADMIN, BROADCAST, TEMPLATE, VIEWER, editorHandlers, ok } from './fixtures';

const PUBLISH = '/api/admin/notification-templates/4/publish';
const CONFIRM_COPY = "Send 'Win-back 30d' to 1,240 mothers (1,031 by push) now? This can't be undone.";

beforeEach(() => {
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    ...editorHandlers,
    http.get('/api/admin/notification-templates/4', () => ok(TEMPLATE)),
  );
});

function renderPage(url = '/notifications/4', me?: AdminUser) {
  if (me) server.use(http.get('/api/admin/me', () => ok(me)));
  const router = createMemoryRouter(
    [
      { path: '/notifications/:id', element: <NotificationTemplatePage /> },
      { path: '/notifications', element: <p>Notification list</p> },
    ],
    { initialEntries: [url] },
  );
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <RouterProvider router={router} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

const openPublish = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Publish…' }));
  return screen.findByRole('dialog', { name: 'Send this notification?' });
};

describe('Publishing a notification template', () => {
  it('confirms with a freshly counted audience, sends once, and reports the counts', async () => {
    let previews = 0;
    let published = 0;
    server.use(
      http.post('/api/admin/notification-templates/audience-preview', () => {
        previews += 1;
        // The group grew between the editor's count and the confirmation.
        return ok(previews === 1 ? { mothers: 1200, withPushDevice: 1000 } : { mothers: 1240, withPushDevice: 1031 });
      }),
      http.post(PUBLISH, () => {
        published += 1;
        return ok(BROADCAST);
      }),
    );
    renderPage();

    expect(await screen.findByText('1,200 mothers · 1,000 with push enabled')).toBeInTheDocument();
    const dialog = await openPublish();
    expect(await within(dialog).findByText(CONFIRM_COPY)).toBeInTheDocument();
    expect(previews).toBe(2);
    expect(published).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send to 1,240 mothers' }));
    expect(await screen.findByText('Sent to 1,240 mothers')).toBeInTheDocument();
    expect(screen.getByText('1,240 in the inbox · 1,031 pushes sent · 209 with no device')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(published).toBe(1);
  });

  it('shows a sending state and locks the dialog while the send runs', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(PUBLISH, async () => {
        await gate;
        return ok(BROADCAST);
      }),
    );
    renderPage();

    const dialog = await openPublish();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send to 1,240 mothers' }));
    expect(within(dialog).getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    release();
    expect(await screen.findByText('Sent to 1,240 mothers')).toBeInTheDocument();
  });

  it('warns when some pushes failed, and notes a deleted group that was skipped', async () => {
    server.use(
      http.post(PUBLISH, () =>
        ok({ ...BROADCAST, status: 'PARTIAL', pushSent: 1019, pushFailed: 12, skippedGroupIds: [9] }),
      ),
    );
    renderPage();

    const dialog = await openPublish();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send to 1,240 mothers' }));
    const title = await screen.findByText('Sent to 1,240 mothers, but 12 pushes failed');
    expect(title.closest('.toast')).toHaveClass('toast--warning');
    expect(screen.getByText(/1 deleted group was skipped/)).toBeInTheDocument();
  });

  it("reports a refused publish with the server's reason", async () => {
    server.use(
      http.post(PUBLISH, () => HttpResponse.json({ data: null, error: 'That promo code has expired.' }, { status: 400 })),
    );
    renderPage();

    const dialog = await openPublish();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send to 1,240 mothers' }));
    expect(await screen.findByText('Couldn’t send the notification')).toBeInTheDocument();
    expect(screen.getByText('That promo code has expired.')).toBeInTheDocument();
  });

  it('keeps Publish off while there are unsaved changes', async () => {
    renderPage();
    const publish = await screen.findByRole('button', { name: 'Publish…' });
    expect(publish).toBeEnabled();
    await userEvent.type(screen.getByLabelText('Title'), '!');
    expect(publish).toBeDisabled();
    expect(screen.getByText('Unsaved changes. Save before publishing.')).toBeInTheDocument();
  });

  it("opens the confirmation from the list's Publish (?publish=1), and Cancel closes it", async () => {
    renderPage('/notifications/4?publish=1');
    const dialog = await screen.findByRole('dialog', { name: 'Send this notification?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every send with its status and counts', async () => {
    server.use(
      http.get('/api/admin/notification-templates/4/broadcasts', () =>
        ok([
          BROADCAST,
          {
            ...BROADCAST, id: 32, status: 'FAILED', error: 'Timed out', inAppCreated: 400, pushSent: 0,
            noDevice: 0, createdAt: '2026-10-19T09:00:00.000Z', completedAt: null,
          },
        ]),
      ),
    );
    renderPage();

    const history = await screen.findByRole('table');
    const sent = within(history).getByText('Sent').closest('tr')!;
    expect(within(sent).getByText('Ops Admin')).toBeInTheDocument();
    expect(within(sent).getByText('1,031')).toBeInTheDocument();
    expect(within(sent).getByText('209')).toBeInTheDocument();
    const failed = within(history).getByText('Timed out').closest('tr')!;
    expect(within(failed).getByText('Failed')).toBeInTheDocument();
  });

  it('shows a view-only operator the history but never Publish, even from ?publish=1', async () => {
    renderPage('/notifications/4?publish=1', VIEWER);
    expect(await screen.findByRole('heading', { name: 'Send history' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/admin test -- publish-flow`
Expected: FAIL — no "Publish…" button, no send history.

- [ ] **Step 13: Create the publish dialog**

`apps/admin/src/features/notifications/publish-dialog.tsx`:

```tsx
import type { NotificationBroadcast, NotificationTemplate } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, ErrorState, LoadingState, Modal, Spinner, useToast } from '@admin/components/ui';
import { previewNotificationAudience, publishNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { formatCount, mothersLabel } from './notification-labels';

type ResultToast = { tone: 'success' | 'warning'; title: string; message: string };

/** A finished broadcast → the toast that reports it. PARTIAL and FAILED are warnings. */
export function broadcastResultToast(b: NotificationBroadcast): ResultToast {
  const pushes = (n: number) => `${formatCount(n)} ${n === 1 ? 'push' : 'pushes'}`;
  const parts: string[] = [];
  if (b.channel !== 'PUSH') parts.push(`${formatCount(b.inAppCreated)} in the inbox`);
  if (b.channel !== 'IN_APP') {
    parts.push(`${pushes(b.pushSent)} sent`);
    if (b.noDevice > 0) parts.push(`${formatCount(b.noDevice)} with no device`);
  }
  const skipped = b.skippedGroupIds.length;
  if (skipped > 0) parts.push(`${skipped} deleted ${skipped === 1 ? 'group was' : 'groups were'} skipped`);
  const to = mothersLabel(b.targeted);

  if (b.status === 'FAILED') {
    return {
      tone: 'warning',
      title: `Sending stopped part-way to ${to}`,
      message: [b.error ?? 'The server stopped before it finished.', ...parts].join(' · '),
    };
  }
  if (b.status === 'PARTIAL') {
    return { tone: 'warning', title: `Sent to ${to}, but ${pushes(b.pushFailed)} failed`, message: parts.join(' · ') };
  }
  if (b.status === 'SENDING') {
    return {
      tone: 'success',
      title: `Sending to ${to}`,
      message: 'It is still going out; the send history updates when it finishes.',
    };
  }
  return { tone: 'success', title: `Sent to ${to}`, message: parts.join(' · ') };
}

type PublishDialogProps = {
  template: NotificationTemplate;
  onClose: () => void;
};

/**
 * "Send to N mothers now?" — publishing can't be undone, so the dialog counts
 * the audience again on open (a dynamic group may have grown since the editor
 * last asked) and only a count fetched after it opened can be confirmed. While
 * the send runs the dialog can't be closed or sent again.
 */
export function PublishDialog({ template, onClose }: PublishDialogProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [openedAt] = useState(() => Date.now());
  const preview = useQuery({
    queryKey: ['notification-audience-preview', template.audience],
    queryFn: () => previewNotificationAudience(template.audience),
    refetchOnMount: 'always',
  });
  const fresh =
    preview.data && !preview.isFetching && preview.dataUpdatedAt >= openedAt ? preview.data : null;

  const publish = useMutation({
    mutationFn: () => publishNotificationTemplate(template.id),
    onSuccess: (broadcast) => {
      const result = broadcastResultToast(broadcast);
      toast.toast({ ...result, duration: result.tone === 'warning' ? 10_000 : undefined });
      onClose();
    },
    onError: (err) => {
      toast.error('Couldn’t send the notification', apiErrorMessage(err));
      onClose();
    },
    // Counts, last-sent date and history change whether it worked or not.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['notification-templates'] }),
  });

  const sending = publish.isPending;
  const close = () => {
    if (!sending) onClose();
  };
  const pushPart = template.channel === 'IN_APP' || !fresh ? '' : ` (${formatCount(fresh.withPushDevice)} by push)`;

  return (
    <Modal
      title="Send this notification?"
      size="sm"
      onClose={close}
      dismissible={!sending}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => publish.mutate()} disabled={sending || !fresh || fresh.mothers === 0}>
            {sending ? 'Sending…' : fresh ? `Send to ${mothersLabel(fresh.mothers)}` : 'Send'}
          </Button>
        </>
      }
    >
      {preview.isError ? (
        <ErrorState
          title="We couldn’t count the audience"
          message={apiErrorMessage(preview.error)}
          onRetry={() => void preview.refetch()}
          retrying={preview.isFetching}
        />
      ) : !fresh ? (
        <LoadingState label="Counting mothers…" />
      ) : fresh.mothers === 0 ? (
        <p className="modal-text">
          No mothers match this audience right now, so there is no one to send it to. Change the audience and save
          first.
        </p>
      ) : (
        <p className="modal-text">
          Send '{template.name}' to {mothersLabel(fresh.mothers)}
          {pushPart} now? This can't be undone.
        </p>
      )}
      {sending && (
        <div className="publish-sending">
          <Spinner size={16} aria-label="Sending" />
          <span>Sending now. Keep this tab open until it finishes.</span>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 14: Create the send history**

`apps/admin/src/features/notifications/broadcast-history.tsx`:

```tsx
import type { NotificationBroadcast, NotificationBroadcastStatus } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import {
  Badge,
  type Column,
  ErrorState,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { listTemplateBroadcasts } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime } from '@admin/lib/format';
import { useClientSort } from '@admin/lib/use-table-sort';

import { BROADCAST_STATUS_LABEL, BROADCAST_STATUS_TONE, formatCount } from './notification-labels';

type HistorySortKey =
  | 'createdAt'
  | 'publishedBy'
  | 'status'
  | 'targeted'
  | 'inAppCreated'
  | 'pushSent'
  | 'pushFailed'
  | 'noDevice';

/** Problems first when sorting by status. */
const STATUS_RANK: Record<NotificationBroadcastStatus, number> = { FAILED: 0, PARTIAL: 1, SENDING: 2, SENT: 3 };

const EMPTY = <span className="table-empty">—</span>;

/** The error (incl. "Timed out"), or the deleted groups a send skipped. */
function note(b: NotificationBroadcast): string | null {
  if (b.error) return b.error;
  const n = b.skippedGroupIds.length;
  return n > 0 ? `${n} deleted ${n === 1 ? 'group' : 'groups'} skipped` : null;
}

/** Every publish of one template, newest first, with what went out. */
export function BroadcastHistory({ templateId }: { templateId: number }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['notification-templates', templateId, 'broadcasts'],
    queryFn: () => listTemplateBroadcasts(templateId),
    // A send in flight finishes within a minute (or reads as timed out after five): poll until it settles.
    refetchInterval: (query) => (query.state.data?.some((b) => b.status === 'SENDING') ? 5000 : false),
  });
  const { rows, sort, onSortChange } = useClientSort<NotificationBroadcast, HistorySortKey>(
    data,
    {
      createdAt: (b) => b.createdAt,
      publishedBy: (b) => b.publishedBy.name,
      status: (b) => STATUS_RANK[b.status],
      targeted: (b) => b.targeted,
      inAppCreated: (b) => b.inAppCreated,
      pushSent: (b) => b.pushSent,
      pushFailed: (b) => b.pushFailed,
      noDevice: (b) => b.noDevice,
    },
    { sortBy: 'createdAt', sortDir: 'desc' },
  );

  const inbox = (b: NotificationBroadcast, n: number) => (b.channel === 'PUSH' ? EMPTY : formatCount(n));
  const push = (b: NotificationBroadcast, n: number) => (b.channel === 'IN_APP' ? EMPTY : formatCount(n));
  const columns: Column<NotificationBroadcast, HistorySortKey>[] = [
    { key: 'createdAt', header: 'Date', sortKey: 'createdAt', sortFirst: 'desc', nowrap: true, render: (b) => formatDateTime(b.createdAt) },
    { key: 'publishedBy', header: 'Published by', sortKey: 'publishedBy', render: (b) => b.publishedBy.name },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (b) => <Badge tone={BROADCAST_STATUS_TONE[b.status]}>{BROADCAST_STATUS_LABEL[b.status]}</Badge>,
    },
    { key: 'targeted', header: 'Targeted', sortKey: 'targeted', sortFirst: 'desc', align: 'right', render: (b) => formatCount(b.targeted) },
    { key: 'inApp', header: 'In-app', sortKey: 'inAppCreated', sortFirst: 'desc', align: 'right', render: (b) => inbox(b, b.inAppCreated) },
    { key: 'pushSent', header: 'Push sent', sortKey: 'pushSent', sortFirst: 'desc', align: 'right', render: (b) => push(b, b.pushSent) },
    { key: 'pushFailed', header: 'Push failed', sortKey: 'pushFailed', sortFirst: 'desc', align: 'right', render: (b) => push(b, b.pushFailed) },
    { key: 'noDevice', header: 'No device', sortKey: 'noDevice', sortFirst: 'desc', align: 'right', render: (b) => push(b, b.noDevice) },
    { key: 'note', header: 'Note', render: (b) => note(b) ?? EMPTY },
  ];

  return (
    <>
      {isLoading && <TableSkeleton columns={columns.length} />}
      {error != null && !data && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {data && (
        <>
          {error != null && (
            <StaleRefreshBanner message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
          )}
          <Table
            columns={columns}
            rows={rows ?? []}
            rowKey={(b) => b.id}
            sort={sort}
            onSortChange={onSortChange}
            empty="Not sent yet. Each time you publish, the send is listed here with its counts."
          />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 15: Wire Publish and the history into the editor**

In `apps/admin/src/features/notifications/template-editor.tsx`:

1. Imports — `import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom';`, add `Send` to the `@admin/components/ui` import, and:

```ts
import { BroadcastHistory } from './broadcast-history';
import { PublishDialog } from './publish-dialog';
```

2. After `const canManage = useCanManage('notifications');`:

```ts
  // The list's "Publish…" opens the editor at ?publish=1: the dialog is that parameter.
  const [searchParams, setSearchParams] = useSearchParams();
```

3. After `const unsaved = dirty || isNew;`:

```ts
  // Publish sends the saved template, so it waits for unsaved edits and an image upload.
  const canPublish = !isNew && !dirty && !imageBusy && !save.isPending;
  const publishing = template !== undefined && canManage && canPublish && searchParams.get('publish') === '1';
  const openPublish = () => setSearchParams({ publish: '1' }, { replace: true });
  const closePublish = () => setSearchParams({}, { replace: true });
```

4. In the header `actions`, between the Save button and the `{!isNew && (<ActionMenu …`:

```tsx
              {!isNew && (
                <Button variant={unsaved ? 'ghost' : 'primary'} onClick={openPublish} disabled={!canPublish}>
                  <Send size={ICON_SIZE.inline} aria-hidden />
                  Publish…
                </Button>
              )}
```

5. Directly after the closing `</div>` of `<div className="template-editor">`:

```tsx
      {template && (
        <>
          <h3 className="form-section-title">Send history</h3>
          <BroadcastHistory templateId={template.id} />
        </>
      )}
      {publishing && template && <PublishDialog template={template} onClose={closePublish} />}
```

- [ ] **Step 16: Run the tests to verify they pass**

Run: `pnpm --filter @nanny-app/admin test -- publish-flow template-editor template-audience-fields`
Expected: PASS (8 publish-flow tests; the editor and audience suites still green).

- [ ] **Step 17: Run the whole admin suite, typecheck and lint**

Run: `pnpm --filter @nanny-app/admin test && pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint`
Expected: PASS.

- [ ] **Step 18: Commit**

```bash
git add apps/admin
git commit -m "$(cat <<'EOF'
feat(admin): publish notification templates and show their send history

Publish waits for saved changes, re-counts the audience before the
"Send to N mothers" confirmation, locks while sending and reports the
broadcast counts, warning on partial or failed sends and noting skipped
groups. Each template lists its broadcasts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---


### Task 12: Admin — static/dynamic groups, picker and Mothers tab columns

> Note: the Mothers list uses Task 1's `AdminMotherSortKey` (the directory keys plus `lastAppOpenAt`) and `AdminMotherLastAppOpenFilter`. The query params are `status`, `lastAppOpen`, `page`, `limit`, `sortBy` and `sortDir`, which Task 5's `GET /admin/mothers` reads as they are.
> Note: `POST /admin/groups/rules-preview` needs `groups` MANAGE (Task 5), so the rule editor and its live count render only for group managers. A view-only operator gets the rules in words and the member table: `GET /admin/mother-picker` with `rules` needs only `groups` VIEW.
> Note: a dynamic group is created with `rules: []` (every active mother — the same as the seeded "All mothers") and its rules are set on its own page, where the rule editor has room for its live count and member table. The create dialog says so.
> Note: everything here is group code: it imports nothing from `features/notifications/` or `features/surveys/` (it uses Task 9's `group-labels.ts`, `SegmentedControl`, `useDebouncedValue` and API functions).

**Files:**
- Create: `apps/admin/src/features/groups/rule-editor.tsx`
- Modify: `apps/admin/src/features/groups/group-form.tsx`, `apps/admin/src/features/groups/group-table.tsx`, `apps/admin/src/features/groups/mother-picker-table.tsx`, `apps/admin/src/pages/groups-page.tsx`, `apps/admin/src/pages/group-detail-page.tsx`, `apps/admin/src/features/users/mothers-tab.tsx`, `apps/admin/src/lib/api.ts`, `apps/admin/src/styles/global.css`
- Test: `apps/admin/src/features/groups/__tests__/rule-editor.test.tsx` (create), `apps/admin/src/pages/__tests__/groups-page.test.tsx`, `apps/admin/src/pages/__tests__/group-detail-page.test.tsx`, `apps/admin/src/features/groups/__tests__/mother-picker-table.test.tsx` (extend), `apps/admin/src/features/users/__tests__/mothers-tab.test.tsx` (create)

**Interfaces:**
- Consumes: Task 1 (`DynamicGroupRule`, `DynamicGroupRules`, `DynamicGroupRuleSchema`, `DynamicGroupRulesSchema`, `DYNAMIC_RULE_DAYS_MAX`, `describeDynamicRules`, `UserGroupKind`, `UserGroup.kind/rules`, `MotherPickerRow.lastAppOpenAt`, `AdminMother.lastAppOpenAt`, `AdminMotherSortKey`, `AdminMotherLastAppOpenFilter`, `DynamicGroupRuleField`), Task 5 endpoints, Task 9 (`previewGroupRules`, `updateUserGroup(id, UserGroupUpdateInput)`, `fetchMotherPicker({ rules })`, `SegmentedControl`, `useDebouncedValue`, `group-labels.ts`).
- Produces:
  - `features/groups/rule-editor.tsx`: `RuleEditor({ value: DynamicGroupRules, onChange, disabled? })` — one row per field, a plain-language summary via `describeDynamicRules`, a live count via `previewGroupRules` (query key `['group-rules-preview', rules]`, debounced 400 ms); `RULE_FIELD_LABEL`.
  - `GroupFormModal` asks **Static** / **Dynamic** on create (`kind` fixed afterwards).
  - Group list: a **Type** column with a Static/Dynamic badge (sortable).
  - Group detail for DYNAMIC: a **Rules** card (editor + Save rules for managers, the summary in words for viewers) and the read-only member table (`MotherPickerTable` with `rules`, no selection, no Add mothers / Remove).
  - `MotherPickerTable` gains `rules?: DynamicGroupRules`; its "Last active" column is **Last login**, with a sortable **Last app open** beside it.
  - `fetchMothers(filters: { status; lastAppOpen }, query)`; the Mommies tab gains a sortable **Last app open** column and a **Last app open** filter.

#### Cycle A — the rule editor

- [ ] **Step 1: Load the `nanny-app-admin-design` and `ui-ux-pro-max:ui-ux-pro-max` skills**

Apply ui-ux-pro-max §1 `form-labels` (every rule control is named after its field), `aria-labels` (the icon-only Remove button), `focus-states`, `contextual-live-badge-updates` (the count is one polite status phrase); §8 `error-placement` (an out-of-range amount is flagged on its row and linked with `aria-describedby`), `progressive-disclosure` (fields are added one at a time from a menu), `input-type-keyboard` (`type="number"`). Admin skill: `Select` (compact, in-row), `Menu`, `Card` with an `action`, tokens only.

- [ ] **Step 2: Write the failing rule-editor test**

`apps/admin/src/features/groups/__tests__/rule-editor.test.tsx`:

```tsx
/**
 * The dynamic-group rule editor: rules are added one field at a time (a field
 * can't be used twice), each row reads as field / condition / amount, the
 * summary is the shared plain-language description, and a live count says how
 * many mothers the rules match.
 */
import type { DynamicGroupRules } from '@nanny-app/shared';
import { describeDynamicRules } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { RuleEditor } from '@admin/features/groups/rule-editor';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });

let previewCalls: { rules: DynamicGroupRules }[] = [];

beforeEach(() => {
  previewCalls = [];
  server.use(
    http.post('/api/admin/groups/rules-preview', async ({ request }) => {
      const body = (await request.json()) as { rules: DynamicGroupRules };
      previewCalls.push(body);
      // No rules is every active mother; any rule narrows it.
      return ok({ count: body.rules.length === 0 ? 5000 : 1240 });
    }),
  );
});

function Harness({ initial = [] }: { initial?: DynamicGroupRules }) {
  const [rules, setRules] = useState<DynamicGroupRules>(initial);
  return (
    <>
      <RuleEditor value={rules} onChange={setRules} />
      <output aria-label="rules">{JSON.stringify(rules)}</output>
    </>
  );
}

describe('RuleEditor', () => {
  it('adds a rule from the menu, describes it, counts the matches, and offers each field once', async () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText(describeDynamicRules([]))).toBeInTheDocument();
    expect(await screen.findByText('5,000 mothers match right now')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Last app open' }));

    const rule = { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 } as const;
    expect(screen.getByText(describeDynamicRules([rule]))).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Last app open: days' })).toHaveValue(30);
    expect(await screen.findByText('1,240 mothers match right now')).toBeInTheDocument();
    expect(previewCalls.at(-1)).toEqual({ rules: [rule] });

    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.queryByRole('menuitem', { name: 'Last app open' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Completed bookings' })).toBeInTheDocument();
  });

  it('changes a condition and an amount, and removing the rule updates the summary', async () => {
    renderWithProviders(<Harness initial={[{ field: 'completedBookings', op: 'gte', value: 1 }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Completed bookings: condition' }));
    await userEvent.click(screen.getByRole('option', { name: 'at most' }));
    const amount = screen.getByRole('spinbutton', { name: 'Completed bookings: number of bookings' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '0');

    const next = [{ field: 'completedBookings', op: 'lte', value: 0 }] as const;
    expect(screen.getByRole('status', { name: 'rules' })).toHaveTextContent(JSON.stringify(next));
    expect(screen.getByText(describeDynamicRules([...next]))).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove rule: Completed bookings' }));
    expect(screen.getByText(describeDynamicRules([]))).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'rules' })).toHaveTextContent('[]');
  });

  it('flags an out-of-range amount on its row and stops counting until it is fixed', async () => {
    renderWithProviders(<Harness initial={[{ field: 'lastAppOpenAt', op: 'withinDays', days: 7 }]} />);
    await screen.findByText('1,240 mothers match right now');
    const before = previewCalls.length;

    const days = screen.getByRole('spinbutton', { name: 'Last app open: days' });
    await userEvent.clear(days);
    const error = screen.getByText('Enter whole days from 1 to 3,650.');
    expect(days).toHaveAttribute('aria-invalid', 'true');
    expect(days).toHaveAttribute('aria-describedby', error.id);
    expect(screen.getByText('Fix the rules above to see how many mothers match.')).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(previewCalls.length).toBe(before);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @nanny-app/admin test -- rule-editor`
Expected: FAIL — `Cannot find module '@admin/features/groups/rule-editor'`.

- [ ] **Step 4: Create the rule editor**

`apps/admin/src/features/groups/rule-editor.tsx`:

```tsx
import type { DynamicGroupRule, DynamicGroupRuleField, DynamicGroupRules } from '@nanny-app/shared';
import {
  DYNAMIC_RULE_DAYS_MAX,
  DynamicGroupRuleSchema,
  DynamicGroupRulesSchema,
  describeDynamicRules,
} from '@nanny-app/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId } from 'react';

import {
  Button,
  ICON_SIZE,
  Input,
  Menu,
  MenuItem,
  Plus,
  Select,
  Trash2,
  type SelectOption,
} from '@admin/components/ui';
import { previewGroupRules } from '@admin/lib/api';
import { useDebouncedValue } from '@admin/lib/use-debounced-value';

type RuleField = DynamicGroupRuleField;

export const RULE_FIELD_LABEL: Record<RuleField, string> = {
  lastAppOpenAt: 'Last app open',
  lastLoginAt: 'Last sign-in',
  lastBookingAt: 'Last completed booking',
  createdAt: 'Signed up',
  completedBookings: 'Completed bookings',
  totalSpent: 'Total spent',
};

/** The order fields are offered in "Add rule": the re-engagement ones first. */
const FIELD_ORDER: readonly RuleField[] = [
  'lastAppOpenAt',
  'lastLoginAt',
  'lastBookingAt',
  'createdAt',
  'completedBookings',
  'totalSpent',
];

/** A sensible first value for each field, so a new row is already a valid rule. */
const DEFAULT_RULE: Record<RuleField, DynamicGroupRule> = {
  lastAppOpenAt: { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
  lastLoginAt: { field: 'lastLoginAt', op: 'notWithinDays', days: 30 },
  lastBookingAt: { field: 'lastBookingAt', op: 'notWithinDays', days: 60 },
  createdAt: { field: 'createdAt', op: 'withinDays', days: 30 },
  completedBookings: { field: 'completedBookings', op: 'gte', value: 1 },
  totalSpent: { field: 'totalSpent', op: 'gte', value: 1000 },
};

function opOptions(field: RuleField): SelectOption[] {
  if (field === 'completedBookings' || field === 'totalSpent') {
    return [
      { value: 'gte', label: 'at least' },
      { value: 'lte', label: 'at most' },
    ];
  }
  if (field === 'createdAt') {
    return [
      { value: 'withinDays', label: 'within the last' },
      { value: 'notWithinDays', label: 'more than' },
    ];
  }
  return [
    { value: 'withinDays', label: 'within the last' },
    { value: 'notWithinDays', label: 'not in the last' },
  ];
}

/** The word after the amount, so each row reads as a sentence. */
function unitOf(rule: DynamicGroupRule): string {
  if (rule.field === 'createdAt') return rule.op === 'notWithinDays' ? 'days ago' : 'days';
  if ('days' in rule) return rule.op === 'notWithinDays' ? 'days (or never)' : 'days';
  if (rule.field === 'totalSpent') return 'EGP';
  return rule.value === 1 ? 'booking' : 'bookings';
}

function amountLabel(rule: DynamicGroupRule): string {
  const field = RULE_FIELD_LABEL[rule.field];
  if ('days' in rule) return `${field}: days`;
  return `${field}: ${rule.field === 'totalSpent' ? 'amount in EGP' : 'number of bookings'}`;
}

function withOp(rule: DynamicGroupRule, op: string): DynamicGroupRule {
  return 'days' in rule
    ? { ...rule, op: op === 'withinDays' ? 'withinDays' : 'notWithinDays' }
    : { ...rule, op: op === 'lte' ? 'lte' : 'gte' };
}

/** An emptied box is NaN: it shows as empty and fails validation, rather than reading as 0. */
function withAmount(rule: DynamicGroupRule, raw: string): DynamicGroupRule {
  const n = raw.trim() === '' ? Number.NaN : Number(raw);
  return 'days' in rule ? { ...rule, days: n } : { ...rule, value: n };
}

function ruleError(rule: DynamicGroupRule): string | undefined {
  if (DynamicGroupRuleSchema.safeParse(rule).success) return undefined;
  if ('days' in rule) return `Enter whole days from 1 to ${DYNAMIC_RULE_DAYS_MAX.toLocaleString('en-US')}.`;
  return rule.field === 'completedBookings' ? 'Enter a whole number, 0 or more.' : 'Enter an amount, 0 or more.';
}

type RuleEditorProps = {
  value: DynamicGroupRules;
  onChange: (next: DynamicGroupRules) => void;
  /** Locks every control, e.g. while the rules are being saved. */
  disabled?: boolean;
};

/**
 * A dynamic group's rules, AND-ed: one row per field (field · condition ·
 * amount · remove), fields added from a menu that only offers unused ones.
 * Under them, the rules in words and how many mothers they match right now.
 */
export function RuleEditor({ value, onChange, disabled = false }: RuleEditorProps) {
  const baseId = useId();
  const valid = DynamicGroupRulesSchema.safeParse(value).success;
  const debounced = useDebouncedValue(value, 400);
  const count = useQuery({
    queryKey: ['group-rules-preview', debounced],
    queryFn: () => previewGroupRules(debounced),
    enabled: DynamicGroupRulesSchema.safeParse(debounced).success,
    placeholderData: keepPreviousData,
  });

  const used = new Set(value.map((r) => r.field));
  const unused = FIELD_ORDER.filter((field) => !used.has(field));
  const replace = (index: number, rule: DynamicGroupRule) =>
    onChange(value.map((r, i) => (i === index ? rule : r)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  // The summary describes the rows that are valid, so a half-typed amount never reads "NaN".
  const describable = value.filter((r) => DynamicGroupRuleSchema.safeParse(r).success);
  const settled = debounced === value && !count.isPlaceholderData;
  const countText = !valid
    ? 'Fix the rules above to see how many mothers match.'
    : count.isError
      ? 'We couldn’t count the matching mothers.'
      : !count.data || !settled
        ? 'Counting mothers…'
        : `${count.data.count.toLocaleString('en-US')} ${count.data.count === 1 ? 'mother matches' : 'mothers match'} right now`;

  return (
    <div className="rule-editor">
      {value.length === 0 ? (
        <p className="field-hint">No rules yet, so this group is every active mother. Add a rule to narrow it.</p>
      ) : (
        <ul className="rule-list" aria-label="Rules">
          {value.map((rule, index) => {
            const label = RULE_FIELD_LABEL[rule.field];
            const error = ruleError(rule);
            const errorId = `${baseId}-${rule.field}-error`;
            const amount = 'days' in rule ? rule.days : rule.value;
            return (
              <li key={rule.field} className="rule-row">
                <span className="rule-row-field">{label}</span>
                <Select
                  compact
                  value={rule.op}
                  options={opOptions(rule.field)}
                  onChange={(op) => replace(index, withOp(rule, op))}
                  aria-label={`${label}: condition`}
                  disabled={disabled}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={'days' in rule ? 1 : 0}
                  max={'days' in rule ? DYNAMIC_RULE_DAYS_MAX : undefined}
                  step={rule.field === 'totalSpent' ? 'any' : 1}
                  className="rule-row-amount"
                  value={Number.isNaN(amount) ? '' : String(amount)}
                  onChange={(e) => replace(index, withAmount(rule, e.target.value))}
                  aria-label={amountLabel(rule)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  disabled={disabled}
                />
                <span className="rule-row-unit">{unitOf(rule)}</span>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rule-row-remove"
                    aria-label={`Remove rule: ${label}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={ICON_SIZE.inline} aria-hidden />
                  </Button>
                )}
                {error && (
                  <span className="field-error rule-row-error" id={errorId}>
                    {error}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!disabled && unused.length > 0 && (
        <Menu
          trigger={
            <>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add rule
            </>
          }
          triggerLabel="Add rule"
          triggerClassName="btn btn--ghost btn--sm"
          placement="bottom-start"
        >
          {unused.map((field) => (
            <MenuItem key={field} onSelect={() => onChange([...value, DEFAULT_RULE[field]])}>
              {RULE_FIELD_LABEL[field]}
            </MenuItem>
          ))}
        </Menu>
      )}
      <div className="rule-summary">
        <span className="rule-summary-label">Matches</span>
        <p>{describeDynamicRules(describable)}</p>
      </div>
      <p className="rule-count" role="status">
        {countText}
      </p>
    </div>
  );
}
```

Append to `apps/admin/src/styles/global.css`:

```css
/* ── Dynamic group rules ────────────────────────────────── */
.rule-editor {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Field · condition · amount · unit · remove; the error spans the row. */
.rule-row {
  display: grid;
  grid-template-columns: minmax(9rem, 12rem) minmax(10rem, 13rem) 7rem auto 1fr;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-warm-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.rule-row-field {
  color: var(--color-text-primary);
  font-size: 0.9rem;
  font-weight: 700;
}

.rule-row-amount {
  width: 100%;
}

.rule-row-unit {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  white-space: nowrap;
}

.rule-row-remove {
  justify-self: end;
}

.rule-row-error {
  grid-column: 1 / -1;
}

@media (max-width: 720px) {
  .rule-row {
    grid-template-columns: 1fr 1fr;
  }

  .rule-row-field {
    grid-column: 1 / -1;
  }
}

.rule-summary {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  background: var(--color-warm-subtle);
}

.rule-summary-label {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.rule-summary p,
.rule-summary-text {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 0.9rem;
  font-weight: 600;
}

.rule-count {
  margin: 0;
  color: var(--color-primary-dark);
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @nanny-app/admin test -- rule-editor`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck, lint, commit**

Run: `pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint`
Expected: PASS.

```bash
git add apps/admin
git commit -m "$(cat <<'EOF'
feat(admin): rule editor for dynamic groups

One row per field with condition and amount, fields added from a menu
of unused ones, the rules in plain words and a live count of matching
mothers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

#### Cycle B — static or dynamic groups: create, list, detail

- [ ] **Step 7: Write the failing group page tests**

`apps/admin/src/pages/__tests__/groups-page.test.tsx` — change the expected body of `'creates a group and opens it'` (the dialog now sends the kind it asks for):

```ts
    await waitFor(() => expect(body).toEqual({ name: 'Beta', description: '', kind: 'STATIC' }));
```

and add, inside the `describe`, with `import { within } from '@testing-library/react';` added to the existing import:

```tsx
  const LAPSED: UserGroup = {
    id: 10, name: 'Lapsed 30d', description: null, kind: 'DYNAMIC',
    rules: [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }],
    memberCount: 340, createdAt: '2026-10-20T10:00:00.000Z',
  };

  it('marks each group Static or Dynamic', async () => {
    server.use(http.get('/api/admin/groups', () => ok([BETA, LAPSED])));
    renderPage();
    const beta = (await screen.findByText('Beta')).closest('tr')!;
    expect(within(beta).getByText('Static')).toBeInTheDocument();
    const lapsed = screen.getByText('Lapsed 30d').closest('tr')!;
    expect(within(lapsed).getByText('Dynamic')).toBeInTheDocument();
    expect(within(lapsed).getByText('340')).toBeInTheDocument();
  });

  it('creates a dynamic group with no rules yet and opens it to set them', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/groups', () => ok([])),
      http.post('/api/admin/groups', async ({ request }) => {
        body = await request.json();
        return ok({ ...LAPSED, rules: [] });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new group/i }));
    expect(screen.getByRole('radio', { name: 'Static' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Dynamic' }));
    expect(screen.getByText(/until then it matches every active mother/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Lapsed 30d');
    await userEvent.click(screen.getByRole('button', { name: /create group/i }));
    await waitFor(() => expect(body).toEqual({ name: 'Lapsed 30d', description: '', kind: 'DYNAMIC', rules: [] }));
    expect(await screen.findByText('group open')).toBeInTheDocument();
  });
```

`apps/admin/src/pages/__tests__/group-detail-page.test.tsx` — import `describeDynamicRules` (`import { describeDynamicRules } from '@nanny-app/shared';`), let `renderPage` take the URL:

```tsx
function renderPage(url = '/groups/5') {
  renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/groups/:id" element={<GroupDetailPage />} />
          </Routes>
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}
```

and add, inside the `describe`:

```tsx
  const DYNAMIC: UserGroup = {
    id: 6, name: 'Lapsed 30d', description: null, kind: 'DYNAMIC',
    rules: [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }],
    memberCount: 1, createdAt: '2026-10-20T00:00:00.000Z',
  };

  it("shows a dynamic group's rules and who matches them, with no member add or remove", async () => {
    let pickerRules: string | null = null;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/groups/6', () => ok(DYNAMIC)),
      http.get('/api/admin/mother-picker', ({ request }) => {
        pickerRules = new URL(request.url).searchParams.get('rules');
        return picker([AMY]);
      }),
      http.post('/api/admin/groups/rules-preview', () => ok({ count: 1 })),
    );
    renderPage('/groups/6');

    expect(await screen.findByText('Amy')).toBeInTheDocument();
    expect(pickerRules).toBe(JSON.stringify(DYNAMIC.rules));
    expect(screen.getByText(describeDynamicRules(DYNAMIC.rules ?? []))).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Last app open: days' })).toHaveValue(30);
    expect(screen.queryByRole('button', { name: /add mothers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /from group/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it("saves a dynamic group's edited rules", async () => {
    let patched: unknown;
    const sixty = [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 60 }] as const;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/groups/6', () => ok(DYNAMIC)),
      http.get('/api/admin/mother-picker', () => picker([AMY])),
      http.post('/api/admin/groups/rules-preview', () => ok({ count: 1 })),
      http.patch('/api/admin/groups/6', async ({ request }) => {
        patched = await request.json();
        return ok({ ...DYNAMIC, rules: [...sixty] });
      }),
    );
    renderPage('/groups/6');

    const saveRules = await screen.findByRole('button', { name: 'Save rules' });
    expect(saveRules).toBeDisabled();
    const days = screen.getByRole('spinbutton', { name: 'Last app open: days' });
    await userEvent.clear(days);
    await userEvent.type(days, '60');
    await userEvent.click(saveRules);
    await waitFor(() =>
      expect(patched).toEqual({ name: 'Lapsed 30d', description: null, rules: [...sixty] }),
    );
    expect(await screen.findByText('Rules saved')).toBeInTheDocument();
    expect(saveRules).toBeDisabled();
  });

  it('shows a view-only operator the rules in words, without the editor', async () => {
    const viewer: AdminUser = { ...ADMIN, role: 'OPERATOR', permissions: { groups: 'VIEW' } };
    server.use(
      http.get('/api/admin/me', () => ok(viewer)),
      http.get('/api/admin/groups/6', () => ok(DYNAMIC)),
      http.get('/api/admin/mother-picker', () => picker([AMY])),
    );
    renderPage('/groups/6');

    expect(await screen.findByText(describeDynamicRules(DYNAMIC.rules ?? []))).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save rules' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 8: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/admin test -- groups-page group-detail-page`
Expected: FAIL — the create body has no `kind`, there is no Type column, no Static/Dynamic choice, and a dynamic group's page still offers "Add mothers".

- [ ] **Step 9: Ask Static or Dynamic on create**

Replace `apps/admin/src/features/groups/group-form.tsx`:

```tsx
import {
  USER_GROUP_DESCRIPTION_MAX,
  USER_GROUP_NAME_MAX,
  type UserGroup,
  type UserGroupKind,
} from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { Field, FormModal, Input, SegmentedControl, useToast, type SegmentedOption } from '@admin/components/ui';
import { createUserGroup, updateUserGroup } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { GROUP_KIND_HINT, GROUP_KIND_LABEL } from './group-labels';

const KIND_OPTIONS: readonly SegmentedOption<UserGroupKind>[] = (['STATIC', 'DYNAMIC'] as const).map((value) => ({
  value,
  label: GROUP_KIND_LABEL[value],
}));

type GroupFormModalProps = {
  /** Omit to create a group. */
  group?: UserGroup;
  onClose: () => void;
  /** Runs after a successful save, e.g. to open the new group. */
  onSaved?: (group: UserGroup) => void;
};

/**
 * The one create/edit dialog for a group. Creating asks Static or Dynamic —
 * fixed from then on. A dynamic group starts with no rules (every active
 * mother); its rules are set on its own page.
 */
export function GroupFormModal({ group, onClose, onSaved }: GroupFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [kind, setKind] = useState<UserGroupKind>('STATIC');
  const kindHintId = useId();

  const save = useMutation({
    mutationFn: () => {
      if (group) return updateUserGroup(group.id, { name, description });
      return createUserGroup(
        kind === 'DYNAMIC' ? { name, description, kind, rules: [] } : { name, description, kind },
      );
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success(group ? 'Group saved' : 'Group created');
      onClose();
      onSaved?.(saved);
    },
  });

  return (
    <FormModal
      title={group ? 'Edit group' : 'New group'}
      submitLabel={group ? 'Save' : 'Create group'}
      onSubmit={() => save.mutate()}
      onClose={onClose}
      busy={save.isPending}
      submitDisabled={name.trim().length === 0}
      error={save.isError ? apiErrorMessage(save.error) : null}
      size="sm"
    >
      {!group && (
        <div className="field">
          <SegmentedControl legend="Type" value={kind} options={KIND_OPTIONS} onChange={setKind} describedBy={kindHintId} />
          <span className="field-hint" id={kindHintId}>
            {GROUP_KIND_HINT[kind]}
            {kind === 'DYNAMIC' ? ' You set the rules on the next page; until then it matches every active mother.' : ''}
          </span>
        </div>
      )}
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={USER_GROUP_NAME_MAX} autoFocus />
      </Field>
      <Field label="Description" hint="Optional. Who is in this group and why.">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={USER_GROUP_DESCRIPTION_MAX}
        />
      </Field>
    </FormModal>
  );
}
```

- [ ] **Step 10: Show the kind in the list and on the Groups page**

`apps/admin/src/features/groups/group-table.tsx`:

- add `Badge` to the `@admin/components/ui` import and `import { GROUP_KIND_LABEL, GROUP_KIND_TONE } from './group-labels';`
- `type GroupSortKey = 'id' | 'name' | 'kind' | 'memberCount' | 'createdAt';`
- add `kind: (g) => GROUP_KIND_LABEL[g.kind],` to the `useClientSort` accessors
- add after the `name` column:

```tsx
    {
      key: 'kind',
      header: 'Type',
      sortKey: 'kind',
      render: (g) => <Badge tone={GROUP_KIND_TONE[g.kind]}>{GROUP_KIND_LABEL[g.kind]}</Badge>,
    },
```

- change the `members` column's render to say a dynamic count is live (one value per cell, so the word goes in the header's meaning, not under the number) — keep `render: (g) => g.memberCount` and change its `header` to `'Members (now)'`
- change the empty text to: `"No groups yet. Add one with “New group”: hand-pick mothers, or set rules that pick them for you."`

`apps/admin/src/pages/groups-page.tsx` — change the doc comment to `/** Groups of mothers — hand-picked (static) or matched by rules (dynamic). Its own section so Surveys and Notifications can both send to a group. */` and the subtitle to:

```tsx
        subtitle="Lists of mothers to send surveys and notifications to: hand-picked, or matched by rules."
```

- [ ] **Step 11: Let the mother picker list a dynamic group's matches**

In `apps/admin/src/features/groups/mother-picker-table.tsx`:

- import `type DynamicGroupRules` from `@nanny-app/shared` (beside `MotherPickerRow`)
- add to `MotherPickerTableProps`:

```ts
  /** A dynamic group's rules: list only the mothers they match now. */
  rules?: DynamicGroupRules;
```

- take `rules` in the destructured props, and send it with the query:

```ts
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['mother-picker', { search, groupId, excludeGroupId, rules, page, limit, ...sort }],
    queryFn: () => fetchMotherPicker({ search, groupId, excludeGroupId, rules, page, limit, ...sort }),
    placeholderData: keepPreviousData,
  });
```

- in the hint paragraph, after the `excludeGroupId` line add `{rules !== undefined && 'Everyone matching the saved rules, worked out now. '}`

(The column changes come in Cycle C.)

- [ ] **Step 12: Give dynamic groups their own detail view**

Replace `apps/admin/src/pages/group-detail-page.tsx`:

```tsx
import type { DynamicGroupRules, UserGroup } from '@nanny-app/shared';
import { DynamicGroupRulesSchema, describeDynamicRules } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Button,
  Card,
  ConfirmDialog,
  DetailHeader,
  ErrorState,
  ICON_SIZE,
  LoadingState,
  Modal,
  Pencil,
  Plus,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { GroupFormModal } from '@admin/features/groups/group-form';
import { GROUP_KIND_LABEL } from '@admin/features/groups/group-labels';
import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import { RuleEditor } from '@admin/features/groups/rule-editor';
import {
  addUserGroupMembers,
  deleteUserGroup,
  fetchUserGroup,
  removeUserGroupMembers,
  updateUserGroup,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

const mothers = (n: number) => `${n.toLocaleString('en-US')} mother${n === 1 ? '' : 's'}`;

/** A dynamic group's member table selects nothing. */
const NO_SELECTION: ReadonlySet<number> = new Set();

/**
 * One group. Static: its members (the picker filtered to the group) and a
 * picker to add more. Dynamic: its rules and the mothers they match now —
 * members can't be added or removed by hand.
 */
export function GroupDetailPage() {
  const { id = '' } = useParams();
  const groupId = Number(id);
  const canManage = useCanManage('groups');
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [memberSelection, setMemberSelection] = useState<Set<number>>(new Set());
  const [addSelection, setAddSelection] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const group = useQuery({ queryKey: ['groups', groupId], queryFn: () => fetchUserGroup(groupId) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    void queryClient.invalidateQueries({ queryKey: ['mother-picker'] });
  };

  const add = useMutation({
    mutationFn: () => addUserGroupMembers(groupId, [...addSelection]),
    // The picker leaves current members out, but another admin may have added
    // one meanwhile (adding is idempotent), so count what the server added.
    onSuccess: (updated) => {
      const added = Math.max(0, updated.memberCount - (group.data?.memberCount ?? 0));
      toast.success(added === 0 ? 'They were already in the group' : `Added ${mothers(added)}`);
      setAddSelection(new Set());
      setAdding(false);
      refresh();
    },
    onError: (err) => toast.error('Couldn’t add them', apiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => removeUserGroupMembers(groupId, [...memberSelection]),
    onSuccess: () => {
      toast.success(`Removed ${mothers(memberSelection.size)}`);
      setMemberSelection(new Set());
      setRemoving(false);
      refresh();
    },
    onError: (err) => {
      setRemoving(false);
      toast.error('Couldn’t remove them', apiErrorMessage(err));
    },
  });
  const del = useMutation({
    mutationFn: () => deleteUserGroup(groupId),
    onSuccess: () => {
      toast.success('Group deleted');
      refresh();
      navigate('/groups');
    },
    onError: (err) => toast.error('Couldn’t delete the group', apiErrorMessage(err)),
  });

  if (group.isLoading) return <LoadingState label="Loading group…" />;
  if (group.error != null || !group.data) {
    return (
      <ErrorState
        message={apiErrorMessage(group.error)}
        onRetry={() => void group.refetch()}
        retrying={group.isFetching}
      />
    );
  }

  const g = group.data;
  const dynamic = g.kind === 'DYNAMIC';
  const n = addSelection.size;
  const closeAdd = () => {
    setAddSelection(new Set());
    setDiscarding(false);
    setAdding(false);
  };
  // Ticks across pages are real work: ask before Escape or Close drops them.
  const requestCloseAdd = () => (n === 0 ? closeAdd() : setDiscarding(true));
  const m = memberSelection.size;
  const size = dynamic ? `${mothers(g.memberCount)} right now` : mothers(g.memberCount);

  return (
    <section>
      <DetailHeader
        title={g.name}
        subtitle={[size, GROUP_KIND_LABEL[g.kind], g.description].filter(Boolean).join(' · ')}
        backTo="/groups"
        backLabel="Groups"
        actions={
          canManage && (
            <>
              <Button variant="ghost" onClick={() => setEditing(true)}>
                <Pencil size={ICON_SIZE.inline} aria-hidden />
                Edit
              </Button>
              <Button variant="danger" onClick={() => setDeleting(true)}>
                <Trash2 size={ICON_SIZE.inline} aria-hidden />
                Delete
              </Button>
              {!dynamic && (
                <Button onClick={() => setAdding(true)}>
                  <Plus size={ICON_SIZE.inline} aria-hidden />
                  Add mothers
                </Button>
              )}
            </>
          )
        }
      />

      {dynamic ? (
        <>
          <RulesCard key={g.id} group={g} canManage={canManage} />
          <h3 className="form-section-title">Who matches now</h3>
          <MotherPickerTable
            rules={g.rules ?? []}
            selected={NO_SELECTION}
            onSelectedChange={() => undefined}
            selectable={false}
          />
        </>
      ) : (
        <>
          {canManage && (
            // Always rendered (disabled at 0) so the first tick doesn't push the table down.
            <div className="filter-bar">
              <Button variant="danger" onClick={() => setRemoving(true)} disabled={m === 0 || remove.isPending}>
                {m === 0 ? 'Remove from group' : `Remove ${m} from group`}
              </Button>
            </div>
          )}
          <MotherPickerTable
            groupId={groupId}
            selected={memberSelection}
            onSelectedChange={setMemberSelection}
            selectable={canManage}
          />
        </>
      )}

      {adding && !dynamic && (
        <Modal
          title="Add mothers"
          size="lg"
          onClose={requestCloseAdd}
          dismissible={n === 0}
          footer={
            <>
              <Button variant="ghost" onClick={requestCloseAdd} disabled={add.isPending}>
                Cancel
              </Button>
              <Button onClick={() => add.mutate()} disabled={n === 0 || add.isPending}>
                Add {mothers(n)}
              </Button>
            </>
          }
        >
          <MotherPickerTable selected={addSelection} onSelectedChange={setAddSelection} excludeGroupId={groupId} />
          {discarding && (
            <ConfirmDialog
              title="Discard your selection?"
              message={`The ${mothers(n)} you ticked won’t be added.`}
              confirmLabel="Discard"
              cancelLabel="Keep picking"
              danger
              onConfirm={closeAdd}
              onCancel={() => setDiscarding(false)}
            />
          )}
        </Modal>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${mothers(m)} from this group?`}
          message="They stay in the app, and anything already sent to the group is not affected."
          confirmLabel="Remove"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setRemoving(false)}
        />
      )}
      {editing && <GroupFormModal group={g} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this group?"
          message="Anything already sent to it is not affected, and the mothers stay in the app."
          confirmLabel="Delete group"
          danger
          busy={del.isPending}
          onConfirm={() => del.mutate()}
          onCancel={() => setDeleting(false)}
        />
      )}
    </section>
  );
}

/** A dynamic group's rules: the editor and Save for managers, the rules in words for viewers. */
function RulesCard({ group, canManage }: { group: UserGroup; canManage: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const savedRules = group.rules ?? [];
  const [rules, setRules] = useState<DynamicGroupRules>(savedRules);
  const dirty = JSON.stringify(rules) !== JSON.stringify(savedRules);
  const valid = DynamicGroupRulesSchema.safeParse(rules).success;

  const save = useMutation({
    mutationFn: () => updateUserGroup(group.id, { name: group.name, description: group.description, rules }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['groups', group.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['groups'], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['mother-picker'] });
      setRules(saved.rules ?? []);
      toast.success('Rules saved');
    },
    onError: (err) => toast.error('Couldn’t save the rules', apiErrorMessage(err)),
  });

  return (
    <Card
      title="Rules"
      action={
        canManage && (
          <div className="row-actions">
            <Button variant="ghost" size="sm" onClick={() => setRules(savedRules)} disabled={!dirty || save.isPending}>
              Discard changes
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || !valid || save.isPending}>
              Save rules
            </Button>
          </div>
        )
      }
    >
      {canManage ? (
        <RuleEditor value={rules} onChange={setRules} disabled={save.isPending} />
      ) : (
        <p className="rule-summary-text">{describeDynamicRules(savedRules)}</p>
      )}
    </Card>
  );
}
```

- [ ] **Step 13: Run them to verify they pass**

Run: `pnpm --filter @nanny-app/admin test -- groups-page group-detail-page rule-editor mother-picker-table recipient-picker-modal`
Expected: PASS (the existing static-group tests unchanged; the 3 new detail tests and 2 new list tests green; the survey recipient picker unaffected).

- [ ] **Step 14: Typecheck, lint, commit**

Run: `pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint`
Expected: PASS.

```bash
git add apps/admin
git commit -m "$(cat <<'EOF'
feat(admin): static and dynamic groups

New group asks Static or Dynamic; the list shows a type badge; a dynamic
group's page holds its rules and a read-only table of the mothers they
match now, with no hand-picked member controls.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

#### Cycle C — last login and last app open in the picker and the Mommies tab

- [ ] **Step 15: Write the failing column and filter tests**

Add to `apps/admin/src/features/groups/__tests__/mother-picker-table.test.tsx`, inside the `describe`:

```tsx
  it('shows last login and last app open as separate sortable columns', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get('/api/admin/mother-picker', ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [{ ...row(1, 'Amy'), lastAppOpenAt: '2026-10-18T09:00:00.000Z' }],
          error: null,
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }),
    );
    renderWithProviders(<Harness />);

    expect(await screen.findByRole('button', { name: /last login/i })).toBeInTheDocument();
    expect(screen.queryByText('Last active')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /last app open/i }));
    await waitFor(() => expect(seen.at(-1)?.get('sortBy')).toBe('lastAppOpenAt'));
    expect(seen.at(-1)?.get('sortDir')).toBe('desc');
  });

  it("lists a dynamic group's matches by sending its rules", async () => {
    const rules = [{ field: 'completedBookings', op: 'gte', value: 3 }] as const;
    let sent: string | null = null;
    server.use(
      http.get('/api/admin/mother-picker', ({ request }) => {
        sent = new URL(request.url).searchParams.get('rules');
        return HttpResponse.json({ data: [row(1, 'Amy')], error: null, meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
      }),
    );
    renderWithProviders(
      <MotherPickerTable rules={[...rules]} selected={new Set()} onSelectedChange={vi.fn()} selectable={false} />,
    );
    expect(await screen.findByText('Amy')).toBeInTheDocument();
    expect(sent).toBe(JSON.stringify(rules));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
```

`apps/admin/src/features/users/__tests__/mothers-tab.test.tsx`:

```tsx
/**
 * The Mommies directory shows when each mother last opened the app, sorts by
 * it, and filters to "within N days" / "not in N+ days" / "never".
 */
import type { AdminMother } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { MothersTab } from '@admin/features/users/mothers-tab';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const AMY: AdminMother = {
  id: 21, name: 'Amy Adel', email: 'amy@example.com', phone: null, avatarUrl: null, location: null,
  isEmailVerified: true, isPhoneVerified: true, isActive: true, approvalStatus: 'APPROVED',
  idDocumentType: null, rejectionReason: null, reviewedAt: null, idDocumentFrontUrl: null,
  idDocumentBackUrl: null, bookingCount: 2, createdAt: '2026-09-01T00:00:00.000Z', lastAppOpenAt: null,
};

const page = (data: AdminMother[]) =>
  HttpResponse.json({ data, error: null, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } });

describe('MothersTab', () => {
  it('shows Never for a mother who has not opened the app, and sorts and filters by last app open', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get('/api/admin/mothers', ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return page([AMY]);
      }),
    );
    renderWithProviders(
      <MemoryRouter>
        <MothersTab />
      </MemoryRouter>,
    );

    const row = (await screen.findByText('Amy Adel')).closest('tr')!;
    expect(within(row).getByText('Never')).toBeInTheDocument();
    expect(seen.at(-1)?.get('lastAppOpen')).toBe('ANY');

    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /last app open/i }));
    await waitFor(() => expect(seen.at(-1)?.get('sortBy')).toBe('lastAppOpenAt'));
    expect(seen.at(-1)?.get('sortDir')).toBe('desc');

    // The filter's trigger is named by its <label for>; the column header is not a label.
    await userEvent.click(screen.getByLabelText('Last app open'));
    await userEvent.click(await screen.findByRole('option', { name: 'Not in 30+ days' }));
    await waitFor(() => expect(seen.at(-1)?.get('lastAppOpen')).toBe('NOT_30'));
  });
});
```

- [ ] **Step 16: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/admin test -- mother-picker-table mothers-tab`
Expected: FAIL — no "Last login"/"Last app open" headers in the picker; no "Last app open" column or filter in the Mommies tab, and no `lastAppOpen` param.

- [ ] **Step 17: Rename and add the picker columns**

In `apps/admin/src/features/groups/mother-picker-table.tsx` replace the last column (`key: 'active'`, "Last active") with:

```tsx
    {
      key: 'lastLogin',
      header: 'Last login',
      sortKey: 'lastLoginAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (r) => day(r.lastLoginAt),
    },
    {
      key: 'lastAppOpen',
      header: 'Last app open',
      sortKey: 'lastAppOpenAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (r) => day(r.lastAppOpenAt),
    },
```

- [ ] **Step 18: Filter and sort the Mommies list by last app open**

In `apps/admin/src/lib/api.ts` add `AdminMotherLastAppOpenFilter` and `AdminMotherSortKey` to the shared type imports and replace `fetchMothers`:

```ts
export async function fetchMothers(
  filters: {
    status: AdminApprovalStatusFilter;
    /** When she last opened the app: within / not within N days, or never. */
    lastAppOpen: AdminMotherLastAppOpenFilter;
  },
  { page, limit, sortBy, sortDir }: ColumnSortedListQuery<AdminMotherSortKey>,
): Promise<Paged<AdminMother[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminMother[]>>('/admin/mothers', {
    params: { ...filters, page, limit, sortBy, sortDir },
  });
  return { data: res.data.data, meta: res.data.meta };
}
```

Replace `apps/admin/src/features/users/mothers-tab.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ADMIN_PAGE_SIZES,
  type AdminApprovalStatusFilter,
  type AdminMother,
  type AdminMotherLastAppOpenFilter,
  type AdminMotherSortKey,
} from '@nanny-app/shared';

import {
  Badge,
  type Column,
  idColumn,
  ErrorState,
  FilterSelect,
  Pagination,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchMothers } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { usePagination } from '@admin/lib/use-pagination';
import { useTableSort } from '@admin/lib/use-table-sort';

type MotherSortKey = AdminMotherSortKey;
type LastAppOpenFilter = AdminMotherLastAppOpenFilter;

const STATUS_FILTERS: { value: AdminApprovalStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_ID', label: 'Awaiting ID' },
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

/** Each maps to one dynamic-group-style rule on the API (NOT_* include never). */
const LAST_APP_OPEN_FILTERS: { value: LastAppOpenFilter; label: string }[] = [
  { value: 'ANY', label: 'Any time' },
  { value: 'WITHIN_7', label: 'Within 7 days' },
  { value: 'WITHIN_30', label: 'Within 30 days' },
  { value: 'NOT_30', label: 'Not in 30+ days' },
  { value: 'NOT_90', label: 'Not in 90+ days' },
  { value: 'NEVER', label: 'Never' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const EMPTY = <span className="table-empty">—</span>;

/**
 * The parent directory. Newest sign-ups first by default — a directory is read
 * from the most recent — and re-sorted by clicking a column header.
 */
export function MothersTab() {
  const [status, setStatus] = useState<AdminApprovalStatusFilter>('ALL');
  const [lastAppOpen, setLastAppOpen] = useState<LastAppOpenFilter>('ANY');
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const { sort, onSortChange } = useTableSort<MotherSortKey>({ sortBy: 'registered', sortDir: 'desc' }, reset);
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-mothers', status, lastAppOpen, sort, page, limit],
    queryFn: () => fetchMothers({ status, lastAppOpen }, { page, limit, ...sort }),
  });
  const mothers = data?.data;
  const meta = data?.meta;

  function changeStatus(next: AdminApprovalStatusFilter) {
    setStatus(next);
    reset();
  }

  function changeLastAppOpen(next: LastAppOpenFilter) {
    setLastAppOpen(next);
    reset();
  }

  const columns: Column<AdminMother, MotherSortKey>[] = [
    idColumn((row) => row.id, 'id'),
    {
      key: 'mother',
      header: 'Mommy',
      sortKey: 'name',
      render: (mother) => <span className="nanny-name">{mother.name}</span>,
    },
    {
      key: 'phone',
      header: 'Phone number',
      nowrap: true,
      render: (mother) => mother.phone ?? EMPTY,
    },
    { key: 'email', header: 'Email', sortKey: 'email', render: (mother) => mother.email },
    {
      key: 'registered',
      header: 'Registered',
      sortKey: 'registered',
      sortFirst: 'desc',
      nowrap: true,
      render: (mother) => formatDate(mother.createdAt),
    },
    {
      key: 'lastAppOpen',
      header: 'Last app open',
      sortKey: 'lastAppOpenAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (mother) =>
        mother.lastAppOpenAt ? formatDate(mother.lastAppOpenAt) : <span className="table-empty">Never</span>,
    },
    {
      key: 'active',
      header: 'Status',
      sortKey: 'status',
      render: (mother) => (
        <Badge tone={mother.isActive ? 'success' : 'neutral'}>
          {mother.isActive ? 'Active' : 'Deactivated'}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <p className="panel-lead">
        Every parent who has signed up. Open a mommy to review the ID she uploaded before booking,
        and approve or reject it.
      </p>
      <div className="filter-bar">
        <FilterSelect
          label="ID status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => changeStatus(value as AdminApprovalStatusFilter)}
        />
        <FilterSelect
          label="Last app open"
          value={lastAppOpen}
          options={LAST_APP_OPEN_FILTERS}
          onChange={(value) => changeLastAppOpen(value as LastAppOpenFilter)}
        />
      </div>
      {isLoading && <TableSkeleton columns={7} />}
      {error != null && !mothers && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {mothers && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <Table
            wrap
            columns={columns}
            rows={mothers}
            rowKey={(mother) => mother.id}
            empty="No mommies match these filters."
            onRowClick={(mother) => navigate(`/users/mothers/${mother.id}`)}
            sort={sort}
            onSortChange={onSortChange}
          />
          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={setPage}
              limitOptions={ADMIN_PAGE_SIZES}
              onLimitChange={setLimit}
              label="mommies"
            />
          )}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 19: Run them to verify they pass**

Run: `pnpm --filter @nanny-app/admin test -- mother-picker-table mothers-tab users-page group-detail-page recipient-picker-modal`
Expected: PASS (the Users page tabs test still answers `/admin/mothers` with its empty page; picker users unaffected beyond the renamed header).

- [ ] **Step 20: Run the whole admin suite, typecheck and lint**

Run: `pnpm --filter @nanny-app/admin test && pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint`
Expected: PASS.

- [ ] **Step 21: Commit**

```bash
git add apps/admin
git commit -m "$(cat <<'EOF'
feat(admin): last login and last app open in the picker and Mommies tab

The picker's "Last active" becomes Last login, with a sortable Last app
open beside it. The Mommies tab gets a sortable Last app open column and
a filter: within 7/30 days, not in 30+/90+ days, or never.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---

### Task 13: Mobile — app-open ping, shared link opener, promo auto-apply

Load the `nanny-app-mobile-design` and `ui-ux-pro-max:ui-ux-pro-max` skills, and read "Rules from the UI sweep" in `apps/mobile/CLAUDE.md` before touching `BookingStep1Screen`.

**Files:**
- Create: `apps/mobile/src/hooks/useAppOpenPing.ts`, `apps/mobile/src/lib/openPromoLink.ts`
- Modify: `apps/mobile/app/_layout.tsx` (`ProfileLoader`), `apps/mobile/src/components/CampaignCarousel.tsx`, `apps/mobile/src/screens/parent/BookingStep1Screen.tsx`
- Test: `apps/mobile/src/hooks/__tests__/useAppOpenPing.test.tsx` (create), `apps/mobile/src/lib/__tests__/openPromoLink.test.ts` (create), `apps/mobile/src/screens/parent/__tests__/BookingStep1Screen.test.tsx` (extend), `apps/mobile/src/components/__tests__/CampaignCarousel.test.tsx` (extend). (Part A Task 1 Step 9 already added `imageUrl: null, link: null` to `NotificationsScreen.test.tsx`'s `makeNotification`, so mobile typecheck is green going in.)

**Interfaces:**
- Consumes: `NotificationLink` and the `imageUrl` / `link` fields on `NotificationResponse` (Task 1); `POST /me/app-open` → 204 with no body, from `meRouter` in `apps/backend/src/routes/me.routes.ts`, mounted at `/me` (Task 3). The app never unwraps it; any failure is dropped.
- Produces:
  - `useAppOpenPing(): void` in `src/hooks/useAppOpenPing.ts`, mounted in `ProfileLoader` (`app/_layout.tsx`). Also exports `APP_OPEN_PING_INTERVAL_MS = 5 * 60 * 1000`, `pingAppOpen(uid: string): void` and `resetAppOpenPing(): void` (tests).
  - `openPromoLink(router: Router, link: NotificationLink): void` in `src/lib/openPromoLink.ts` — `package` → `{ pathname: '/(parent)/packages/checkout', params: { packageId } }`; `promo_code` → `usePendingPromoStore.setPendingPromoCode(code)` then `/(parent)/book/booking-date-picker`. Also exports `campaignLink(campaign: Pick<PublicCampaign, 'targetType' | 'packageId' | 'promoCode'>): NotificationLink | null`.
  - `CampaignCarousel` taps go through `campaignLink` + `openPromoLink`.
  - `BookingStep1Screen`: a pending code fills the field and is validated once, as soon as the price breakdown exists.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/lib/__tests__/openPromoLink.test.ts`:

```ts
import { campaignLink, openPromoLink } from '@mobile/lib/openPromoLink';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';

function makeRouter() {
  return { push: jest.fn() };
}

beforeEach(() => usePendingPromoStore.getState().clear());

describe('openPromoLink', () => {
  it('opens package checkout for a package link', () => {
    const router = makeRouter();
    openPromoLink(router as never, { type: 'package', packageId: 7 });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(parent)/packages/checkout',
      params: { packageId: '7' },
    });
    expect(usePendingPromoStore.getState().pendingPromoCode).toBeNull();
  });

  it('hands a promo code to the booking flow and starts it', () => {
    const router = makeRouter();
    openPromoLink(router as never, { type: 'promo_code', code: 'SAVE20' });
    expect(usePendingPromoStore.getState().pendingPromoCode).toBe('SAVE20');
    expect(router.push).toHaveBeenCalledWith('/(parent)/book/booking-date-picker');
  });
});

describe('campaignLink', () => {
  it('maps a promo campaign to its code', () => {
    expect(campaignLink({ targetType: 'PROMO_CODE', packageId: null, promoCode: 'WELCOME20' })).toEqual({
      type: 'promo_code',
      code: 'WELCOME20',
    });
  });

  it('maps a package campaign to its package', () => {
    expect(campaignLink({ targetType: 'PACKAGE', packageId: 7, promoCode: null })).toEqual({
      type: 'package',
      packageId: 7,
    });
  });

  it('has no link when the target is missing', () => {
    expect(campaignLink({ targetType: 'PROMO_CODE', packageId: null, promoCode: null })).toBeNull();
    expect(campaignLink({ targetType: 'PACKAGE', packageId: null, promoCode: null })).toBeNull();
  });
});
```

`apps/mobile/src/hooks/__tests__/useAppOpenPing.test.tsx`:

```tsx
import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { api } from '@mobile/lib/api';
import {
  APP_OPEN_PING_INTERVAL_MS,
  resetAppOpenPing,
  useAppOpenPing,
} from '@mobile/hooks/useAppOpenPing';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

// The global jest.setup.js stubs `api` with resolving jest.fns; this file only
// counts the calls to the ping route.
const mockPost = api.post as jest.Mock;
const pings = () => mockPost.mock.calls.filter(([url]) => url === '/me/app-open').length;

const START = new Date('2026-10-20T10:00:00.000Z').getTime();
let emitAppState: ((state: string) => void) | undefined;
let appStateSpy: jest.SpyInstance;

function signIn(uid = 'mother-1') {
  useAuthStore.setState({ user: { uid } as never });
  useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
  mockPost.mockClear();
  resetAppOpenPing();
  useAuthStore.setState({ user: null });
  useUserProfileStore.setState({ profile: null });
  emitAppState = undefined;
  appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    emitAppState = handler as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => {
  appStateSpy.mockRestore();
  jest.useRealTimers();
});

describe('useAppOpenPing', () => {
  it('pings once on a cold start when she is signed in with a profile', () => {
    signIn();
    renderHook(() => useAppOpenPing());
    expect(pings()).toBe(1);
    expect(mockPost).toHaveBeenCalledWith('/me/app-open');
  });

  it('never pings for a guest', () => {
    renderHook(() => useAppOpenPing());
    act(() => emitAppState?.('active'));
    expect(pings()).toBe(0);
  });

  it('waits for the profile before the first ping', () => {
    useAuthStore.setState({ user: { uid: 'mother-1' } as never });
    renderHook(() => useAppOpenPing());
    expect(pings()).toBe(0);

    act(() => useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never }));
    expect(pings()).toBe(1);
  });

  it('pings on a return to the foreground only once five minutes have passed', () => {
    signIn();
    renderHook(() => useAppOpenPing());
    expect(pings()).toBe(1);

    act(() => {
      jest.setSystemTime(START + APP_OPEN_PING_INTERVAL_MS - 1000);
      emitAppState?.('active');
    });
    expect(pings()).toBe(1);

    act(() => {
      jest.setSystemTime(START + APP_OPEN_PING_INTERVAL_MS + 1000);
      emitAppState?.('background');
    });
    expect(pings()).toBe(1);

    act(() => emitAppState?.('active'));
    expect(pings()).toBe(2);
  });

  it('pings straight away for a different account', () => {
    signIn('mother-1');
    renderHook(() => useAppOpenPing());
    act(() => signIn('mother-2'));
    expect(pings()).toBe(2);
  });

  it('ignores a failed ping', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network Error'));
    signIn();
    renderHook(() => useAppOpenPing());
    // Let the rejected promise settle: an unhandled rejection fails the test.
    await act(async () => {
      await Promise.resolve();
    });
    expect(pings()).toBe(1);
  });
});
```

Append to `apps/mobile/src/components/__tests__/CampaignCarousel.test.tsx`, inside `describe('CampaignCarousel', …)`:

```tsx
  it('only counts the click when a promo banner has lost its code', () => {
    mockCampaigns = [{ ...WELCOME, promoCode: null }];
    const { getByLabelText } = render(<CampaignCarousel />);

    fireEvent.press(getByLabelText('Welcome offer. 20% off your first booking'));

    expect(mockClick).toHaveBeenCalledWith(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(usePendingPromoStore.getState().pendingPromoCode).toBeNull();
  });
```

(The existing "opens booking with the promo code…" and "opens package checkout…" cases stay as they are: they are the regression for moving the carousel onto `openPromoLink`.)

`apps/mobile/src/screens/parent/__tests__/BookingStep1Screen.test.tsx`:

1. Add `act` to the RNTL import and import the store:

```tsx
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
```

```tsx
import { api } from '@mobile/lib/api';
import BookingStep1Screen from '@mobile/screens/parent/BookingStep1Screen';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';
```

2. Let `renderScreen` skip the pricing seed and hand back its client. Replace the function with:

```tsx
function renderScreen({ pointsBalance = 200, packageHoursLeft = 0, seedPricing = true } = {}) {
  const queryClient = new QueryClient({
    // staleTime Infinity keeps the seeded cache from refetching, so nothing
    // hits the (globally mocked) API — the screen renders straight from these
    // fixtures, exactly like the preview harness.
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // Left out to test what happens before the price is known: the screen's own
  // fetch then fails against the global API stub, and a test seeds it later.
  if (seedPricing) queryClient.setQueryData(['pricing-config'], PRICING);
  queryClient.setQueryData(['rewards', 'config'], REWARD_CONFIG);
  queryClient.setQueryData(['rewards', 'wallet'], {
    userId: 1,
    pointsBalance,
    lifetimeEarned: pointsBalance,
    lifetimeRedeemed: 0,
  });
  queryClient.setQueryData(['package-hours'], {
    availableHours: packageHoursLeft,
    buckets: packageHoursLeft > 0 ? [packageBucket(packageHoursLeft)] : [],
  });
  queryClient.setQueryData(['packages', 'list'], []);
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <BookingStep1Screen />
      </QueryClientProvider>,
    ),
    queryClient,
  };
}
```

3. Append a new `describe` at the end of the file:

```tsx
describe('BookingStep1Screen — a code handed over by a campaign or announcement', () => {
  const VALIDATE = '/bookings/validate-promo';
  const validateCalls = () =>
    (api.post as jest.Mock).mock.calls.filter(([url]) => url === VALIDATE);

  /** The promo check answers with `envelope`; creating the booking succeeds as #9. */
  function answerValidate(envelope: { data: unknown; error: string | null }) {
    (api.post as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url === VALIDATE ? { data: envelope } : { data: { data: { id: 9 }, error: null } },
      ),
    );
  }

  beforeEach(() => usePendingPromoStore.getState().setPendingPromoCode('WELCOME20'));

  afterEach(() => {
    usePendingPromoStore.getState().clear();
    // Back to the global stub's default, so no implementation leaks into a later file.
    (api.post as jest.Mock).mockReset().mockResolvedValue({ data: { data: null, error: null } });
  });

  it('applies the code once the price is ready, exactly once', async () => {
    answerValidate({ data: { discountAmount: 20 }, error: null });
    const { getByText } = renderScreen();

    await waitFor(() => getByText(/WELCOME20.*EGP 20\.00 off/));
    // 2h × EGP 100 before any discount.
    expect(validateCalls()).toEqual([[VALIDATE, { code: 'WELCOME20', subtotal: 200 }]]);
    getByText('Request care · EGP 180.00');
    // A one-shot handoff: it never rides into a later booking.
    expect(usePendingPromoStore.getState().pendingPromoCode).toBeNull();
  });

  it('waits for the price breakdown before applying', async () => {
    answerValidate({ data: { discountAmount: 20 }, error: null });
    const { getByText, queryClient } = renderScreen({ seedPricing: false });

    await act(async () => {
      await Promise.resolve();
    });
    expect(validateCalls()).toHaveLength(0);

    act(() => {
      queryClient.setQueryData(['pricing-config'], PRICING);
    });
    await waitFor(() => getByText(/WELCOME20.*EGP 20\.00 off/));
    expect(validateCalls()).toHaveLength(1);
  });

  it('an invalid pending code shows the error and booking still proceeds', async () => {
    answerValidate({ data: null, error: 'This promo code has expired.' });
    const { getByText, getByTestId } = renderScreen();

    await waitFor(() => getByText('This promo code has expired.'));
    // The code stays where she can see what was refused.
    expect(getByTestId('booking.promoInput').props.value).toBe('WELCOME20');
    // Nothing was taken off, and nothing blocks the request.
    fireEvent.press(getByText('Request care · EGP 200.00'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/bookings', expect.any(Object)),
    );
    const body = (api.post as jest.Mock).mock.calls.find(([url]) => url === '/bookings')![1];
    expect(body).not.toHaveProperty('promoCode');
    expect(validateCalls()).toHaveLength(1);
  });

  it('lets her remove a refused code, which clears the error', async () => {
    answerValidate({ data: null, error: 'This promo code has expired.' });
    const { getByText, getByTestId, queryByText } = renderScreen();

    await waitFor(() => getByText('This promo code has expired.'));
    fireEvent.changeText(getByTestId('booking.promoInput'), '');

    expect(getByTestId('booking.promoInput').props.value).toBe('');
    expect(queryByText('This promo code has expired.')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/mobile test -- openPromoLink useAppOpenPing CampaignCarousel BookingStep1Screen`
Expected: FAIL — `Cannot find module '@mobile/lib/openPromoLink'` and `'@mobile/hooks/useAppOpenPing'`; the new `BookingStep1Screen` cases time out waiting for the applied chip (only prefill exists) and the "clears the error" case still finds the error text; the new carousel case passes already (that is fine — it pins today's behaviour across the refactor).

- [ ] **Step 3: Implement `src/lib/openPromoLink.ts`**

```ts
import type { Router } from 'expo-router';
import type { NotificationLink, PublicCampaign } from '@nanny-app/shared';

import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';

/**
 * Where a package or promo-code link takes her. One place for every way in —
 * a campaign banner, an announcement push and an inbox card — so the three can
 * never disagree about the route or about how a code reaches the booking flow.
 *
 * A promo code is handed over through `pendingPromoStore`: the booking flow
 * starts at the date picker, and BookingStep1Screen (two screens later) reads
 * the code once on mount and applies it as soon as the price is known.
 */
export function openPromoLink(router: Router, link: NotificationLink): void {
  if (link.type === 'package') {
    router.push({
      pathname: '/(parent)/packages/checkout',
      params: { packageId: String(link.packageId) },
    } as never);
    return;
  }
  usePendingPromoStore.getState().setPendingPromoCode(link.code);
  router.push('/(parent)/book/booking-date-picker' as never);
}

/** A campaign's target as a link, or null when its package or code is missing. */
export function campaignLink(
  campaign: Pick<PublicCampaign, 'targetType' | 'packageId' | 'promoCode'>,
): NotificationLink | null {
  if (campaign.targetType === 'PACKAGE' && campaign.packageId != null) {
    return { type: 'package', packageId: campaign.packageId };
  }
  if (campaign.targetType === 'PROMO_CODE' && campaign.promoCode) {
    return { type: 'promo_code', code: campaign.promoCode };
  }
  return null;
}
```

- [ ] **Step 4: Move `CampaignCarousel` onto it**

In `src/components/CampaignCarousel.tsx`:

Replace the import

```tsx
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';
```

with

```tsx
import { campaignLink, openPromoLink } from '@mobile/lib/openPromoLink';
```

Delete the line

```tsx
  const setPendingPromoCode = usePendingPromoStore((s) => s.setPendingPromoCode);
```

and replace `handlePress` with:

```tsx
  const handlePress = useCallback(
    (campaign: PublicCampaign) => {
      trackClick.mutate(campaign.id);
      const link = campaignLink(campaign);
      if (link) openPromoLink(router, link);
    },
    [router, trackClick],
  );
```

- [ ] **Step 5: Implement `src/hooks/useAppOpenPing.ts`**

```ts
import { useEffect } from 'react';

import { api } from '@mobile/lib/api';
import { subscribeAppActive } from '@mobile/lib/queryClient';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/** At most one ping per account per five minutes; the server throttles to 60 s on top. */
export const APP_OPEN_PING_INTERVAL_MS = 5 * 60 * 1000;

// In memory on purpose: a new process is a new app open, so a cold start always
// pings. Keyed by account, so switching accounts pings for the new one at once.
let lastPing: { uid: string; at: number } | null = null;

/**
 * Tells the backend she opened the app (`users.last_app_open_at`, which dynamic
 * groups such as "not opened in 30 days" read). Best effort: a failure is
 * dropped — it must never surface, retry or block anything.
 */
export function pingAppOpen(uid: string): void {
  const now = Date.now();
  if (lastPing && lastPing.uid === uid && now - lastPing.at < APP_OPEN_PING_INTERVAL_MS) return;
  lastPing = { uid, at: now };
  void api.post('/me/app-open').catch(() => undefined);
}

/** Forgets the last ping. For tests. */
export function resetAppOpenPing(): void {
  lastPing = null;
}

/**
 * Pings on a cold start and on every return to the foreground, once she is
 * signed in and her profile has loaded (so the backend has a row to stamp).
 * Guests have no Firebase user and never ping. Mounted once, in ProfileLoader.
 */
export function useAppOpenPing(): void {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const hasProfile = useUserProfileStore((s) => s.profile !== null);

  useEffect(() => {
    if (!uid || !hasProfile) return undefined;
    pingAppOpen(uid);
    return subscribeAppActive((isActive) => {
      if (isActive) pingAppOpen(uid);
    });
  }, [uid, hasProfile]);
}
```

Mount it — in `app/_layout.tsx` add the import beside `usePushNotifications`:

```tsx
import { useAppOpenPing } from '@mobile/hooks/useAppOpenPing';
```

and make `ProfileLoader`:

```tsx
function ProfileLoader() {
  useMe();
  usePushNotifications();
  useAppOpenPing();
  return null;
}
```

Update its doc comment's first sentence to: "Side-effect-only component that fetches the application user profile from the backend whenever a Firebase user is signed in, and records app opens (`useAppOpenPing`)."

- [ ] **Step 6: Auto-apply in `BookingStep1Screen.tsx`**

1. `useRef` in the React import:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
```

2. Replace the one-shot prefill block (the comment "A campaign tap can hand a code…" and its `useEffect`) with:

```tsx
  // A campaign banner or an announcement can hand a code to the booking flow.
  // Read it once on mount and clear it so it never rides along into a later,
  // unrelated booking; it is applied below once the price it discounts exists.
  const [autoApplyCode, setAutoApplyCode] = useState<string | null>(null);
  const autoApplied = useRef(false);
  useEffect(() => {
    if (pendingPromoCode) {
      setPromoCode(pendingPromoCode);
      setAutoApplyCode(pendingPromoCode);
      clearPendingPromo();
    }
    // Run once on mount; the store is a one-shot handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

3. Replace `handleApplyPromo` and `handleRemovePromo` with:

```tsx
  const applyPromoCode = (code: string) => {
    validatePromo.mutate(
      { code, subtotal: breakdown?.subtotal ?? baseCost },
      { onSuccess: (res) => setAppliedPromo({ code, discountAmount: res.discountAmount }) },
    );
  };

  const handleApplyPromo = () => {
    const code = promoCode.trim();
    if (code.length === 0) return;
    applyPromoCode(code);
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCode('');
    validatePromo.reset();
  };

  // Editing a refused code is her answer to the error, so the error goes.
  const handlePromoCodeChange = (text: string) => {
    setPromoCode(text);
    if (validatePromo.isError) validatePromo.reset();
  };

  // The handed-over code is validated exactly once, as soon as the breakdown
  // (the subtotal it is checked against) exists. Success shows the usual applied
  // chip; a refusal shows the usual inline error with the code left in the
  // field — she can edit or clear it, and the request goes ahead without it.
  // The ref, not the state, is the once-guard: it also holds under StrictMode's
  // double-run effects.
  const breakdownReady = breakdown !== null;
  useEffect(() => {
    if (!autoApplyCode || !breakdownReady || autoApplied.current) return;
    autoApplied.current = true;
    applyPromoCode(autoApplyCode.trim());
    // applyPromoCode is recreated every render; the guard makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApplyCode, breakdownReady]);
```

4. On the promo `TextInput`, replace `onChangeText={setPromoCode}` with `onChangeText={handlePromoCodeChange}`.

Nothing else in the promo section changes: the applied chip (with its remove ×), the input + Apply button, and the error line `validatePromo.isError && !appliedPromo` are exactly what a typed code shows. `handleProceed` already sends `promoCode` only when `appliedPromo` is set, so a refused code never blocks or rides along. `HomeScreen`'s focus-clear guard is untouched.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @nanny-app/mobile test -- openPromoLink useAppOpenPing CampaignCarousel BookingStep1Screen`
Expected: PASS, including "an invalid pending code shows the error and booking still proceeds".

- [ ] **Step 8: Full mobile suite, typecheck, lint**

Run: `pnpm --filter @nanny-app/mobile test && pnpm --filter @nanny-app/mobile typecheck && pnpm --filter @nanny-app/mobile lint`
Expected: PASS — `layout-guards.test.ts` included (no raw `Text`, no sage `colors.primary`).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/hooks/useAppOpenPing.ts apps/mobile/src/lib/openPromoLink.ts \
  apps/mobile/app/_layout.tsx apps/mobile/src/components/CampaignCarousel.tsx \
  apps/mobile/src/screens/parent/BookingStep1Screen.tsx \
  apps/mobile/src/hooks/__tests__/useAppOpenPing.test.tsx apps/mobile/src/lib/__tests__/openPromoLink.test.ts \
  apps/mobile/src/components/__tests__/CampaignCarousel.test.tsx \
  apps/mobile/src/screens/parent/__tests__/BookingStep1Screen.test.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): app-open ping, one promo/package link opener, promo auto-apply

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---

### Task 14: Mobile — push tap and inbox announcement card

> Note: on a cold start from an announcement push, `openWhenRoleKnown` fires on the profile store update, while the root `Redirect` to Home renders on the next frame. `HomeScreen` clears `pendingPromoStore` whenever it gains focus. If Home ever gains focus after the date picker has been pushed, the code is dropped before Step 1 reads it. The survey and booking-chat pushes already rely on this ordering, and the spec keeps the store handoff and Home's guard, so this task does not change them. Two cheap fixes were considered and rejected:
> - Timestamp the code and let Home clear only codes set before it last lost focus. This can't tell the race apart from a lost navigation that leaves Home on screen, and in that case the code would apply to her next, unrelated "Book care".
> - Set the code after the push. This changes nothing, because the focus effect runs later either way.
>
> Task 15 Step 9 checks this on a device. If it reproduces, Step 9 has a robust fix: carry the code as a route param.

Load the `nanny-app-mobile-design` and `ui-ux-pro-max:ui-ux-pro-max` skills, and read "Rules from the UI sweep" in `apps/mobile/CLAUDE.md` before writing the card.

**Files:**
- Create: `apps/mobile/src/components/AnnouncementCard.tsx`, `apps/mobile/src/components/styles/announcement-card.styles.ts`
- Modify: `apps/mobile/src/lib/notificationNavigation.ts`, `apps/mobile/src/lib/parentNav.ts`, `apps/mobile/src/hooks/usePushNotifications.ts`, `apps/mobile/src/screens/parent/NotificationsScreen.tsx`
- Test: `apps/mobile/src/components/__tests__/AnnouncementCard.test.tsx` (create), `apps/mobile/src/lib/__tests__/notificationNavigation.announcement.test.ts` (create), `apps/mobile/src/hooks/__tests__/usePushNotifications.announcement.test.ts` (create), `apps/mobile/src/screens/parent/__tests__/NotificationsScreen.test.tsx` (extend)

**Interfaces:**
- Consumes: `NotificationLink`, `NotificationResponse.imageUrl` / `.link`, `'announcement'` type, `NOTIFICATION_IMAGE_WIDTH` / `NOTIFICATION_IMAGE_HEIGHT` (Task 1); push `data: { type: 'ANNOUNCEMENT', broadcastId, targetType?, packageId?, promoCode? }` (Task 7); inbox `imageUrl` + `link` (Task 8); `openPromoLink` (Task 13).
- Produces:
  - `AnnouncementCard` — default export, `memo`ised, props `{ notification: NotificationResponse; onPress(): void }`; also exports `announcementAction(link: NotificationLink | null): string | null`.
  - `notificationNavigation.ts`: `isAnnouncementPush(data?: Record<string, string>): boolean`, `announcementLinkFromPush(data?: Record<string, string>): NotificationLink | null`.
  - `usePushNotifications.ts`: `ANNOUNCEMENT` branch in `navigateFromNotification`, which is now exported (for its test).
  - `parentNav.ts`: `ParentTabHref` gains `'/(parent)/(tabs)/notifications'`.
  - `NotificationsScreen` renders `AnnouncementCard` for `type === 'announcement'`; tap → mark read → `openPromoLink`; no link → mark read only.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/lib/__tests__/notificationNavigation.announcement.test.ts`:

```ts
import { announcementLinkFromPush, isAnnouncementPush } from '@mobile/lib/notificationNavigation';

describe('announcement push', () => {
  it('recognises the announcement type', () => {
    expect(isAnnouncementPush({ type: 'ANNOUNCEMENT', broadcastId: '3' })).toBe(true);
    expect(isAnnouncementPush({ type: 'SURVEY', surveyId: '3' })).toBe(false);
    expect(isAnnouncementPush(undefined)).toBe(false);
  });

  it('reads a promo-code link', () => {
    expect(
      announcementLinkFromPush({ type: 'ANNOUNCEMENT', targetType: 'PROMO_CODE', promoCode: 'SAVE20' }),
    ).toEqual({ type: 'promo_code', code: 'SAVE20' });
  });

  it('reads a package link', () => {
    expect(
      announcementLinkFromPush({ type: 'ANNOUNCEMENT', targetType: 'PACKAGE', packageId: '7' }),
    ).toEqual({ type: 'package', packageId: 7 });
  });

  it('has no link when there is none, or when it is malformed', () => {
    expect(announcementLinkFromPush({ type: 'ANNOUNCEMENT', broadcastId: '3' })).toBeNull();
    expect(announcementLinkFromPush({ type: 'ANNOUNCEMENT', targetType: 'PACKAGE', packageId: 'x' })).toBeNull();
    expect(announcementLinkFromPush({ type: 'ANNOUNCEMENT', targetType: 'PROMO_CODE', promoCode: ' ' })).toBeNull();
  });
});
```

`apps/mobile/src/hooks/__tests__/usePushNotifications.announcement.test.ts`:

```ts
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const mockOpenPromoLink = jest.fn();
jest.mock('@mobile/lib/openPromoLink', () => ({
  openPromoLink: (...args: unknown[]) => mockOpenPromoLink(...args),
}));

import { navigateFromNotification } from '@mobile/hooks/usePushNotifications';

const ON_HOME = ['(parent)', '(tabs)', 'home'];
const queryClient = { invalidateQueries: jest.fn() };

function makeRouter() {
  return { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: null });
});

describe('announcement push tap', () => {
  it('opens the booking flow with the code from a promo announcement', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, ON_HOME, queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
      targetType: 'PROMO_CODE',
      promoCode: 'SAVE20',
    });
    expect(mockOpenPromoLink).toHaveBeenCalledWith(router, { type: 'promo_code', code: 'SAVE20' });
  });

  it('opens the package from a package announcement', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, ON_HOME, queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
      targetType: 'PACKAGE',
      packageId: '7',
    });
    expect(mockOpenPromoLink).toHaveBeenCalledWith(router, { type: 'package', packageId: 7 });
  });

  it('opens the notifications tab when the announcement has no link', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, ON_HOME, queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
    });
    expect(mockOpenPromoLink).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/(parent)/(tabs)/notifications');
  });

  it('waits for her profile on a cold start, then opens the link', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, [], queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
      targetType: 'PROMO_CODE',
      promoCode: 'SAVE20',
    });
    expect(mockOpenPromoLink).not.toHaveBeenCalled();

    useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never });
    expect(mockOpenPromoLink).toHaveBeenCalledWith(router, { type: 'promo_code', code: 'SAVE20' });
  });

  it('does nothing in the nanny app', () => {
    const router = makeRouter();
    navigateFromNotification(router as never, ['(nanny)', '(tabs)', 'dashboard'], queryClient as never, {
      type: 'ANNOUNCEMENT',
      broadcastId: '3',
      targetType: 'PROMO_CODE',
      promoCode: 'SAVE20',
    });
    expect(mockOpenPromoLink).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
```

`apps/mobile/src/components/__tests__/AnnouncementCard.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NotificationResponse } from '@nanny-app/shared';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import AnnouncementCard from '@mobile/components/AnnouncementCard';

function announcement(overrides: Partial<NotificationResponse> = {}): NotificationResponse {
  return {
    id: 7,
    type: 'announcement',
    title: 'Spring offer',
    body: 'Book any day this week and we take 20% off. The code is applied for you.',
    isRead: false,
    referenceId: null,
    referenceType: null,
    createdAt: new Date().toISOString(),
    imageUrl: 'https://cdn.example.com/spring.jpg',
    link: { type: 'promo_code', code: 'SAVE20' },
    ...overrides,
  };
}

describe('AnnouncementCard', () => {
  it('is one button labelled with the title and what tapping does', () => {
    render(<AnnouncementCard notification={announcement()} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Spring offer. Book with code SAVE20' })).toBeTruthy();
    // The code stays on the line with "code" at any font scale.
    expect(screen.getByText('Book with code SAVE20')).toBeTruthy();
  });

  it('says "View package" for a package link', () => {
    render(
      <AnnouncementCard
        notification={announcement({ link: { type: 'package', packageId: 3 } })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Spring offer. View package' })).toBeTruthy();
  });

  it('has no action line and a title-only label without a link', () => {
    render(<AnnouncementCard notification={announcement({ link: null })} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Spring offer' })).toBeTruthy();
    expect(screen.queryByText(/Book with code|View package/)).toBeNull();
  });

  it('shows the whole body, never truncated', () => {
    render(<AnnouncementCard notification={announcement()} onPress={jest.fn()} />);
    const body = screen.getByText(/Book any day this week/);
    expect(body.props.numberOfLines).toBeUndefined();
  });

  it('draws the image in a fixed 2:1 box hidden from screen readers', () => {
    render(<AnnouncementCard notification={announcement()} onPress={jest.fn()} />);
    expect(screen.queryByTestId('announcement.image')).toBeNull();
    const box = screen.getByTestId('announcement.image', { includeHiddenElements: true });
    expect(box).toHaveStyle({ aspectRatio: 2 });
  });

  it('leaves the image box out when there is no image', () => {
    render(<AnnouncementCard notification={announcement({ imageUrl: null })} onPress={jest.fn()} />);
    expect(screen.queryByTestId('announcement.image', { includeHiddenElements: true })).toBeNull();
  });

  it('right-aligns an Arabic body', () => {
    const arabic = 'أضفنا مربيات جديدات في منطقتك هذا الأسبوع.';
    render(<AnnouncementCard notification={announcement({ body: arabic })} onPress={jest.fn()} />);
    expect(screen.getByText(arabic)).toHaveStyle({ textAlign: 'right', writingDirection: 'rtl' });
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<AnnouncementCard notification={announcement()} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is memoised', () => {
    expect((AnnouncementCard as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
```

Extend `apps/mobile/src/screens/parent/__tests__/NotificationsScreen.test.tsx`. After Part A Task 1, its `makeNotification` already returns `imageUrl: null, link: null`, so the overrides below only set what differs:

1. Under the existing `mockNavigateToBookingDetail` mock, add:

```tsx
const mockOpenPromoLink = jest.fn();
jest.mock('@mobile/lib/openPromoLink', () => ({
  openPromoLink: (...args: unknown[]) => mockOpenPromoLink(...args),
}));

const mockMarkRead = jest.fn();
```

2. In the `@mobile/hooks/useNotifications` mock, replace the `useMarkNotificationRead` line with:

```tsx
  useMarkNotificationRead: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    mutate: mockMarkRead,
  }),
```

3. Append:

```tsx
describe('NotificationsScreen announcements', () => {
  function announcement(overrides: Partial<NotificationResponse> = {}) {
    return makeNotification({
      id: 7,
      type: 'announcement',
      title: 'Spring offer',
      body: '20% off this week',
      isRead: false,
      referenceId: null,
      referenceType: null,
      link: { type: 'promo_code', code: 'SAVE20' },
      ...overrides,
    });
  }

  it('marks it read, then opens its link', () => {
    mockNotifications = [announcement()];
    const { getByRole } = render(<NotificationsScreen />);

    fireEvent.press(getByRole('button', { name: 'Spring offer. Book with code SAVE20' }));

    expect(mockMarkRead).toHaveBeenCalledWith(7);
    expect(mockOpenPromoLink).toHaveBeenCalledWith(expect.anything(), {
      type: 'promo_code',
      code: 'SAVE20',
    });
    expect(mockMarkRead.mock.invocationCallOrder[0]).toBeLessThan(
      mockOpenPromoLink.mock.invocationCallOrder[0],
    );
  });

  it('only marks a link-less announcement read', () => {
    mockNotifications = [announcement({ link: null })];
    const { getByRole } = render(<NotificationsScreen />);

    fireEvent.press(getByRole('button', { name: 'Spring offer' }));

    expect(mockMarkRead).toHaveBeenCalledWith(7);
    expect(mockOpenPromoLink).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not mark an already-read announcement again', () => {
    mockNotifications = [announcement({ isRead: true })];
    const { getByRole } = render(<NotificationsScreen />);

    fireEvent.press(getByRole('button', { name: 'Spring offer. Book with code SAVE20' }));

    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockOpenPromoLink).toHaveBeenCalled();
  });

  it('keeps ordinary notifications as rows', () => {
    mockNotifications = [announcement(), makeNotification({ id: 2 })];
    const { getByText, getByTestId } = render(<NotificationsScreen />);

    expect(getByTestId('announcement.7')).toBeTruthy();
    expect(getByText('Booking confirmed')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @nanny-app/mobile test -- notificationNavigation.announcement usePushNotifications.announcement AnnouncementCard NotificationsScreen`
Expected: FAIL — `isAnnouncementPush` / `announcementLinkFromPush` / `navigateFromNotification` are not exported, `Cannot find module '@mobile/components/AnnouncementCard'`, and the announcement rows render as `NotificationRow` (no button named "Spring offer. Book with code SAVE20").

- [ ] **Step 3: Push helpers in `src/lib/notificationNavigation.ts`**

Add the type import at the top:

```ts
import type { NotificationLink } from '@nanny-app/shared';
```

and append:

```ts
/** A push from an admin announcement (`data.type` is the backend enum name). */
export function isAnnouncementPush(data?: Record<string, string>): boolean {
  return data?.['type'] === 'ANNOUNCEMENT';
}

/**
 * The package or promo-code link an announcement push carries, or null when it
 * has none. FCM data values are strings, so a package id that is not a positive
 * integer, or a blank code, counts as no link rather than as a broken route.
 */
export function announcementLinkFromPush(data?: Record<string, string>): NotificationLink | null {
  if (data?.['targetType'] === 'PACKAGE') {
    const packageId = Number(data['packageId']);
    return Number.isInteger(packageId) && packageId > 0 ? { type: 'package', packageId } : null;
  }
  if (data?.['targetType'] === 'PROMO_CODE') {
    const code = data['promoCode']?.trim();
    return code ? { type: 'promo_code', code } : null;
  }
  return null;
}
```

- [ ] **Step 4: Let `goToParentTab` reach the notifications tab**

In `src/lib/parentNav.ts`, extend the union:

```ts
export type ParentTabHref =
  | '/(parent)/(tabs)/home'
  | '/(parent)/(tabs)/services'
  | '/(parent)/(tabs)/bookings'
  | '/(parent)/(tabs)/mother-profile'
  | '/(parent)/(tabs)/notifications';
```

- [ ] **Step 5: The `ANNOUNCEMENT` branch in `usePushNotifications.ts`**

Extend the `@mobile/lib/notificationNavigation` import with `announcementLinkFromPush` and `isAnnouncementPush`, and add:

```ts
import { openPromoLink } from '@mobile/lib/openPromoLink';
```

Change `function navigateFromNotification(` to `export function navigateFromNotification(` and add a one-line comment above it: `/** Where a tapped push opens. Exported for its tests. */`.

Insert right after the `isSurveyPush` block:

```ts
  // An admin announcement: its package or promo-code link opens exactly as the
  // inbox card and the Home banners do; without a link the inbox is where she
  // reads it. Mothers only — the backend never sends one to a nanny, and a
  // stale token on a shared device must not open the parent flow there.
  if (isAnnouncementPush(data)) {
    const link = announcementLinkFromPush(data);
    openWhenRoleKnown(segments, (role) => {
      if (role !== 'parent') return;
      if (link) openPromoLink(router, link);
      else goToParentTab(router, segments, '/(parent)/(tabs)/notifications');
    });
    return;
  }
```

The foreground `onMessage` handler needs no change: an `ANNOUNCEMENT` push falls through to its default branch, which already invalidates `['notifications']`.

- [ ] **Step 6: `AnnouncementCard` and its styles**

`apps/mobile/src/components/styles/announcement-card.styles.ts`:

```ts
import { StyleSheet } from 'react-native';

import { borderRadius, colors, shadows, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  // The shadow sits on a wrapper: the card itself clips (so the Android ripple
  // and the image keep the rounded corners), and a clipping view loses its own
  // iOS shadow.
  shadow: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  card: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  // Same unread marker as NotificationRow, so the two kinds read as one list.
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryDark,
  },
  // iOS has no ripple; a dim is its standard press feedback. Opacity only, so
  // the card never moves or resizes under her finger.
  cardPressedIos: {
    opacity: 0.7,
  },
  // Its aspectRatio comes from the upload size, set in AnnouncementCard. The
  // background is the placeholder until (or if never) the image paints.
  imageBox: {
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.xs,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  // Wraps, so a long title or a big font drops the time onto its own line
  // instead of cutting the title short (UI-sweep rule).
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: spacing.sm,
    rowGap: spacing.xxs,
  },
  title: {
    ...typeScale.headingSm,
    letterSpacing: 0,
    color: colors.textDark,
    flexShrink: 1,
  },
  time: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  actionText: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
    flexShrink: 1,
  },
});
```

`apps/mobile/src/components/AnnouncementCard.tsx`:

```tsx
import React, { memo } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  NOTIFICATION_IMAGE_HEIGHT,
  NOTIFICATION_IMAGE_WIDTH,
  type NotificationLink,
  type NotificationResponse,
} from '@nanny-app/shared';

import { Text } from '@mobile/components/ui/text';
import { formatTimeAgo } from '@mobile/lib/communityUtils';
import { textDirectionStyle } from '@mobile/lib/textDirection';
import { colors } from '@mobile/theme';
import { styles } from './styles/announcement-card.styles';

// Drawn at the size admins crop to (1024×512), so the box never jumps when the
// image arrives and the artwork is never re-cropped.
const IMAGE_RATIO = { aspectRatio: NOTIFICATION_IMAGE_WIDTH / NOTIFICATION_IMAGE_HEIGHT };

/** What a tap does, in words — shown under the body and read as part of the label. */
export function announcementAction(link: NotificationLink | null): string | null {
  if (!link) return null;
  return link.type === 'package' ? 'View package' : `Book with code ${link.code}`;
}

type Props = {
  notification: NotificationResponse;
  onPress: () => void;
};

/**
 * An admin announcement in the inbox: title, the whole body, an optional image
 * and what tapping does. The whole card is one button — its label is the title
 * plus the action, the body is its hint, and the image is decorative (hidden
 * from screen readers). Android shows a ripple, iOS dims.
 */
function AnnouncementCard({ notification, onPress }: Props) {
  const action = announcementAction(notification.link);
  // Keeps the code (or "package") on the line with the word before it.
  const actionDisplay = action?.replace(/ (?=\S+$)/, ' ') ?? null;
  const isUnread = !notification.isRead;

  return (
    <View style={styles.shadow}>
      <Pressable
        testID={`announcement.${notification.id}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action ? `${notification.title}. ${action}` : notification.title}
        accessibilityHint={notification.body}
        android_ripple={{ color: colors.overlayLight }}
        style={({ pressed }) => [
          styles.card,
          isUnread && styles.cardUnread,
          Platform.OS === 'ios' && pressed && styles.cardPressedIos,
        ]}
      >
        {notification.imageUrl ? (
          <View
            testID="announcement.image"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.imageBox, IMAGE_RATIO]}
          >
            <Image
              source={{ uri: notification.imageUrl }}
              style={styles.image}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : null}

        <View style={styles.titleRow}>
          <Text style={[styles.title, textDirectionStyle(notification.title)]}>
            {notification.title}
          </Text>
          <Text style={styles.time}>{formatTimeAgo(notification.createdAt)}</Text>
        </View>

        <Text style={[styles.body, textDirectionStyle(notification.body)]}>{notification.body}</Text>

        {actionDisplay ? (
          <View style={styles.actionRow}>
            <Text style={styles.actionText}>{actionDisplay}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryDark} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * Memoised on the notification alone. The inbox refetches every 15 s and React
 * Query keeps unchanged rows as the same objects, so an unchanged card skips the
 * re-render. `onPress` is left out of the comparison on purpose: the screen
 * builds it inline from this same notification and stable hooks (router,
 * `mutate`), so a fresh closure does exactly what the old one did.
 */
export default memo(AnnouncementCard, (prev, next) => prev.notification === next.notification);
```

- [ ] **Step 7: Render it in `NotificationsScreen.tsx`**

Imports:

```tsx
import AnnouncementCard from '@mobile/components/AnnouncementCard';
import { openPromoLink } from '@mobile/lib/openPromoLink';
```

Add after `handleNotificationPress`:

```tsx
  // An announcement: mark it read, then open its package or promo link. The
  // read is fired, not awaited — her tap should open the offer at once, and a
  // failed read only leaves the dot on. No link: marking it read is all a tap does.
  const handleAnnouncementPress = (notification: NotificationResponse) => {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.link) openPromoLink(router, notification.link);
  };
```

Replace the row map inside `cardGroup` with:

```tsx
                  {section.items.map((notification) =>
                    notification.type === 'announcement' ? (
                      <AnnouncementCard
                        key={notification.id}
                        notification={notification}
                        onPress={() => handleAnnouncementPress(notification)}
                      />
                    ) : (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        onPress={() => handleNotificationPress(notification)}
                      />
                    ),
                  )}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @nanny-app/mobile test -- notificationNavigation usePushNotifications AnnouncementCard NotificationsScreen`
Expected: PASS, including the existing `notificationNavigation.survey`, `usePushNotifications.routing` and `usePushNotifications.permission` suites.

- [ ] **Step 9: Full mobile suite, typecheck, lint**

Run: `pnpm --filter @nanny-app/mobile test && pnpm --filter @nanny-app/mobile typecheck && pnpm --filter @nanny-app/mobile lint`
Expected: PASS (`layout-guards.test.ts` included: `Text` comes from `@mobile/components/ui/text`, the only `Platform.OS` is the press-feedback check, no sage `colors.primary`).

- [ ] **Step 10: Pre-delivery check against ui-ux-pro-max**

Go through the ui-ux-pro-max pre-delivery checklist (`references/pro-rules.md`) for the card before you commit:
- the press feedback (ripple or opacity) doesn't move the layout;
- the whole card is the tap target, well over 44 dp;
- the label says what the card is and what tapping does;
- the image is hidden from screen readers and is not the only place the information appears;
- the body uses `textSecondary` and the action uses `primaryDark`, both 4.5:1 or better on white;
- titles and bodies wrap and are never truncated.

Task 15's sweep checks how it looks on small and large phones and at font scale 1.3.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/components/AnnouncementCard.tsx apps/mobile/src/components/styles/announcement-card.styles.ts \
  apps/mobile/src/lib/notificationNavigation.ts apps/mobile/src/lib/parentNav.ts \
  apps/mobile/src/hooks/usePushNotifications.ts apps/mobile/src/screens/parent/NotificationsScreen.tsx \
  apps/mobile/src/components/__tests__/AnnouncementCard.test.tsx \
  apps/mobile/src/lib/__tests__/notificationNavigation.announcement.test.ts \
  apps/mobile/src/hooks/__tests__/usePushNotifications.announcement.test.ts \
  apps/mobile/src/screens/parent/__tests__/NotificationsScreen.test.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): announcement card in the inbox; announcement push taps open their link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

---

### Task 15: UI sweep, device E2E, docs

> Note: the skeleton asks to "re-run the campaign flow", but the mobile E2E suite has no campaign flow (`grep -ril campaign apps/mobile/e2e` finds none). C20 therefore covers both taps. It runs the announcement inbox tap → Step 1 with the code applied, then a Home campaign banner → Step 1 with the code applied. The `CampaignCarousel` unit tests from Task 13 are the component-level regression.

> Note: the lab can't load the images. The flows use `https://storage.example.test/…` image URLs, like the community listings, and the emulator can't resolve that host. So the sweep's "with image" cards show the 2:1 placeholder box rather than artwork. That is the same box and the same layout the loaded image uses.

Load the `ui-sweep` and `mobile-e2e-lab` skills, then the `nanny-app-mobile-design` and `ui-ux-pro-max:ui-ux-pro-max` skills for any fixes the sweep turns up.

**Files:**
- Create: `apps/mobile/e2e/flows/_book-from-date-picker.yaml`, `apps/mobile/e2e/flows/c20-announcement-promo.yaml`, `apps/mobile/e2e/flows/sweep/s20-announcements.yaml`
- Modify: `apps/mobile/e2e/flows/_book-to-review.yaml`, `apps/mobile/e2e/scripts/advance.js`, `apps/backend/test/e2e/seed-mobile.ts`, `apps/mobile/e2e/README.md`, `Docs/testing/e2e-flows.md`, `apps/mobile/CLAUDE.md`, `apps/backend/CLAUDE.md`, `.claude/CLAUDE.md`, `Docs/notifications-implemented.md`
- Possibly modify: `apps/mobile/src/components/AnnouncementCard.tsx`, `apps/mobile/src/components/styles/announcement-card.styles.ts`, `apps/mobile/src/screens/parent/BookingStep1Screen.tsx` (sweep fixes)

**Interfaces:**
- Consumes: everything above. Admin API `POST /admin/notification-templates` (201, the template DTO; body exactly `NotificationTemplateInput`) and `POST /admin/notification-templates/:id/publish` (201, the `NotificationBroadcast`; an IN_APP-only send with every row written is `SENT`) (Tasks 6–7). `advance.js`'s `call()` accepts any 2xx and unwraps `data`; `GET /admin/promo-codes`, `GET /admin/packages`, `GET/POST/DELETE /admin/campaigns` (existing).
- Produces: `advance.js` steps `announcement-seed` (→ `output.broadcastStatus`), `announcement-sweep-seed`, `campaign-seed`, `campaign-clear`; subflow `_book-from-date-picker.yaml`; flow C20; sweep flow s20; seeder resets for `ANNOUNCEMENT` notifications, `E2E…` campaigns and `E2E…` templates.

- [ ] **Step 1: Everything green before touching the lab**

The root suites take longer than two minutes, so run them in tmux:

```bash
mkdir -p ~/logs; tmux kill-session -t nanny-verify 2>/dev/null; \
tmux new -d -s nanny-verify "cd /home/mark/projects/nanny-app && pnpm typecheck && pnpm lint && pnpm test:unit 2>&1 | tee ~/logs/nanny-verify.log"
```

Tell the user the session (`nanny-verify`) and log (`~/logs/nanny-verify.log`). Watch with `tail -f ~/logs/nanny-verify.log`.
Expected: every package passes. Fix anything red before going on.

- [ ] **Step 2: Split the booking subflow at the date picker**

A promo link opens the booking flow at the date picker, not at Home's "Book care". Create `apps/mobile/e2e/flows/_book-from-date-picker.yaml` from the body of `_book-to-review.yaml`:

```yaml
# Takes a mother from the booking date picker ("Pick a day") to the review
# step, with the booking every P0 flow wants: starting in about ten minutes,
# one child, four hours, no skills.
#
# Not a test — the leading underscore keeps run.mjs from treating it as one.
# _book-to-review.yaml enters through Home's "Book care"; C20 enters through a
# promo link (an announcement or a campaign banner), which lands on the same
# picker with a code waiting for the review step.
appId: com.nannyapp.mobile
---
- extendedWaitUntil:
    visible: 'Pick a day'
    timeout: 30000

# The first card the rail offers, by index rather than by label. The rail drops
# days whose slots have all passed, so whether the first card says "Today" or
# "Tomorrow" depends on the clock and on the device's timezone relative to the
# platform's.
- tapOn:
    id: 'booking.day'
    index: 0

# Care has to start soon, because check-in opens only fifteen minutes before
# the start time and a booking further out could never reach IN_PROGRESS.
#
# Selecting a day already lands on the earliest start on offer, so these taps
# normally do nothing — they walk the stepper down to its floor whatever it
# opened on, and it disables there, so the count only has to be generous.
- repeat:
    times: 12
    commands:
      - tapOn:
          id: 'booking.startTime.decrement'

# Then back up two five-minute notches. The floor is the earliest start that
# was legal when the screen loaded, and by the time the request is actually
# submitted — two screens later — that moment has passed and the server refuses
# it as "Cannot book in the past". Ten minutes of headroom clears the walk
# comfortably while staying inside the check-in window.
- repeat:
    times: 2
    commands:
      - tapOn:
          id: 'booking.startTime.increment'

# The length opens on the admin's minimum booking, so step it up to the four
# hours every P0 flow prices against.
# The stepper sits at the foot of the screen, under the sticky summary bar —
# bring it up first or the taps land on the bar.
- scrollUntilVisible:
    element:
      id: 'booking.duration.increment'
    direction: DOWN
    centerElement: true
- repeat:
    while:
      notVisible:
        id: 'booking.duration.value'
        text: '4h'
    times: 12
    commands:
      - tapOn:
          id: 'booking.duration.increment'
- assertVisible:
    id: 'booking.duration.value'
    text: '4h'

- tapOn:
    id: 'booking.cta'

# The seeded mother has one saved child (Lina, three — seed-mobile.ts), and an
# only child is ticked for her, so the care step goes straight through.
- extendedWaitUntil:
    visible: 'Who needs care?'
    timeout: 20000
- tapOn:
    id: 'booking.cta'

- extendedWaitUntil:
    visible: 'Review your request'
    timeout: 20000
```

Replace the whole of `apps/mobile/e2e/flows/_book-to-review.yaml` with:

```yaml
# Takes a signed-in mother from her home screen to the review step, with the
# booking that every P0 flow wants: starting in about ten minutes, one child,
# four hours, no skills.
#
# Not a test — the leading underscore keeps run.mjs from treating it as one.
# It stops short of submitting: the review step is where promo codes, Care
# Points and packages live, so each flow does its own thing there. Everything
# after "Book care" lives in _book-from-date-picker.yaml, which C20 also uses.
appId: com.nannyapp.mobile
---
- assertVisible: 'Book care'
- tapOn: 'Book care'
- runFlow: _book-from-date-picker.yaml
```

Run: `~/.maestro/bin/maestro check-syntax apps/mobile/e2e/flows/_book-from-date-picker.yaml && ~/.maestro/bin/maestro check-syntax apps/mobile/e2e/flows/_book-to-review.yaml`
Expected: no errors.

- [ ] **Step 3: `advance.js` steps for announcements and campaigns**

In `apps/mobile/e2e/scripts/advance.js`, add before `var STEPS = {`:

```js
/**
 * Announcements and campaign banners for C20 and s20.
 *
 * Both reach the app the way they do in production: the admin writes a
 * notification template and publishes it (`/admin/notification-templates`),
 * or adds a campaign (`/admin/campaigns`), and the mother's app reads them
 * over its own routes. Announcements go IN_APP only: the lab registers a real
 * FCM token, and a push banner landing mid-flow would cover the screen.
 *
 * Every template and campaign is named `E2E …`, which is what the seeder's
 * reset soft-deletes before each flow — together with her ANNOUNCEMENT inbox
 * rows, so a flow sees only what it published.
 */
function findPromoCode(adminToken, code) {
  var codes = call('GET', adminToken, '/admin/promo-codes');
  for (var i = 0; i < codes.length; i++) {
    if (codes[i].code === code) return codes[i];
  }
  throw new Error('No promo code ' + code + ' — the seeder provisions it from fixtures.mjs.');
}

function findPackage(adminToken, name) {
  var packages = call('GET', adminToken, '/admin/packages');
  for (var i = 0; i < packages.length; i++) {
    if (packages[i].name === name) return packages[i];
  }
  throw new Error('No package ' + name + ' — the seeder provisions it from fixtures.mjs.');
}

/** Writes one template for her alone and publishes it; returns the broadcast. */
function publishAnnouncement(adminToken, motherId, content) {
  var template = call('POST', adminToken, '/admin/notification-templates', {
    name: 'E2E ' + content.title,
    title: content.title,
    body: content.body,
    imageUrl: content.imageUrl || null,
    channel: 'IN_APP',
    targetType: content.targetType || null,
    packageId: content.packageId || null,
    promoCodeId: content.promoCodeId || null,
    audience: { type: 'MOTHERS', motherIds: [motherId] },
  });
  return call('POST', adminToken, '/admin/notification-templates/' + template.id + '/publish');
}

/**
 * C20: one promo announcement, published after everything already in her
 * inbox is marked read — so the unread count afterwards is a statement about
 * this announcement alone.
 */
function announcementSeed() {
  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  var motherToken = signIn(MOTHER_EMAIL);
  var motherId = call('GET', motherToken, '/auth/me').id;
  call('PATCH', motherToken, '/notifications/read-all');

  var promo = findPromoCode(adminToken, PROMO_CODE);
  var broadcast = publishAnnouncement(adminToken, motherId, {
    title: 'Ten percent off your next booking',
    body: 'Book any day this week and we take 10% off. Your code is applied for you on the review step.',
    targetType: 'PROMO_CODE',
    promoCodeId: promo.id,
  });
  output.broadcastStatus = broadcast.status;
}

/**
 * s20: every card state — image and no image, link and no link — plus a long
 * title and an Arabic body. Published oldest first, so the promo card (the one
 * the flow taps through to Step 1) is at the top of the inbox.
 */
function announcementSweepSeed() {
  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  var motherToken = signIn(MOTHER_EMAIL);
  var motherId = call('GET', motherToken, '/auth/me').id;
  call('PATCH', motherToken, '/notifications/read-all');

  var promo = findPromoCode(adminToken, PROMO_CODE);
  var pack = findPackage(adminToken, PACKAGE_NAME);

  // No image, no link, Arabic: must right-align and wrap.
  publishAnnouncement(adminToken, motherId, {
    title: 'تحديث من فريق ناني ناو',
    body: 'أضفنا مربيات جديدات في منطقتك هذا الأسبوع. احجزي من الصفحة الرئيسية في أي وقت يناسبك.',
  });
  // Image, no link, a title long enough to wrap at 1.3 on the small phone.
  publishAnnouncement(adminToken, motherId, {
    title: 'Now caring for families in New Cairo and Sheikh Zayed',
    body: 'Nannies are available from 7am to 11pm every day. There is nothing to do on your side.',
    imageUrl: 'https://storage.example.test/e2e-announcement-area.jpg',
  });
  // No image, package link.
  publishAnnouncement(adminToken, motherId, {
    title: 'Ten hours of care, paid once',
    body: 'Buy the ' + PACKAGE_NAME + ' pack and your next ten hours cost less than the standard rate.',
    targetType: 'PACKAGE',
    packageId: pack.id,
  });
  // Image, promo link — newest, so first in the list.
  publishAnnouncement(adminToken, motherId, {
    title: 'Ten percent off your next booking',
    body: 'Book any day this week and we take 10% off. Your code is applied for you on the review step.',
    imageUrl: 'https://storage.example.test/e2e-announcement-offer.jpg',
    targetType: 'PROMO_CODE',
    promoCodeId: promo.id,
  });
}

function removeLabCampaigns(adminToken) {
  var campaigns = call('GET', adminToken, '/admin/campaigns');
  for (var i = 0; i < campaigns.length; i++) {
    if (campaigns[i].title.indexOf('E2E') === 0) {
      call('DELETE', adminToken, '/admin/campaigns/' + campaigns[i].id);
    }
  }
}

/** C20: a Home banner for the reusable promo code. */
function campaignSeed() {
  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  removeLabCampaigns(adminToken);
  var promo = findPromoCode(adminToken, PROMO_CODE);
  call('POST', adminToken, '/admin/campaigns', {
    title: 'E2E ten percent off',
    subtitle: 'Applied for you on the review step',
    imageUrl: 'https://storage.example.test/e2e-campaign.jpg',
    targetType: 'PROMO_CODE',
    promoCodeId: promo.id,
  });
}

/** C20's onFlowComplete: no lab banner may sit on a later flow's Home. */
function campaignClear() {
  removeLabCampaigns(signIn(ADMIN_EMAIL, ADMIN_PASSWORD));
}
```

and add to `STEPS`:

```js
  'announcement-seed': announcementSeed,
  'announcement-sweep-seed': announcementSweepSeed,
  'campaign-seed': campaignSeed,
  'campaign-clear': campaignClear,
```

- [ ] **Step 4: The seeder resets what C20 and s20 leave behind**

In `apps/backend/test/e2e/seed-mobile.ts`, inside `resetPreviousRun`, right after the block that soft-deletes the `SURVEY` notifications, add:

```ts
  // C20 and s20 publish announcements to her and put a banner on Home. Old
  // inbox rows would make "the announcement" ambiguous, and a leftover banner
  // would sit on every later flow's Home, so every flow starts with neither.
  // Lab templates and campaigns are all named `E2E …` (advance.js).
  await prisma.notification.updateMany({
    where: { userId: { in: userIds }, type: 'ANNOUNCEMENT', deletedAt: null },
    data: { deletedAt },
  });
  await prisma.campaign.updateMany({
    where: { title: { startsWith: 'E2E' }, deletedAt: null },
    data: { deletedAt },
  });
  await prisma.notificationTemplate.updateMany({
    where: { name: { startsWith: 'E2E' }, deletedAt: null },
    data: { deletedAt },
  });
```

Run: `pnpm --filter @nanny-app/backend typecheck`
Expected: PASS (`prisma.notificationTemplate` and `NotificationType.ANNOUNCEMENT` exist since Task 2).

- [ ] **Step 5: The C20 flow**

`apps/mobile/e2e/flows/c20-announcement-promo.yaml`:

```yaml
# C20 — a promo link lands on the review step with the code already applied,
# from both places a mother finds one: an admin announcement in her inbox, and
# a campaign banner on Home.
#
# The admin's side runs over HTTP: `announcement-seed` writes a template with a
# promo-code link and publishes it to her (IN_APP — a real push banner on the
# lab's FCM token would cover the screen), and `campaign-seed` puts a banner
# for the same code on Home. Four hours at the standard 120/hr is 480; the
# reusable code takes ten percent, 48, which leaves 432 — the same figures as
# A4, so an applied-but-wrong discount fails here too.
#
# Nothing is paid: what only the device can show is that the code arrives
# applied (A4 already proves the applied figure is what the checkout charges).
appId: com.nannyapp.mobile
onFlowComplete:
  - runScript:
      file: ../scripts/advance.js
      env:
        ADVANCE: campaign-clear
---
- runFlow: _launch.yaml

- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: announcement-seed
- assertTrue: ${output.broadcastStatus == 'SENT'}
- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: campaign-seed

- runFlow:
    file: _sign-in.yaml
    env:
      EMAIL: ${MOTHER_EMAIL}
- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000

# ── The announcement, from the inbox ───────────────────────────────────────
- tapOn: 'Open notifications'
- extendedWaitUntil:
    visible: 'Notifications'
    timeout: 30000
# The card is one button labelled "<title>. <action>", so this asserts the
# action copy and the code it carries in one go.
- extendedWaitUntil:
    visible: 'Ten percent off your next booking\. Book with code ${PROMO_CODE}'
    timeout: 30000
- tapOn: 'Ten percent off your next booking\. Book with code ${PROMO_CODE}'

- runFlow: _book-from-date-picker.yaml

# Applied, not just typed in: the chip with the discount, and the total moved.
# `.*` stands in for the em dash between the code and the amount.
- extendedWaitUntil:
    visible: '${PROMO_CODE}.*EGP 48.00 off'
    timeout: 20000
- assertVisible: 'EGP 432.00'

# Tapping it also marked it read — the only unread row there was.
- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: unread-count
- assertTrue: ${output.unread == '0'}

# ── The campaign banner, from Home ─────────────────────────────────────────
# A relaunch rather than backing out of three booking screens: it lands on Home
# with the session intact, and Home's focus clears any stale pending code, so
# what Step 1 applies next can only have come from the banner.
- runFlow:
    file: _relaunch.yaml
    env:
      EXPECT: 'Book care'
- scrollUntilVisible:
    element: 'E2E ten percent off.*'
    direction: DOWN
    centerElement: true
    timeout: 15000
- tapOn: 'E2E ten percent off.*'

- runFlow: _book-from-date-picker.yaml

- extendedWaitUntil:
    visible: '${PROMO_CODE}.*EGP 48.00 off'
    timeout: 20000
- assertVisible: 'EGP 432.00'
```

Run: `~/.maestro/bin/maestro check-syntax apps/mobile/e2e/flows/c20-announcement-promo.yaml`
Expected: no errors.

- [ ] **Step 6: Bring up the lab and run C20 and A4, twice each**

The emulator, Metro and backend are shared with other chats. Before you start anything, check that no other run is using them:

```bash
tmux has-session -t nanny-app-e2e 2>/dev/null && echo "E2E RUN IN PROGRESS"; pgrep -fa "e2e/run.mjs|ui-sweep.mjs"
```

If either prints something, wait. Then follow the `mobile-e2e-lab` skill (`references/environment.md`) to bring up whatever is down. Use Paymob fake mode with Metro on 8090. Each service goes in its own tmux session:

```bash
mkdir -p ~/logs
tmux new -d -s nanny-test-env "cd /home/mark/projects/nanny-app && pnpm test:env 2>&1 | tee ~/logs/nanny-test-env.log"
tmux new -d -s nanny-backend-test "cd /home/mark/projects/nanny-app && pnpm --filter @nanny-app/backend start:test 2>&1 | tee ~/logs/nanny-backend-test.log"
tmux new -d -s nanny-emulator "emulator -avd nanny-e2e -port 5562 -no-window -gpu swiftshader_indirect -no-snapshot-save -no-audio 2>&1 | tee ~/logs/nanny-emulator.log"
tmux new -d -s nanny-metro "cd /home/mark/projects/nanny-app && pnpm --filter @nanny-app/mobile e2e:metro:paymob-fake --port 8090 2>&1 | tee ~/logs/nanny-metro.log"
```

Once the emulator has booted, run `adb -s emulator-5562 shell svc wifi disable` (trap 1 in the skill). Wait until `~/logs/nanny-metro.log` shows the bundle built (trap 4).

The lab shares `nannyapp_test` with the backend integration suite. That suite's global setup runs `prisma migrate deploy`, so if Tasks 7–8 have not run it on this machine since the migration landed, run it once:

```bash
tmux new -d -s nanny-integration "cd /home/mark/projects/nanny-app && pnpm test:integration 2>&1 | tee ~/logs/nanny-integration.log"
```

The app's native code is unchanged, so the installed debug build is fine. Metro serves the new JS. Now run C20 twice, then A4 twice. A4 types into the promo field that Task 13 changed.

```bash
tmux kill-session -t nanny-e2e-c20 2>/dev/null; \
tmux new -d -s nanny-e2e-c20 "cd /home/mark/projects/nanny-app/apps/mobile && \
  ANDROID_SERIAL=emulator-5562 E2E_METRO_PORT=8090 node e2e/run.mjs --paymob=fake c20 && \
  ANDROID_SERIAL=emulator-5562 E2E_METRO_PORT=8090 node e2e/run.mjs --paymob=fake c20 && \
  ANDROID_SERIAL=emulator-5562 E2E_METRO_PORT=8090 node e2e/run.mjs --paymob=fake a04 && \
  ANDROID_SERIAL=emulator-5562 E2E_METRO_PORT=8090 node e2e/run.mjs --paymob=fake a04 2>&1 | tee ~/logs/nanny-e2e-c20.log"
```

Tell the user the session names and log paths. Watch with `tail -f ~/logs/nanny-e2e-c20.log`; never pipe `run.mjs` through `grep`. If a run fails, read the Maestro debug screenshot under `~/.maestro/tests/<ts>/<flow>/screenshots/` before you change anything. A wrong selector is a flow fix. A code that arrives without being applied is an app bug: fix it with a unit test first, then run again.
Expected: four green runs, each ending `1/1 flows passed`.

- [ ] **Step 7: Commit the E2E coverage**

```bash
git add apps/mobile/e2e/flows/_book-from-date-picker.yaml apps/mobile/e2e/flows/_book-to-review.yaml \
  apps/mobile/e2e/flows/c20-announcement-promo.yaml apps/mobile/e2e/scripts/advance.js \
  apps/backend/test/e2e/seed-mobile.ts
git commit -m "$(cat <<'EOF'
test(e2e): announcement and campaign taps land on Step 1 with the code applied (C20)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

- [ ] **Step 8: Sweep flow s20 and the UI sweep**

States to cover (skill §1): the inbox with all four card kinds (image or no image × link or no link), unread then read; the long title wrapping; the Arabic body right-aligned; the package link's landing screen; Step 1 with the auto-applied promo, at the top and scrolled to the price.

`apps/mobile/e2e/flows/sweep/s20-announcements.yaml`:

```yaml
# UI sweep 20 — admin announcements as the mother sees them: the inbox with
# every card kind (image / no image × promo link / package link / no link, a
# long title, an Arabic body), a card once read, the package checkout a
# package card opens, and the review step with the promo code auto-applied.
#
# `announcement-sweep-seed` publishes four announcements to her over the admin
# API, oldest first, so the promo card is on top. The images are lab URLs the
# emulator cannot load, so image cards show the 2:1 placeholder box — the same
# box, at the same size, a loaded image fills.
appId: com.nannyapp.mobile
---
- runScript:
    file: ../../scripts/advance.js
    env:
      ADVANCE: announcement-sweep-seed
- runFlow: ../_launch.yaml
- runFlow:
    file: ../_sign-in.yaml
    env:
      EMAIL: ${MOTHER_EMAIL}
- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000

# ── The inbox: every card kind, unread ─────────────────────────────────────
- tapOn: 'Open notifications'
- extendedWaitUntil:
    visible: 'Ten percent off your next booking.*'
    timeout: 30000
- waitForAnimationToEnd:
    timeout: 3000
- takeScreenshot: s20-01-inbox-top
- scrollUntilVisible:
    element: 'Now caring for families.*'
    direction: DOWN
    centerElement: true
    timeout: 15000
- waitForAnimationToEnd:
    timeout: 3000
- takeScreenshot: s20-02-inbox-long-title
- scrollUntilVisible:
    element: 'تحديث من فريق ناني ناو'
    direction: DOWN
    centerElement: true
    timeout: 15000
- waitForAnimationToEnd:
    timeout: 3000
- takeScreenshot: s20-03-inbox-arabic

# ── A card with no link: a tap only marks it read ──────────────────────────
- tapOn: 'تحديث من فريق ناني ناو'
- waitForAnimationToEnd:
    timeout: 3000
- takeScreenshot: s20-04-inbox-read-no-link

# ── The package card opens checkout ────────────────────────────────────────
- runFlow:
    file: _tap.yaml
    env:
      TARGET: 'Ten hours of care, paid once\. View package'
- extendedWaitUntil:
    visible: 'Complete your payment to activate your package.'
    timeout: 30000
- waitForAnimationToEnd:
    timeout: 3000
- takeScreenshot: s20-05-package-checkout
- back
- extendedWaitUntil:
    visible: 'Notifications'
    timeout: 30000

# ── The promo card: the booking flow, then Step 1 with the code applied ────
# Back up to the top card, which the package tap scrolled away from.
- scrollUntilVisible:
    element: 'Ten percent off your next booking.*'
    direction: UP
    centerElement: true
    timeout: 15000
- tapOn: 'Ten percent off your next booking\. Book with code ${PROMO_CODE}'
- extendedWaitUntil:
    visible: 'Pick a day'
    timeout: 30000
# On a small phone the day rail starts below the fold.
- scrollUntilVisible:
    element:
      id: 'booking.day'
    direction: DOWN
    centerElement: true
    timeout: 15000
- tapOn:
    id: 'booking.day'
    index: 0
# Headroom so "Cannot book in the past" never fires (as in s04).
- scrollUntilVisible:
    element:
      id: 'booking.startTime.increment'
    direction: DOWN
    centerElement: true
    timeout: 15000
- repeat:
    times: 6
    commands:
      - tapOn:
          id: 'booking.startTime.increment'
- tapOn:
    id: 'booking.cta'
- extendedWaitUntil:
    visible: 'Who needs care?'
    timeout: 30000
- tapOn:
    id: 'booking.cta'
- extendedWaitUntil:
    visible: '${PROMO_CODE}.*off'
    timeout: 30000
- waitForAnimationToEnd:
    timeout: 3000
- takeScreenshot: s20-06-review-promo-applied-top
- scrollUntilVisible:
    element: '${PROMO_CODE}.*off'
    direction: DOWN
    centerElement: true
    timeout: 15000
- waitForAnimationToEnd:
    timeout: 3000
- takeScreenshot: s20-07-review-promo-applied
- scrollUntilVisible:
    element: 'Price details'
    direction: DOWN
    centerElement: true
    timeout: 15000
- runFlow:
    file: _tap.yaml
    env:
      TARGET: 'Price details'
- waitForAnimationToEnd:
    timeout: 3000
- takeScreenshot: s20-08-review-price-with-promo
```

Run: `~/.maestro/bin/maestro check-syntax apps/mobile/e2e/flows/sweep/s20-announcements.yaml`
Expected: no errors.

Run the worst cell and the default phone first. Repeat the shared-lab check from Step 6 before you start:

```bash
tmux kill-session -t nanny-ui-sweep-s20 2>/dev/null; \
tmux new -d -s nanny-ui-sweep-s20 "cd /home/mark/projects/nanny-app/apps/mobile && \
  ANDROID_SERIAL=emulator-5562 E2E_METRO_PORT=8090 node e2e/ui-sweep.mjs --paymob=fake \
  --cells=small-1.3-3btn,large-1.0-gesture --flows=s20 2>&1 | tee ~/logs/nanny-ui-sweep-s20.log"
```

Then run all 8 cells (`--flows=s20` with no `--cells`), and after that s04 (`--flows=s04`). s04 drives the promo field, which Task 13 changed. Tell the user each session name and log path.

Review every shot in `apps/mobile/e2e/ui-sweep-output/<timestamp>/` against "Rules from the UI sweep" (skill §4). Compare each screen across the cells. In particular check:
- **Cards:** titles and bodies wrap and are never truncated, and the time drops to its own line at 1.3 rather than squeezing the title. The image box stays 2:1 with rounded corners, the Arabic title and body are right-aligned, and the action line keeps "code" and the code on one line. The unread marker is gone after the tap (`s20-04`).
- **Last card:** it clears the floating tab bar.
- **Step 1:** the applied chip shows the code and the discount, with the remove × at 44 dp or more. "You're saving" lists "Promo E2ETEN", the price card has its Promo line, and the CTA total matches.

If a flow fails, it leaves `s20-zz-FAILED.png`; read it first. Fix every defect in the announcement card or the auto-apply state, following the design skill and the ui-ux-pro-max pre-delivery checklist. Re-run with `--into=<timestamp> --cells=<cells> --flows=s20` until the shots are clean. Defects on screens this feature didn't touch go in the report, unfixed. Commit the flow and any fixes:

```bash
git add apps/mobile/e2e/flows/sweep/s20-announcements.yaml apps/mobile/src
git commit -m "$(cat <<'EOF'
test(mobile): UI sweep for announcements and the auto-applied promo (s20)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```

- [ ] **Step 9: Push-tap check on a device (Task 14 note)**

The lab backend can't send FCM: it runs against the Auth emulator's demo project. So check the push branch with a dev build against the dev backend (`localhost:3000`), which uses the real Firebase credentials from `apps/backend/.env`:
1. In the admin console, publish a template with channel **Push** and a promo-code link to the device's mother account. Fully close the app, tap the push, and walk the booking steps. Step 1 must show the code applied.
2. Repeat with the app in the background (not closed).
3. Repeat with a template that has no link. The tap must open the Notifications tab.

If the cold-start tap reaches the date picker but Step 1 shows an empty promo field, Home's focus-clear won the race (Task 14 note). The fix is to stop using the store for a promo **link** and carry the code in the navigation instead. That way it lives only in that flow's stack: an abandoned flow can't leak it, and Home's guard can't drop it. `BookingFlowParams` already has `promoCode?: string`, and `BookingCareDetailsScreen` already spreads its params into Step 1. So the fix touches three places:

1. `openPromoLink` pushes `{ pathname: '/(parent)/book/booking-date-picker', params: { promoCode: link.code } }` instead of calling `setPendingPromoCode`.
2. `BookingDatePickerScreen.handleContinue` adds `...(params.promoCode ? { promoCode: params.promoCode } : {})` to the params it pushes. It needs `const params = useLocalSearchParams<BookingFlowParams>()` if the screen doesn't already read its params.
3. In `BookingStep1Screen`, the mount effect takes `params.promoCode ?? pendingPromoCode`.

The tests change with it: `openPromoLink.test` and the carousel's promo case assert the param push, and `BookingStep1Screen.test` covers a code arriving through `mockParams.promoCode`. This departs from the spec's "`setPendingPromoCode` → booking-date-picker" wording, so get the user's agreement first. Then implement it test-first, re-run C20 twice, and commit it as `fix(mobile): carry a linked promo code through the booking params`.

- [ ] **Step 10: Docs**

`apps/mobile/e2e/README.md`:

1. In the subflow table under "## Layout", add a row after `_book-to-review.yaml`:

```markdown
| `_book-from-date-picker.yaml` | The date picker → the review step; `_book-to-review.yaml` enters it through "Book care", C20 through a promo link |
```

2. Add a section before "## What the flows deliberately do not cover":

```markdown
## Announcements and promo links (C20)

**C20** — a promo link arrives on the review step with the code already applied, from an admin
announcement in the inbox and from a Home campaign banner. `announcement-seed` publishes an IN_APP
template with a link to the reusable code (`/admin/notification-templates`, then `…/:id/publish`);
`campaign-seed` adds a banner for the same code. Both taps open the date picker, the flow books
through `_book-from-date-picker.yaml`, and Step 1 must show `E2ETEN — EGP 48.00 off` and
`EGP 432.00` without anyone typing the code. The announcement tap also marks it read
(`unread-count` reads 0).

- **IN_APP only.** The lab registers a real FCM token; a push banner landing mid-flow covers the
  screen. The push-tap branch is covered by `usePushNotifications.announcement.test.ts`.
- **The seeder soft-deletes her `ANNOUNCEMENT` rows and every `E2E…` campaign and template before
  each flow**, so a run that died mid-C20 leaves no banner on a later flow's Home. C20 also clears
  its banner in `onFlowComplete` (`campaign-clear`).
- `s20-announcements` is the sweep for the same feature: every card kind, the package link's
  checkout, and the review step with the code applied (`announcement-sweep-seed`).
```

`Docs/testing/e2e-flows.md` — add a row after C19 in the P2 table:

```markdown
| C20 | Promo links: an admin announcement in the inbox and a Home campaign banner each open the booking flow and reach the review step with the code already applied; the announcement is marked read — **covered** by `c20-announcement-promo.yaml` | `UI:mobile` |
```

`apps/mobile/CLAUDE.md` — under the navigation rules, after the `goToParentTab` bullet, add:

```markdown
- A link to a package or a promo code — a campaign banner, an announcement push, an inbox
  announcement card — opens through `openPromoLink` (`lib/openPromoLink.ts`). A promo code is
  handed to the booking flow in `pendingPromoStore` and **applied** on the review step
  (`BookingStep1Screen`) once the price breakdown exists; a refused code shows the usual inline
  error and the request goes ahead without it. Home clears a stale pending code on focus.
```

`apps/backend/CLAUDE.md` — under "Known Gotchas", after the Surveys entry:

```markdown
**Notification center: apply `add_notification_center` before the backend deploys; publishing sends in-request**
`20261020120000_add_notification_center` adds the template and broadcast tables,
`notifications.broadcast_id`, the `ANNOUNCEMENT` enum value, `user_groups.kind/rules`, and
`users.last_app_open_at` (backfilled from `last_login_at`), and seeds the "All mothers" dynamic group.
Run `pnpm db:migrate` against production before merging, or the notification-template, group and
inbox routes 500. Publishing resolves the audience and sends inside the request
(`publishNotificationTemplate`: inbox rows in `createMany` chunks of 1,000, FCM
`sendEachForMulticast` 500 tokens × 4 at a time). That is sized for thousands of mothers within
`maxDuration: 60`. A broadcast still `SENDING` after 5 minutes reads as `FAILED` ("Timed out") and no
longer blocks a publish. `lastLoginAt` now means a real sign-in (the token's `auth_time`, only moving
forward). `lastAppOpenAt` moves only through `POST /me/app-open` (60 s server throttle, 5 min in the
app), so until the new app build spreads it holds the backfill. Old builds list announcements as plain
rows with no tap action. See `docs/superpowers/specs/2026-10-20-admin-notification-center-design.md`.
```

`.claude/CLAUDE.md` — add two rows to "Decisions to Revisit":

```markdown
| Announcements publish in-request (batched FCM, no queue) | Fine for thousands of mothers inside Vercel's 60 s; past the low tens of thousands, or once scheduled sends are wanted, drive `NotificationBroadcast` (it already carries status and counts) from a queue |
| Announcement images show in the Android push banner only | iOS banners need a Notification Service Extension (a native target, so a new EAS build) |
```

`Docs/notifications-implemented.md` — insert directly under the first paragraph (after the line ending "…`Docs/user-stories/09-notifications.md`."):

```markdown
> **Out of date (2026-10-20).** This page predates surveys and the admin notification center. The
> full list of notification types is `NotificationTypeSchema` in
> `packages/shared/src/notifications.ts`. Admin announcements (`announcement`: written as templates
> in the console's Notifications page, sent in-app and/or as a push, with an optional image and a
> package or promo-code link) are described in
> `docs/superpowers/specs/2026-10-20-admin-notification-center-design.md`.
```

- [ ] **Step 11: Final verification**

Re-run Step 1's tmux command (`nanny-verify`). Then run the backend integration suite in its own session:

```bash
tmux kill-session -t nanny-integration 2>/dev/null; \
tmux new -d -s nanny-integration "cd /home/mark/projects/nanny-app && pnpm test:integration 2>&1 | tee ~/logs/nanny-integration.log"
```

Expected: typecheck, lint and unit tests pass in every package, and the integration suite passes, `a44`–`a47` included. Put the summary lines from both logs in the final report, along with the four C20/A4 run tallies from Step 6 and the sweep findings from Step 8.

- [ ] **Step 12: Commit the docs**

```bash
git add apps/mobile/e2e/README.md Docs/testing/e2e-flows.md apps/mobile/CLAUDE.md \
  apps/backend/CLAUDE.md .claude/CLAUDE.md Docs/notifications-implemented.md
git commit -m "$(cat <<'EOF'
docs: notification center deploy gotcha, promo links, C20 and s20

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ugz3jkBjEZNaPy1kvp7M77
EOF
)"
```
