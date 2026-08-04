# Campaigns Module — Backend + Admin CRUD + Mobile Carousel — Design

Date: 2026-08-04
Status: Approved

## Goal

Add a `Campaign` entity: a promotional card that links to exactly one existing
target — a `Package` or a `PromoCode`. Admins manage campaigns (full CRUD) in a
new **Campaigns** tab in the admin app, alongside per-campaign engagement counts
(impressions, taps) and the linked target's total usage. On mobile, live
campaigns appear as a horizontal **carousel on the parent Home screen** (just
after the "Book care" card). Tapping a card records a tap and deep-links the
parent to the target: a package campaign opens that package's checkout; a
promo-code campaign starts the booking flow with the code prefilled.

Mirrors the Promo Codes / Packages modules in structure and conventions.

## Decisions

- **One target per campaign, polymorphic via `targetType`.** A `targetType` enum
  (`PACKAGE | PROMO_CODE`) plus two nullable FKs (`packageId`, `promoCodeId`).
  Exactly one FK is set and it must match `targetType` — enforced in the shared
  Zod schema (`.refine`) and re-checked in the service.
- **Integer sequential IDs.** `id Int @id @default(autoincrement())`, per the
  catalog-module precedent (`2026-07-17-sequential-int-ids-design.md`) and so the
  FKs line up with `Package.id` / `PromoCode.id` (both `Int`).
- **Image is required.** `imageUrl String` (non-null). The admin browser uploads
  the file directly to **Firebase Storage** (mirroring mobile's
  `uploadImageToFirebase`) and sends the resulting download URL; the backend
  stores it as a validated URL string. A carousel card has no sensible empty
  state, so an image is mandatory at both schema and form level.
- **Engagement = counter columns.** `impressionCount` / `clickCount` as `Int`
  columns, incremented atomically (`{ increment: 1 }`). No per-event history, no
  attribution. Impressions are debounced client-side (one per campaign per
  carousel mount). This matches how the codebase already does aggregate
  reporting (no analytics pipeline).
- **"Total usage" = the linked target's own cumulative usage** (global, not
  campaign-attributed): promo-code campaign → `PromoCode.usageCount`; package
  campaign → count of `PackagePurchase` rows for that package past
  `PENDING_PAYMENT`. Resolved on read in the admin list; **no CTR** is computed
  or displayed.
- **Optional schedule window.** `startsAt` / `endsAt` (`DateTime?`). A campaign is
  "live" only within the window (open-ended when null).
- **`sortOrder`** (`Int @default(0)`) controls carousel order (ascending),
  tie-broken by `createdAt`.
- **Soft delete.** Standard `created_at` / `updated_at` / `deleted_at`; all reads
  filter `deleted_at IS NULL`; deletes set `deleted_at`.
- **Guests are served + counted.** Home is visible to guests, so the mobile-facing
  campaign endpoints use **optional auth** (`optionalAuth` middleware), not
  `requireAuth`.

## "Live" definition (mobile)

A campaign is returned to mobile iff **all** hold:
- `isActive = true` and `deletedAt IS NULL`
- `startsAt IS NULL OR startsAt <= now`
- `endsAt IS NULL OR endsAt >= now`
- the linked target is itself usable: the `Package` (or `PromoCode`) is
  `isActive`, `deletedAt IS NULL`, and not past its own expiry
  (`Package.expiresAt` / `PromoCode.expiresAt`). This prevents deep-linking a
  parent to a dead package or expired promo.

## 1. Data model — `apps/backend/prisma/schema.prisma`

New enum + model:

```prisma
enum CampaignTargetType {
  PACKAGE
  PROMO_CODE

  @@map("campaign_target_type")
}

model Campaign {
  id              Int                @id @default(autoincrement())
  title           String
  subtitle        String?            @db.Text
  imageUrl        String             @map("image_url")
  targetType      CampaignTargetType @map("target_type")
  packageId       Int?               @map("package_id")
  promoCodeId     Int?               @map("promo_code_id")
  isActive        Boolean            @default(true) @map("is_active")
  startsAt        DateTime?          @map("starts_at")
  endsAt          DateTime?          @map("ends_at")
  sortOrder       Int                @default(0) @map("sort_order")
  impressionCount Int                @default(0) @map("impression_count")
  clickCount      Int                @default(0) @map("click_count")
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt      @map("updated_at")
  deletedAt       DateTime?          @map("deleted_at")

  package   Package?   @relation(fields: [packageId], references: [id])
  promoCode PromoCode? @relation(fields: [promoCodeId], references: [id])

  @@index([deletedAt])
  @@index([isActive, sortOrder])
  @@map("campaigns")
}
```

Add the reverse relation fields on `Package` (`campaigns Campaign[]`) and
`PromoCode` (`campaigns Campaign[]`).

Migration: `pnpm db:migrate:dev --name add_campaigns_table`.

## 2. Shared schemas — `packages/shared/src/campaign.ts`

Exported from `packages/shared/src/index.ts`. Imports nothing internal.

- `CampaignTargetTypeSchema = z.enum(['PACKAGE', 'PROMO_CODE'])`.
- `CampaignSchema` — full admin DTO:
  ```ts
  {
    id: z.number().int(),
    title: z.string(),
    subtitle: z.string().nullable(),
    imageUrl: z.string(),
    targetType: CampaignTargetTypeSchema,
    packageId: z.number().int().nullable(),
    promoCodeId: z.number().int().nullable(),
    targetName: z.string(),        // resolved: package name or promo code
    isActive: z.boolean(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    sortOrder: z.number().int(),
    impressionCount: z.number().int(),
    clickCount: z.number().int(),
    targetUsageCount: z.number().int(), // resolved from the target
    createdAt: z.string(),
  }
  ```
- `CreateCampaignSchema`:
  ```ts
  {
    title: z.string().trim().min(1).max(120),
    subtitle: z.string().trim().max(200).optional(),
    imageUrl: z.string().url(),
    targetType: CampaignTargetTypeSchema,
    packageId: z.number().int().positive().optional(),
    promoCodeId: z.number().int().positive().optional(),
    isActive: z.boolean().default(true),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    sortOrder: z.number().int().min(0).default(0),
  }
  ```
  `.refine` (exactly-one-target matching `targetType`): when `targetType` is
  `PACKAGE`, `packageId` is set and `promoCodeId` is not; vice versa for
  `PROMO_CODE`. `.refine` end-after-start: when both present, `endsAt > startsAt`.
- `UpdateCampaignSchema` — every field optional; `subtitle`, `startsAt`, `endsAt`
  also `.nullable()` so they can be cleared; the same exactly-one-target refine
  applies when `targetType`/target ids are being changed; requires at least one
  field (`.refine(v => Object.keys(v).length > 0)`).
- `PublicCampaignSchema` — mobile DTO (only what the carousel + deep-link need):
  ```ts
  {
    id: z.number().int(),
    title: z.string(),
    subtitle: z.string().nullable(),
    imageUrl: z.string(),
    targetType: CampaignTargetTypeSchema,
    packageId: z.number().int().nullable(),  // set for PACKAGE
    promoCode: z.string().nullable(),        // the code string, set for PROMO_CODE
  }
  ```

Inferred types: `Campaign`, `CreateCampaignInput`, `UpdateCampaignInput`,
`PublicCampaign`, `CampaignTargetType`.

## 3. Backend service — `apps/backend/src/services/campaign.service.ts`

A local `CampaignRow` type (with `package` / `promoCode` includes) and a `toDto`
mapper. Target resolution: `targetName` and `targetUsageCount` come from the
included relation — promo → `usageCount`; package → a `PackagePurchase` count
(status `!= PENDING_PAYMENT`), fetched with a single `groupBy` over all
package-target campaigns to avoid N+1.

Admin functions:
- `listCampaigns(): Promise<Campaign[]>` — `findMany({ where: { deletedAt: null },
  include: { package, promoCode }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })`,
  then batch-resolve package usage counts.
- `createCampaign(input): Promise<Campaign>` — validate the target exists, is
  active, and matches `targetType` (`errors.badRequest` / `errors.notFound`);
  create.
- `updateCampaign(id, input): Promise<Campaign>` — `findFirst({ id, deletedAt: null })`
  or `errors.notFound`; if target fields change, re-validate the target; spread
  only provided fields (nullable clears for subtitle/startsAt/endsAt).
- `deleteCampaign(id): Promise<{ id: number }>` — soft delete.

Mobile-facing functions:
- `listLiveCampaigns(): Promise<PublicCampaign[]>` — applies the full "live"
  filter (§ "Live definition"), ordered by `sortOrder` then `createdAt`, mapped
  to the public DTO.
- `recordImpression(id): Promise<void>` — `update({ where: { id }, data:
  { impressionCount: { increment: 1 } } })`; ignore not-found (best-effort).
- `recordClick(id): Promise<void>` — same with `clickCount`.

## 4. Backend routes

**Admin** — new section in `apps/backend/src/routes/admin.routes.ts` (mirrors
promo codes):
- `GET    /admin/campaigns`     → `listCampaigns`
- `POST   /admin/campaigns`     → `validateBody(CreateCampaignSchema)` → `createCampaign` (201)
- `PATCH  /admin/campaigns/:id` → `validateBody(UpdateCampaignSchema)` → `updateCampaign`
- `DELETE /admin/campaigns/:id` → `deleteCampaign`

**Mobile-facing** — new `apps/backend/src/routes/campaign.routes.ts`, mounted at
`/campaigns` in `routes/index.ts`, using **`optionalAuth`** (guests included):
- `GET  /campaigns`             → `listLiveCampaigns`
- `POST /campaigns/:id/impression` → `recordImpression` (204/`ok`)
- `POST /campaigns/:id/click`      → `recordClick` (204/`ok`)

Uses existing `routeIdParam`, `ok`, `validateBody`.

## 5. Backend tests — `apps/backend/src/__tests__/campaign.service.test.ts`

Jest, Prisma mocked, matching `promo-code.service.test.ts`:
- create: success (package + promo), exactly-one-target violation, target
  not-found / inactive, `targetType` mismatch.
- update: success, not-found, target re-validation, clearing nullable fields.
- delete: success + not-found.
- `listLiveCampaigns`: filters out inactive / out-of-window / dead-target rows,
  respects `sortOrder`, maps promo → `promoCode`, package → `packageId`.
- increments: impression/click call `update` with `{ increment: 1 }`.

Plus `apps/backend/src/__tests__/campaign.schema.test.ts` (mirroring
`shared-package-schemas.test.ts`) covering the exactly-one-target and
end-after-start refines. Keeps the ≥ 80% coverage gate.

## 6. Admin frontend — `apps/admin`

- **`lib/firebase.ts`** — add `storageBucket` to the Firebase config (same
  project/bucket as mobile).
- **`lib/storage.ts`** (new) — `uploadImageToFirebase(file, folder)` mirroring
  mobile's helper (uses `firebase/storage` `uploadBytes` + `getDownloadURL`,
  path `campaigns/<uid>/<timestamp>-<random>.<ext>`), returning the download URL.
- **`lib/api.ts`** — `fetchCampaigns`, `createCampaign`, `updateCampaign`,
  `deleteCampaign` (typed, unwrap `{ data, error }`). Reuses existing
  `fetchPackages` / `fetchPromoCodes` for the target dropdowns.
- **`pages/campaigns-page.tsx`** — `PageHeader` + `CampaignForm` + `CampaignTable`,
  TanStack Query `['campaigns']`, `TableSkeleton` / `ErrorState` /
  `StaleRefreshBanner` states (mirrors `promo-codes-page.tsx`).
- **`features/campaigns/campaign-form.tsx`** — fields: title, subtitle, image
  upload (file input → `uploadImageToFirebase` → preview thumbnail + stored URL),
  target-type toggle (`Select`) that swaps between a package `Select` and a
  promo-code `Select`, `isActive` toggle, optional `startsAt` / `endsAt` date
  inputs, `sortOrder` number. Reuses `Field`, `Input`, `Select`, `Button`;
  reports via `useToast`; invalidates `['campaigns']`. Edit reuses the same form
  (create/update) — an edit affordance consistent with the sibling features.
- **`features/campaigns/campaign-table.tsx`** — columns: image thumb, Title,
  Target (package name / promo code, with a small type chip), Status badge
  (`Active` / `Scheduled` (before `startsAt`) / `Expired` (after `endsAt`) /
  `Off` (`!isActive`)), Impressions, Taps, Total usage, actions (edit + delete
  via `ConfirmDialog`). **No CTR column.**
- **Nav** — add the route in `apps/admin/src/app.tsx` (lowercase entry file per
  repo memory) and a nav item + lucide `Megaphone` icon in `admin-layout.tsx` /
  `ui/icon.tsx` (re-export `Megaphone`).

## 7. Mobile frontend — `apps/mobile`

- **`lib/api.ts`** — `fetchActiveCampaigns(): Promise<PublicCampaign[]>`,
  `trackCampaignImpression(id)`, `trackCampaignClick(id)`.
- **`hooks/useCampaigns.ts`** — `useActiveCampaigns` (React Query, `['campaigns']`),
  `useTrackImpression` / `useTrackClick` mutations (fire-and-forget).
- **`components/CampaignCarousel.tsx`** — horizontal, snapping card list
  (`FlatList horizontal` or `ScrollView`), each card showing `imageUrl` + `title`
  + `subtitle`. Records **one impression per campaign per mount** via
  `onViewableItemsChanged` + a `Set` ref (debounce). On tap: fire
  `trackCampaignClick`, then deep-link:
  - `PACKAGE` → `router.push` `PackageCheckoutScreen` route with `packageId`.
  - `PROMO_CODE` → `router.push` the booking flow entry
    (`/(parent)/book/booking-date-picker`) with a `promoCode` param, threaded
    through `bookingDraft` so `BookingStep1Screen` auto-applies it.
  Renders `null` when the campaign list is empty (no layout gap). All styling via
  a dedicated `styles/*.ts` file using theme tokens only.
- **`screens/parent/HomeScreen.tsx`** — insert `<CampaignCarousel />` directly
  after the "Book care" `Pressable`, before "How it works".
- **`bookingDraft.ts` / booking date-picker** — verify/extend so an incoming
  `promoCode` param survives from the date picker through to Step 1 (the draft
  already carries `promoCode`; confirm the date-picker screen forwards it).
- **Types** — consume shared `PublicCampaign`; retire the unused
  `PromoCard`/`dashboard.ts` type if nothing else references it (grep first).

## Out of scope (YAGNI)

- Conversion attribution (which redemptions came *through* a campaign tap).
- Per-event analytics history, unique-user counts, time-series / date-range CTR.
- A/B testing, targeting/segmentation, push notifications for campaigns.
- Post-payment placement of the carousel (Home only, per decision).
- Multiple targets per campaign; targets other than Package / PromoCode.

## Verification

Per repo memory (`local-dev-constraints`): no Docker/DB and no mobile Jest
harness locally. Verify via `pnpm typecheck` (backend + admin + mobile + shared)
and `pnpm test --filter=@nanny-app/backend` for the service + schema tests.
Migration SQL reviewed by hand before commit. Admin UI validated via the admin
dev server / preview screenshot where feasible; mobile carousel validated via the
`preview:web` screenshot workflow (`CampaignCarousel` wrapper in `__preview__/`).
