# Campaigns Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Campaigns module — admin CRUD + engagement counters for promotional cards that link to a Package or PromoCode, surfaced as a carousel on the parent mobile Home screen.

**Architecture:** Standard vertical slice, mirroring the Promo Codes / Packages modules: a shared Zod schema (`packages/shared`) → Prisma `Campaign` model → `campaign.service.ts` → admin `/admin/campaigns` routes + a mobile-facing `/campaigns` router (optional auth). Admin React app gets a Campaigns page (table + form, Firebase-Storage image upload). Mobile gets a `CampaignCarousel` on Home that records impressions/taps and deep-links to the target (package checkout, or the booking flow with the promo code prefilled via a tiny Zustand store).

**Tech Stack:** TypeScript (strict), Zod, Prisma/PostgreSQL, Express, React 19 + Vite + TanStack Query (admin), Expo React Native + TanStack Query + Zustand (mobile), Firebase Storage, Jest.

## Global Constraints

- **No `any`; strict TS** — `strict`, `noImplicitAny`, `noUncheckedIndexedAccess` all on. Guard indexed access.
- **Types inferred from Zod** in `packages/shared`; never duplicate type definitions. Use `import type`.
- **Naming** — files kebab-case; vars/functions camelCase; types/classes PascalCase; DB columns snake_case via `@map`; enums PascalCase in Prisma, snake_case DB via `@@map`.
- **Money/EGP** — single currency; `Decimal(10,2)` in DB (not relevant to Campaign itself, which has no money field).
- **Prisma** — every model has `created_at` / `updated_at` / `deleted_at`; **soft delete only** (never `delete()`); every read filters `deletedAt: null`; `Int @id @default(autoincrement())` for these catalog modules (per `2026-07-17-sequential-int-ids-design.md`).
- **Backend layering** — routes validate + call one service fn + return `ok(...)`; only services touch Prisma; errors thrown via `errors.*` (`AppError`), never `res.status().json()` outside the global handler.
- **Admin styling** — tokens only (CSS vars in `global.css`); reuse `@admin/components/ui`; server state via TanStack Query; HTTP via typed fns in `lib/api.ts`; errors via `apiErrorMessage`.
- **Mobile styling** — theme tokens only (`@mobile/theme`); each screen/component's `StyleSheet` in a dedicated `styles/*.ts` file; reuse `@mobile/components/ui`; API via `@mobile/lib/api` (`api` + `unwrap`); server state via TanStack Query; cross-screen UI state via Zustand.
- **Firebase Storage bucket** — `nanny-now-d8518.firebasestorage.app` (same project as mobile).
- **Local verification** (per `local-dev-constraints` memory): no Docker/DB and no mobile Jest harness locally. Verify with `pnpm typecheck` (each package) + `pnpm --filter @nanny-app/backend test`. `prisma generate` (`pnpm db:generate`) works offline and is required to give the client `prisma.campaign` types; `prisma migrate dev` runs where a DB exists.

---

## File Structure

**Create:**
- `packages/shared/src/campaign.ts` — Zod schemas + inferred types.
- `apps/backend/src/services/campaign.service.ts` — CRUD + live-list + counters.
- `apps/backend/src/routes/campaign.routes.ts` — mobile-facing `/campaigns` router.
- `apps/backend/src/__tests__/campaign.schema.test.ts` — schema refine tests.
- `apps/backend/src/__tests__/campaign.service.test.ts` — service unit tests.
- `apps/backend/prisma/migrations/<ts>_add_campaigns_table/migration.sql` — DDL.
- `apps/admin/src/lib/storage.ts` — Firebase image upload helper.
- `apps/admin/src/pages/campaigns-page.tsx`
- `apps/admin/src/features/campaigns/campaign-form.tsx`
- `apps/admin/src/features/campaigns/campaign-table.tsx`
- `apps/mobile/src/hooks/useCampaigns.ts`
- `apps/mobile/src/store/pendingPromoStore.ts`
- `apps/mobile/src/components/CampaignCarousel.tsx`
- `apps/mobile/src/components/styles/campaign-carousel.styles.ts`

**Modify:**
- `packages/shared/src/index.ts` — export `./campaign`.
- `apps/backend/prisma/schema.prisma` — enum + `Campaign` model + reverse relations on `Package`/`PromoCode`.
- `apps/backend/src/routes/admin.routes.ts` — imports + `/admin/campaigns` CRUD section.
- `apps/backend/src/routes/index.ts` — mount `campaignRouter` at `/campaigns`.
- `apps/admin/src/lib/firebase.ts` — add `storageBucket`.
- `apps/admin/src/lib/api.ts` — campaign endpoint fns + type imports.
- `apps/admin/src/components/ui/icon.tsx` — re-export `Megaphone`.
- `apps/admin/src/components/admin-layout.tsx` — nav item.
- `apps/admin/src/app.tsx` — route.
- `apps/mobile/src/lib/api.ts` — campaign endpoint fns (if a typed-fn layer is used) — otherwise the hook calls `api` directly.
- `apps/mobile/src/screens/parent/HomeScreen.tsx` — render `<CampaignCarousel />`.
- `apps/mobile/src/screens/parent/BookingStep1Screen.tsx` — prefill promo from the store.

---

## Task 1: Shared Zod schemas

**Files:**
- Create: `packages/shared/src/campaign.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/backend/src/__tests__/campaign.schema.test.ts` (runs under backend Jest, which imports `@nanny-app/shared` — mirrors `shared-package-schemas.test.ts`)

**Interfaces:**
- Produces: `CampaignSchema`, `CreateCampaignSchema`, `UpdateCampaignSchema`, `PublicCampaignSchema`, `CampaignTargetTypeSchema`, and types `Campaign`, `CreateCampaignInput`, `UpdateCampaignInput`, `PublicCampaign`, `CampaignTargetType`.

- [ ] **Step 1: Write the failing schema test**

Create `apps/backend/src/__tests__/campaign.schema.test.ts`:

```ts
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
} from '@nanny-app/shared';

describe('CreateCampaignSchema — exactly-one-target', () => {
  const base = {
    title: 'Summer offer',
    imageUrl: 'https://cdn.example.com/a.jpg',
  };

  it('accepts a PACKAGE campaign with only packageId', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PACKAGE',
      packageId: 3,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a PROMO_CODE campaign with only promoCodeId', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PROMO_CODE',
      promoCodeId: 7,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a PACKAGE campaign that also carries a promoCodeId', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PACKAGE',
      packageId: 3,
      promoCodeId: 7,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a PACKAGE campaign with no packageId', () => {
    const r = CreateCampaignSchema.safeParse({ ...base, targetType: 'PACKAGE' });
    expect(r.success).toBe(false);
  });

  it('rejects a PROMO_CODE campaign carrying packageId instead', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PROMO_CODE',
      packageId: 3,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-URL imageUrl', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      imageUrl: 'not-a-url',
      targetType: 'PACKAGE',
      packageId: 3,
    });
    expect(r.success).toBe(false);
  });

  it('rejects endsAt before startsAt', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PACKAGE',
      packageId: 3,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });
});

describe('UpdateCampaignSchema', () => {
  it('requires at least one field', () => {
    expect(UpdateCampaignSchema.safeParse({}).success).toBe(false);
  });

  it('allows a lone sortOrder change', () => {
    expect(UpdateCampaignSchema.safeParse({ sortOrder: 2 }).success).toBe(true);
  });

  it('rejects switching to PACKAGE while supplying a promoCodeId', () => {
    const r = UpdateCampaignSchema.safeParse({ targetType: 'PACKAGE', promoCodeId: 7 });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nanny-app/backend test campaign.schema`
Expected: FAIL — module `@nanny-app/shared` has no export `CreateCampaignSchema` (compile error / undefined).

- [ ] **Step 3: Create the shared schema file**

Create `packages/shared/src/campaign.ts`:

```ts
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Campaigns — admin-curated promo cards shown as a carousel on the
// parent Home screen. Each campaign links to exactly one target: a
// Package or a PromoCode. Tapping a card deep-links the parent to
// that target. Engagement is tracked with two counters (impressions,
// taps); "total usage" in the admin table comes from the linked
// target's own usage, not from campaign attribution.
// ──────────────────────────────────────────────────────────────

export const CampaignTargetTypeSchema = z.enum(['PACKAGE', 'PROMO_CODE']);
export type CampaignTargetType = z.infer<typeof CampaignTargetTypeSchema>;

/** Full admin DTO returned by the admin Campaigns endpoints. */
export const CampaignSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  targetType: CampaignTargetTypeSchema,
  packageId: z.number().int().nullable(),
  promoCodeId: z.number().int().nullable(),
  /** Resolved for display: the package name, or the promo code string. */
  targetName: z.string(),
  isActive: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  sortOrder: z.number().int(),
  impressionCount: z.number().int(),
  clickCount: z.number().int(),
  /** The linked target's own cumulative usage (promo redemptions / paid package purchases). */
  targetUsageCount: z.number().int(),
  createdAt: z.string(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

// Exactly one target id, consistent with targetType.
function oneTargetMatchesType(v: {
  targetType?: CampaignTargetType;
  packageId?: number | null;
  promoCodeId?: number | null;
}): boolean {
  if (v.targetType === 'PACKAGE') {
    return v.packageId != null && v.promoCodeId == null;
  }
  if (v.targetType === 'PROMO_CODE') {
    return v.promoCodeId != null && v.packageId == null;
  }
  return true; // targetType not being set is handled elsewhere (create requires it)
}

export const CreateCampaignSchema = z
  .object({
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
  })
  .refine(oneTargetMatchesType, {
    message: 'Set exactly one target matching targetType (packageId for PACKAGE, promoCodeId for PROMO_CODE).',
    path: ['targetType'],
  })
  .refine(
    (v) => !(v.startsAt && v.endsAt) || new Date(v.endsAt) > new Date(v.startsAt),
    { message: 'endsAt must be after startsAt', path: ['endsAt'] },
  );
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    subtitle: z.string().trim().max(200).nullable().optional(),
    imageUrl: z.string().url().optional(),
    targetType: CampaignTargetTypeSchema.optional(),
    packageId: z.number().int().positive().nullable().optional(),
    promoCodeId: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  })
  // When targetType is being set, the accompanying id must match it.
  .refine((v) => v.targetType === undefined || oneTargetMatchesType(v), {
    message: 'When changing targetType, set exactly the matching target id.',
    path: ['targetType'],
  });
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

// ── Mobile-facing carousel DTO ─────────────────────────────────
export const PublicCampaignSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  targetType: CampaignTargetTypeSchema,
  /** Set for PACKAGE campaigns — the package to open at checkout. */
  packageId: z.number().int().nullable(),
  /** Set for PROMO_CODE campaigns — the code to prefill in the booking flow. */
  promoCode: z.string().nullable(),
});
export type PublicCampaign = z.infer<typeof PublicCampaignSchema>;
```

- [ ] **Step 4: Export from the shared barrel**

In `packages/shared/src/index.ts`, add after the `./package` line:

```ts
export * from './campaign';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @nanny-app/backend test campaign.schema`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck shared**

Run: `pnpm --filter @nanny-app/shared typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/campaign.ts packages/shared/src/index.ts apps/backend/src/__tests__/campaign.schema.test.ts
git commit -m "feat(shared): add campaign zod schemas"
```

---

## Task 2: Prisma model + migration

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (add enum, `Campaign` model, reverse relations on `Package` and `PromoCode`)
- Create: `apps/backend/prisma/migrations/<timestamp>_add_campaigns_table/migration.sql`

**Interfaces:**
- Produces: Prisma client model `prisma.campaign` with fields `id, title, subtitle, imageUrl, targetType, packageId, promoCodeId, isActive, startsAt, endsAt, sortOrder, impressionCount, clickCount, createdAt, updatedAt, deletedAt` and relations `package`, `promoCode`.

- [ ] **Step 1: Add the enum and model to `schema.prisma`**

Add near the other enums (after `enum DiscountType { … }`):

```prisma
enum CampaignTargetType {
  PACKAGE
  PROMO_CODE

  @@map("campaign_target_type")
}
```

Add a new model (place it after the `PromoCode` model):

```prisma
/// Admin-curated promotional card shown as a carousel on the parent Home
/// screen. Links to exactly one target — a Package or a PromoCode — enforced
/// at the service + shared-schema layer. Engagement counters are incremented
/// atomically; "total usage" for the admin table is read from the target.
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

- [ ] **Step 2: Add reverse relation fields**

In `model Package { … }`, add alongside `purchases PackagePurchase[]`:

```prisma
  campaigns Campaign[]
```

In `model PromoCode { … }`, add alongside `bookings Booking[]`:

```prisma
  campaigns Campaign[]
```

- [ ] **Step 3: Regenerate the Prisma client (offline — no DB needed)**

Run: `pnpm --filter @nanny-app/backend db:generate`
Expected: "Generated Prisma Client" — `prisma.campaign` now exists on the client type.

- [ ] **Step 4: Create the migration**

If a database is reachable, run (auto-creates the timestamped folder + SQL):

```bash
pnpm --filter @nanny-app/backend db:migrate:dev --name add_campaigns_table
```

If no DB is available locally, hand-create `apps/backend/prisma/migrations/20260804000000_add_campaigns_table/migration.sql` with:

```sql
-- CreateEnum
CREATE TYPE "campaign_target_type" AS ENUM ('PACKAGE', 'PROMO_CODE');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "image_url" TEXT NOT NULL,
    "target_type" "campaign_target_type" NOT NULL,
    "package_id" INTEGER,
    "promo_code_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "impression_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_deleted_at_idx" ON "campaigns"("deleted_at");
CREATE INDEX "campaigns_is_active_sort_order_idx" ON "campaigns"("is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

(`migrate dev` in a DB environment will apply/verify this identically.)

- [ ] **Step 5: Typecheck backend to confirm the client picked up `Campaign`**

Run: `pnpm --filter @nanny-app/backend typecheck`
Expected: exit 0 (no errors about `prisma.campaign`). If the schema/service task order means the service doesn't exist yet, this only confirms the schema compiles — that's fine.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations
git commit -m "feat(backend): add Campaign model + migration"
```

---

## Task 3: Backend service

**Files:**
- Create: `apps/backend/src/services/campaign.service.ts`
- Test: `apps/backend/src/__tests__/campaign.service.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@backend/db/prisma`), `errors` (`@backend/lib/errors`), shared types from Task 1.
- Produces:
  - `listCampaigns(): Promise<Campaign[]>`
  - `createCampaign(input: CreateCampaignInput): Promise<Campaign>`
  - `updateCampaign(id: number, input: UpdateCampaignInput): Promise<Campaign>`
  - `deleteCampaign(id: number): Promise<{ id: number }>`
  - `listLiveCampaigns(): Promise<PublicCampaign[]>`
  - `recordImpression(id: number): Promise<void>`
  - `recordClick(id: number): Promise<void>`

- [ ] **Step 1: Write the failing service test**

Create `apps/backend/src/__tests__/campaign.service.test.ts`:

```ts
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    campaign: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    package: { findFirst: jest.fn() },
    promoCode: { findFirst: jest.fn() },
    packagePurchase: { groupBy: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  listLiveCampaigns,
  recordClick,
  recordImpression,
  updateCampaign,
} from '@backend/services/campaign.service';

const mockPrisma = prisma as unknown as {
  campaign: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  package: { findFirst: jest.Mock };
  promoCode: { findFirst: jest.Mock };
  packagePurchase: { groupBy: jest.Mock };
};

const activePackage = { id: 3, name: 'Starter', isActive: true, deletedAt: null, expiresAt: null, usageCount: 0 };
const activePromo = { id: 7, code: 'WELCOME10', isActive: true, deletedAt: null, expiresAt: null, usageCount: 12 };

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Summer offer',
    subtitle: null,
    imageUrl: 'https://cdn/x.jpg',
    targetType: 'PROMO_CODE',
    packageId: null,
    promoCodeId: 7,
    isActive: true,
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    impressionCount: 0,
    clickCount: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    package: null,
    promoCode: { ...activePromo },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.packagePurchase.groupBy.mockResolvedValue([]);
});

describe('createCampaign', () => {
  it('creates a PROMO_CODE campaign when the promo is active', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(activePromo);
    mockPrisma.campaign.create.mockResolvedValue(campaignRow());

    const result = await createCampaign({
      title: 'Summer offer',
      imageUrl: 'https://cdn/x.jpg',
      targetType: 'PROMO_CODE',
      promoCodeId: 7,
      isActive: true,
      sortOrder: 0,
    });

    expect(result.targetName).toBe('WELCOME10');
    expect(result.promoCodeId).toBe(7);
    expect(mockPrisma.campaign.create).toHaveBeenCalled();
  });

  it('throws notFound (404) when the promo target does not exist', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(null);
    await expect(
      createCampaign({
        title: 'x', imageUrl: 'https://cdn/x.jpg', targetType: 'PROMO_CODE', promoCodeId: 99, isActive: true, sortOrder: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws badRequest (400) when the package target is inactive', async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ ...activePackage, isActive: false });
    await expect(
      createCampaign({
        title: 'x', imageUrl: 'https://cdn/x.jpg', targetType: 'PACKAGE', packageId: 3, isActive: true, sortOrder: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('updateCampaign', () => {
  it('throws notFound (404) when the campaign is missing', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);
    await expect(updateCampaign(1, { title: 'new' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('re-validates the target when target fields change', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(campaignRow());
    mockPrisma.package.findFirst.mockResolvedValue(activePackage);
    mockPrisma.campaign.update.mockResolvedValue(
      campaignRow({ targetType: 'PACKAGE', packageId: 3, promoCodeId: null, package: activePackage, promoCode: null }),
    );

    const result = await updateCampaign(1, { targetType: 'PACKAGE', packageId: 3 });
    expect(mockPrisma.package.findFirst).toHaveBeenCalled();
    expect(result.targetName).toBe('Starter');
  });
});

describe('deleteCampaign', () => {
  it('soft-deletes an existing campaign', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(campaignRow());
    mockPrisma.campaign.update.mockResolvedValue(campaignRow());
    const r = await deleteCampaign(1);
    expect(r).toEqual({ id: 1 });
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
  });
});

describe('listCampaigns', () => {
  it('resolves targetName and targetUsageCount (promo → usageCount)', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([campaignRow()]);
    const [row] = await listCampaigns();
    expect(row?.targetName).toBe('WELCOME10');
    expect(row?.targetUsageCount).toBe(12);
  });

  it('resolves package usage from grouped purchase counts', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([
      campaignRow({ targetType: 'PACKAGE', packageId: 3, promoCodeId: null, package: activePackage, promoCode: null }),
    ]);
    mockPrisma.packagePurchase.groupBy.mockResolvedValue([{ packageId: 3, _count: { _all: 5 } }]);
    const [row] = await listCampaigns();
    expect(row?.targetName).toBe('Starter');
    expect(row?.targetUsageCount).toBe(5);
  });
});

describe('listLiveCampaigns', () => {
  it('maps a promo campaign to its code and drops dead-target rows', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([
      campaignRow(),
      campaignRow({ id: 2, promoCode: { ...activePromo, id: 8, isActive: false } }),
    ]);
    const result = await listLiveCampaigns();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 1, promoCode: 'WELCOME10', packageId: null });
  });

  it('maps a package campaign to its packageId', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([
      campaignRow({ targetType: 'PACKAGE', packageId: 3, promoCodeId: null, package: activePackage, promoCode: null }),
    ]);
    const result = await listLiveCampaigns();
    expect(result[0]).toMatchObject({ packageId: 3, promoCode: null });
  });
});

describe('counters', () => {
  it('recordImpression increments impressionCount', async () => {
    mockPrisma.campaign.update.mockResolvedValue({});
    await recordImpression(1);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { impressionCount: { increment: 1 } },
    });
  });

  it('recordClick swallows a not-found update', async () => {
    mockPrisma.campaign.update.mockRejectedValue(new Error('Record to update not found.'));
    await expect(recordClick(999)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nanny-app/backend test campaign.service`
Expected: FAIL — `campaign.service` module not found.

- [ ] **Step 3: Implement the service**

Create `apps/backend/src/services/campaign.service.ts`:

```ts
import { PackagePurchaseStatus, type Prisma } from '@prisma/client';

import type {
  Campaign,
  CampaignTargetType,
  CreateCampaignInput,
  PublicCampaign,
  UpdateCampaignInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type TargetPackage = { id: number; name: string; isActive: boolean; deletedAt: Date | null; expiresAt: Date | null } | null;
type TargetPromo = { id: number; code: string; isActive: boolean; deletedAt: Date | null; expiresAt: Date | null; usageCount: number } | null;

type CampaignRow = {
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  targetType: CampaignTargetType;
  packageId: number | null;
  promoCodeId: number | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  sortOrder: number;
  impressionCount: number;
  clickCount: number;
  createdAt: Date;
  package: TargetPackage;
  promoCode: TargetPromo;
};

const includeTargets = { package: true, promoCode: true } as const;

function targetName(row: CampaignRow): string {
  if (row.targetType === 'PACKAGE') return row.package?.name ?? '(deleted package)';
  return row.promoCode?.code ?? '(deleted promo code)';
}

function toDto(row: CampaignRow, packageUsage: Map<number, number>): Campaign {
  const targetUsageCount =
    row.targetType === 'PROMO_CODE'
      ? row.promoCode?.usageCount ?? 0
      : (row.packageId != null ? packageUsage.get(row.packageId) ?? 0 : 0);
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.imageUrl,
    targetType: row.targetType,
    packageId: row.packageId,
    promoCodeId: row.promoCodeId,
    targetName: targetName(row),
    isActive: row.isActive,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    sortOrder: row.sortOrder,
    impressionCount: row.impressionCount,
    clickCount: row.clickCount,
    targetUsageCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Batch-count paid purchases for the package-target campaigns in one query. */
async function packageUsageFor(rows: CampaignRow[]): Promise<Map<number, number>> {
  const ids = rows
    .filter((r) => r.targetType === 'PACKAGE' && r.packageId != null)
    .map((r) => r.packageId as number);
  if (ids.length === 0) return new Map();
  const grouped = await prisma.packagePurchase.groupBy({
    by: ['packageId'],
    where: { packageId: { in: ids }, deletedAt: null, status: { not: PackagePurchaseStatus.PENDING_PAYMENT } },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.packageId, g._count._all]));
}

/** Validate the chosen target exists, is active and undeleted, matching targetType. */
async function assertTargetUsable(
  targetType: CampaignTargetType,
  packageId: number | null | undefined,
  promoCodeId: number | null | undefined,
): Promise<void> {
  if (targetType === 'PACKAGE') {
    const pkg = await prisma.package.findFirst({ where: { id: packageId ?? -1, deletedAt: null } });
    if (!pkg) throw errors.notFound('Linked package not found');
    if (!pkg.isActive) throw errors.badRequest('Linked package is inactive');
    return;
  }
  const promo = await prisma.promoCode.findFirst({ where: { id: promoCodeId ?? -1, deletedAt: null } });
  if (!promo) throw errors.notFound('Linked promo code not found');
  if (!promo.isActive) throw errors.badRequest('Linked promo code is inactive');
}

export async function listCampaigns(): Promise<Campaign[]> {
  const rows = (await prisma.campaign.findMany({
    where: { deletedAt: null },
    include: includeTargets,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as CampaignRow[];
  const usage = await packageUsageFor(rows);
  return rows.map((r) => toDto(r, usage));
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  await assertTargetUsable(input.targetType, input.packageId, input.promoCodeId);
  const row = (await prisma.campaign.create({
    data: {
      title: input.title,
      subtitle: input.subtitle ?? null,
      imageUrl: input.imageUrl,
      targetType: input.targetType,
      packageId: input.targetType === 'PACKAGE' ? input.packageId ?? null : null,
      promoCodeId: input.targetType === 'PROMO_CODE' ? input.promoCodeId ?? null : null,
      isActive: input.isActive,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      sortOrder: input.sortOrder,
    },
    include: includeTargets,
  })) as unknown as CampaignRow;
  const usage = await packageUsageFor([row]);
  return toDto(row, usage);
}

export async function updateCampaign(id: number, input: UpdateCampaignInput): Promise<Campaign> {
  const existing = (await prisma.campaign.findFirst({
    where: { id, deletedAt: null },
    include: includeTargets,
  })) as unknown as CampaignRow | null;
  if (!existing) throw errors.notFound('Campaign not found');

  // Re-validate the target when targetType or either id is being changed.
  const nextType = input.targetType ?? existing.targetType;
  const targetChanged =
    input.targetType !== undefined ||
    input.packageId !== undefined ||
    input.promoCodeId !== undefined;
  if (targetChanged) {
    const nextPackageId = nextType === 'PACKAGE' ? input.packageId ?? existing.packageId : null;
    const nextPromoId = nextType === 'PROMO_CODE' ? input.promoCodeId ?? existing.promoCodeId : null;
    await assertTargetUsable(nextType, nextPackageId, nextPromoId);
  }

  const data: Prisma.CampaignUpdateInput = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.subtitle !== undefined && { subtitle: input.subtitle ?? null }),
    ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.startsAt !== undefined && { startsAt: input.startsAt ? new Date(input.startsAt) : null }),
    ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
    ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
  };
  if (targetChanged) {
    data.targetType = nextType;
    data.package = nextType === 'PACKAGE' && (input.packageId ?? existing.packageId) != null
      ? { connect: { id: (input.packageId ?? existing.packageId) as number } }
      : { disconnect: true };
    data.promoCode = nextType === 'PROMO_CODE' && (input.promoCodeId ?? existing.promoCodeId) != null
      ? { connect: { id: (input.promoCodeId ?? existing.promoCodeId) as number } }
      : { disconnect: true };
  }

  const row = (await prisma.campaign.update({
    where: { id },
    data,
    include: includeTargets,
  })) as unknown as CampaignRow;
  const usage = await packageUsageFor([row]);
  return toDto(row, usage);
}

export async function deleteCampaign(id: number): Promise<{ id: number }> {
  const existing = await prisma.campaign.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Campaign not found');
  await prisma.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/** True when the campaign's linked target is itself usable (active, undeleted, unexpired). */
function targetLive(row: CampaignRow, now: Date): boolean {
  const t = row.targetType === 'PACKAGE' ? row.package : row.promoCode;
  if (!t) return false;
  if (!t.isActive || t.deletedAt != null) return false;
  if (t.expiresAt != null && t.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

function toPublicDto(row: CampaignRow): PublicCampaign {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.imageUrl,
    targetType: row.targetType,
    packageId: row.targetType === 'PACKAGE' ? row.packageId : null,
    promoCode: row.targetType === 'PROMO_CODE' ? row.promoCode?.code ?? null : null,
  };
}

export async function listLiveCampaigns(): Promise<PublicCampaign[]> {
  const now = new Date();
  const rows = (await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include: includeTargets,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as CampaignRow[];
  return rows.filter((r) => targetLive(r, now)).map(toPublicDto);
}

async function bumpCounter(id: number, field: 'impressionCount' | 'clickCount'): Promise<void> {
  try {
    await prisma.campaign.update({ where: { id }, data: { [field]: { increment: 1 } } });
  } catch {
    // Best-effort: a tap on a since-deleted campaign must not error the client.
  }
}

export async function recordImpression(id: number): Promise<void> {
  await bumpCounter(id, 'impressionCount');
}

export async function recordClick(id: number): Promise<void> {
  await bumpCounter(id, 'clickCount');
}
```

> Note: the `recordImpression` test asserts `update` is called with the exact `{ increment: 1 }` shape — the computed-key `{ [field]: { increment: 1 } }` produces exactly `{ impressionCount: { increment: 1 } }`. Confirm `PackagePurchaseStatus` is exported by `@prisma/client` after `db:generate`; if the enum name differs, use the string literal `'PENDING_PAYMENT'` in the `groupBy` where.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nanny-app/backend test campaign.service`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck backend**

Run: `pnpm --filter @nanny-app/backend typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/campaign.service.ts apps/backend/src/__tests__/campaign.service.test.ts
git commit -m "feat(backend): campaign service (CRUD, live list, counters)"
```

---

## Task 4: Backend routes

**Files:**
- Modify: `apps/backend/src/routes/admin.routes.ts`
- Create: `apps/backend/src/routes/campaign.routes.ts`
- Modify: `apps/backend/src/routes/index.ts`

**Interfaces:**
- Consumes: service fns from Task 3; `validateBody`, `routeIdParam`, `ok`, `optionalAuth`.
- Produces HTTP: `GET/POST /admin/campaigns`, `PATCH/DELETE /admin/campaigns/:id`; `GET /campaigns`, `POST /campaigns/:id/impression`, `POST /campaigns/:id/click`.

- [ ] **Step 1: Add the admin routes**

In `apps/backend/src/routes/admin.routes.ts`, add to the shared-schema import block:

```ts
  CreateCampaignSchema,
  UpdateCampaignSchema,
```

Add a service import block near the other service imports:

```ts
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  updateCampaign,
} from '@backend/services/campaign.service';
```

Add a new section after the Promo codes section (after line ~513):

```ts
// ── Campaigns (Home-screen promo carousel) ─────────────────────

adminRouter.get('/campaigns', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listCampaigns()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/campaigns',
  validateBody(CreateCampaignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createCampaign(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/campaigns/:id',
  validateBody(UpdateCampaignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateCampaign(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete('/campaigns/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await deleteCampaign(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Create the mobile-facing router**

Create `apps/backend/src/routes/campaign.routes.ts`:

```ts
import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { routeIdParam } from '@backend/lib/route-param';
import { optionalAuth } from '@backend/middleware/auth.middleware';
import {
  listLiveCampaigns,
  recordClick,
  recordImpression,
} from '@backend/services/campaign.service';

export const campaignRouter = Router();

// Home is visible to guests, so campaigns are readable + trackable without auth.
campaignRouter.use(optionalAuth);

campaignRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listLiveCampaigns()));
  } catch (err) {
    next(err);
  }
});

campaignRouter.post('/:id/impression', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await recordImpression(routeIdParam(req.params.id));
    res.json(ok({ recorded: true }));
  } catch (err) {
    next(err);
  }
});

campaignRouter.post('/:id/click', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await recordClick(routeIdParam(req.params.id));
    res.json(ok({ recorded: true }));
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Mount the router**

In `apps/backend/src/routes/index.ts`, add the import (alphabetical, after `bookingRouter`):

```ts
import { campaignRouter } from './campaign.routes';
```

And mount it alongside the other public routers:

```ts
apiRouter.use('/campaigns', campaignRouter);
```

- [ ] **Step 4: Typecheck backend**

Run: `pnpm --filter @nanny-app/backend typecheck`
Expected: exit 0.

- [ ] **Step 5: Run the full backend test suite (nothing regressed)**

Run: `pnpm --filter @nanny-app/backend test`
Expected: PASS, coverage gate (80%) still green.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/admin.routes.ts apps/backend/src/routes/campaign.routes.ts apps/backend/src/routes/index.ts
git commit -m "feat(backend): campaign admin + public routes"
```

---

## Task 5: Admin — Firebase Storage upload + API layer

**Files:**
- Modify: `apps/admin/src/lib/firebase.ts`
- Create: `apps/admin/src/lib/storage.ts`
- Modify: `apps/admin/src/lib/api.ts`

**Interfaces:**
- Produces: `uploadImageToFirebase(file: File, folder: string): Promise<string>`; and admin API fns `fetchCampaigns`, `createCampaign`, `updateCampaign`, `deleteCampaign`.

- [ ] **Step 1: Add the storage bucket to the admin Firebase config**

In `apps/admin/src/lib/firebase.ts`, add to `firebaseConfig` and export storage:

```ts
import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Same Firebase project as the mobile app (see apps/mobile/app.config.ts).
// Values are public client identifiers, overridable per environment.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyC3eB2qrs8KVEPu5ny8J9sBAPcLbvWnuL8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'nanny-now-d8518.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'nanny-now-d8518',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'nanny-now-d8518.firebasestorage.app',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const firebaseStorage = getStorage(app);
```

- [ ] **Step 2: Create the upload helper**

Create `apps/admin/src/lib/storage.ts`:

```ts
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { firebaseAuth, firebaseStorage } from './firebase';

/**
 * Upload a File selected in the admin browser to Firebase Storage and return
 * its public download URL. Mirrors the mobile app's uploadImageToFirebase.
 * Files land under `<folder>/<uid>/<timestamp>-<random>.<ext>`.
 */
export async function uploadImageToFirebase(file: File, folder: string): Promise<string> {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');

  const ext = inferExtension(file.name, file.type);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const objectRef = ref(firebaseStorage, `${folder}/${uid}/${filename}`);

  await uploadBytes(objectRef, file, { contentType: file.type || `image/${ext}` });
  return getDownloadURL(objectRef);
}

function inferExtension(name: string, mimeType: string): string {
  const fromMime = mimeType.startsWith('image/') ? mimeType.split('/')[1] : null;
  if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  const match = name.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() ?? 'jpg';
}
```

> Firebase Storage security rules must allow authenticated admin writes to `campaigns/`. If uploads fail with `storage/unauthorized`, add a rule (infra) permitting `request.auth != null` writes under `campaigns/{uid}/…`. Flag this to the maintainer — it is a console/infra change, not code in this repo.

- [ ] **Step 3: Add the campaign API functions**

In `apps/admin/src/lib/api.ts`, add to the `@nanny-app/shared` type import block:

```ts
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput,
```

Add a new section (near the Promo codes / Packages fns):

```ts
// ── Campaigns (Home-screen promo carousel) ─────────────────────

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await apiClient.get<ApiEnvelope<Campaign[]>>('/admin/campaigns');
  return res.data.data;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const res = await apiClient.post<ApiEnvelope<Campaign>>('/admin/campaigns', input);
  return res.data.data;
}

export async function updateCampaign(id: number, input: UpdateCampaignInput): Promise<Campaign> {
  const res = await apiClient.patch<ApiEnvelope<Campaign>>(`/admin/campaigns/${id}`, input);
  return res.data.data;
}

export async function deleteCampaign(id: number): Promise<void> {
  await apiClient.delete(`/admin/campaigns/${id}`);
}
```

- [ ] **Step 4: Typecheck admin**

Run: `pnpm --filter @nanny-app/admin typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/firebase.ts apps/admin/src/lib/storage.ts apps/admin/src/lib/api.ts
git commit -m "feat(admin): firebase storage upload + campaign api"
```

---

## Task 6: Admin — Campaigns page (form, table, nav)

**Files:**
- Modify: `apps/admin/src/components/ui/icon.tsx`
- Create: `apps/admin/src/features/campaigns/campaign-form.tsx`
- Create: `apps/admin/src/features/campaigns/campaign-table.tsx`
- Create: `apps/admin/src/pages/campaigns-page.tsx`
- Modify: `apps/admin/src/components/admin-layout.tsx`
- Modify: `apps/admin/src/app.tsx`

**Interfaces:**
- Consumes: `fetchCampaigns/createCampaign/updateCampaign/deleteCampaign`, `fetchPackages`, `fetchPromoCodes`, `uploadImageToFirebase`, shared `Campaign`/`CampaignTargetType`, `@admin/components/ui`.

- [ ] **Step 1: Re-export the Megaphone icon**

In `apps/admin/src/components/ui/icon.tsx`, add `Megaphone` to the Navigation group of the lucide re-export:

```ts
  Package,
  Megaphone,
  Video,
```

- [ ] **Step 2: Create the campaign form**

Create `apps/admin/src/features/campaigns/campaign-form.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { CreateCampaignSchema, type CampaignTargetType } from '@nanny-app/shared';

import { Button, Card, Feedback, Field, Select } from '@admin/components/ui';
import { createCampaign, fetchPackages, fetchPromoCodes } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { uploadImageToFirebase } from '@admin/lib/storage';

export function CampaignForm() {
  const queryClient = useQueryClient();
  const packages = useQuery({ queryKey: ['packages'], queryFn: fetchPackages });
  const promoCodes = useQuery({ queryKey: ['promo-codes'], queryFn: fetchPromoCodes });

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [targetType, setTargetType] = useState<CampaignTargetType>('PACKAGE');
  const [packageId, setPackageId] = useState<number | null>(null);
  const [promoCodeId, setPromoCodeId] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      setTitle('');
      setSubtitle('');
      setImageUrl('');
      setPackageId(null);
      setPromoCodeId(null);
      setStartsAt('');
      setEndsAt('');
      setSortOrder('0');
      setIsActive(true);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const url = await uploadImageToFirebase(file, 'campaigns');
      setImageUrl(url);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateCampaignSchema.safeParse({
      title: title.trim(),
      subtitle: subtitle.trim() ? subtitle.trim() : undefined,
      imageUrl,
      targetType,
      packageId: targetType === 'PACKAGE' ? packageId ?? undefined : undefined,
      promoCodeId: targetType === 'PROMO_CODE' ? promoCodeId ?? undefined : undefined,
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      sortOrder: Number(sortOrder) || 0,
      isActive,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    createMutation.mutate(parsed.data);
  }

  const packageOptions = (packages.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const promoOptions = (promoCodes.data ?? []).map((c) => ({ value: c.id, label: c.code }));

  return (
    <Card title="Create campaign">
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Summer sale" required />
          </Field>
          <Field label="Subtitle" hint="Optional line under the title.">
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Save on prepaid hours" />
          </Field>
          <Field label="Image" hint="Required. Uploaded to Firebase Storage.">
            <input type="file" accept="image/*" onChange={handleImage} />
          </Field>
          {imageUrl && (
            <div className="field">
              <span className="field-label">Preview</span>
              <img src={imageUrl} alt="Campaign preview" style={{ maxWidth: 160, borderRadius: 8 }} />
            </div>
          )}
          <div className="field">
            <span className="field-label">Links to</span>
            <Select
              value={targetType}
              options={[
                { value: 'PACKAGE', label: 'Package' },
                { value: 'PROMO_CODE', label: 'Promo code' },
              ]}
              onChange={(value) => setTargetType(value as CampaignTargetType)}
            />
          </div>
          {targetType === 'PACKAGE' ? (
            <div className="field">
              <span className="field-label">Package</span>
              <Select<number>
                value={packageId ?? 0}
                options={[{ value: 0, label: 'Select a package…' }, ...packageOptions]}
                onChange={(value) => setPackageId(value === 0 ? null : value)}
              />
            </div>
          ) : (
            <div className="field">
              <span className="field-label">Promo code</span>
              <Select<number>
                value={promoCodeId ?? 0}
                options={[{ value: 0, label: 'Select a promo code…' }, ...promoOptions]}
                onChange={(value) => setPromoCodeId(value === 0 ? null : value)}
              />
            </div>
          )}
          <Field label="Starts at" hint="Optional. Leave empty to start immediately.">
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends at" hint="Optional. Leave empty for no end date.">
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <Field label="Sort order" hint="Lower shows first in the carousel.">
            <input type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
          <div className="field">
            <span className="field-label">Status</span>
            <Select
              value={isActive ? 'active' : 'paused'}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
              ]}
              onChange={(value) => setIsActive(value === 'active')}
            />
          </div>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <Button type="submit" disabled={createMutation.isPending || uploading || !imageUrl}>
          {uploading ? 'Uploading…' : createMutation.isPending ? 'Creating…' : 'Create campaign'}
        </Button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 3: Create the campaign table**

Create `apps/admin/src/features/campaigns/campaign-table.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Campaign } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Check,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Power,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteCampaign, updateCampaign } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type CampaignTableProps = {
  campaigns: Campaign[];
};

type Status = { label: string; tone: 'success' | 'neutral' | 'warning' };

function campaignStatus(c: Campaign): Status {
  if (!c.isActive) return { label: 'Off', tone: 'neutral' };
  const now = Date.now();
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: 'Scheduled', tone: 'warning' };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: 'Expired', tone: 'neutral' };
  return { label: 'Active', tone: 'success' };
}

export function CampaignTable({ campaigns }: CampaignTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState<Campaign | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['campaigns'] });

  const toggleMutation = useMutation({
    mutationFn: (c: Campaign) => updateCampaign(c.id, { isActive: !c.isActive }),
    onSuccess: (updated) => {
      invalidate();
      toast.success(updated.isActive ? 'Campaign activated' : 'Campaign paused', updated.title);
    },
    onError: (err) => toast.error('Couldn’t update campaign', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Campaign deleted');
    },
    onError: (err) => toast.error('Couldn’t delete campaign', apiErrorMessage(err)),
  });

  const columns: Column<Campaign>[] = [
    {
      key: 'image',
      header: '',
      render: (c) => (
        <img src={c.imageUrl} alt="" style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 6 }} />
      ),
    },
    { key: 'title', header: 'Title', render: (c) => c.title },
    {
      key: 'target',
      header: 'Target',
      render: (c) => (
        <span>
          <Badge tone="neutral">{c.targetType === 'PACKAGE' ? 'Package' : 'Promo'}</Badge> {c.targetName}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const s = campaignStatus(c);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: 'impressions', header: 'Impressions', align: 'right', render: (c) => c.impressionCount },
    { key: 'taps', header: 'Taps', align: 'right', render: (c) => c.clickCount },
    { key: 'usage', header: 'Total usage', align: 'right', render: (c) => c.targetUsageCount },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <ActionMenu label={`Actions for campaign ${c.title}`}>
          <MenuItem
            icon={c.isActive ? <Power size={ICON_SIZE.menu} /> : <Check size={ICON_SIZE.menu} />}
            disabled={toggleMutation.isPending}
            onSelect={() => toggleMutation.mutate(c)}
          >
            {c.isActive ? 'Pause' : 'Activate'}
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(c)}>
            Delete
          </MenuItem>
        </ActionMenu>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={campaigns}
        rowKey={(c) => c.id}
        empty="No campaigns yet — create the first one above."
      />

      {deleting && (
        <ConfirmDialog
          title="Delete campaign"
          message={`Delete “${deleting.title}”? It will disappear from the app carousel. This can’t be undone.`}
          confirmLabel="Delete campaign"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
```

> Verified: `Badge` tone accepts `'neutral' | 'success' | 'danger' | 'warning'`, and `MenuSeparator` + `type Column` are exported from `@admin/components/ui`.

- [ ] **Step 4: Create the page**

Create `apps/admin/src/pages/campaigns-page.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';

import { ErrorState, PageHeader, StaleRefreshBanner, TableSkeleton } from '@admin/components/ui';
import { CampaignForm } from '@admin/features/campaigns/campaign-form';
import { CampaignTable } from '@admin/features/campaigns/campaign-table';
import { fetchCampaigns } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function CampaignsPage() {
  const { data: campaigns, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  return (
    <section>
      <PageHeader
        title="Campaigns"
        subtitle="Promotional cards shown as a carousel on the parent Home screen."
      />
      <CampaignForm />
      {isLoading && <TableSkeleton columns={8} />}
      {error != null && !campaigns && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {campaigns && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <CampaignTable campaigns={campaigns} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Add the nav item**

In `apps/admin/src/components/admin-layout.tsx`, add `Megaphone` to the `ui` import list, then add to `navItems` (after Promo Codes):

```ts
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
```

- [ ] **Step 6: Register the route**

In `apps/admin/src/app.tsx`, add the import:

```ts
import { CampaignsPage } from './pages/campaigns-page';
```

And the route (after the `promo-codes` route):

```tsx
              <Route path="campaigns" element={<CampaignsPage />} />
```

- [ ] **Step 7: Typecheck admin + build**

Run: `pnpm --filter @nanny-app/admin typecheck`
Expected: exit 0.

- [ ] **Step 8: Visual smoke check (preview)**

Start the admin dev server (preview_start with the admin launch config or `pnpm --filter @nanny-app/admin dev`), sign in, open `/campaigns`. Confirm the form renders, the package/promo dropdown swaps with the "Links to" selector, and the empty table shows its empty copy. Screenshot for the reviewer. (No DB locally means create/list may error against the API — verifying render + the target-selector swap is sufficient here.)

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/components/ui/icon.tsx apps/admin/src/features/campaigns apps/admin/src/pages/campaigns-page.tsx apps/admin/src/components/admin-layout.tsx apps/admin/src/app.tsx
git commit -m "feat(admin): campaigns page (form, table, nav)"
```

---

## Task 7: Mobile — API hook + pending-promo store

**Files:**
- Create: `apps/mobile/src/hooks/useCampaigns.ts`
- Create: `apps/mobile/src/store/pendingPromoStore.ts`

**Interfaces:**
- Consumes: `api`, `unwrap` (`@mobile/lib/api`); shared `PublicCampaign`.
- Produces:
  - `useActiveCampaigns()` → TanStack query of `PublicCampaign[]`
  - `useTrackImpression()` / `useTrackClick()` → mutations taking `campaignId: number`
  - `usePendingPromoStore` with `{ pendingPromoCode: string | null, setPendingPromoCode(code), clear() }`

- [ ] **Step 1: Create the pending-promo store**

Create `apps/mobile/src/store/pendingPromoStore.ts`:

```ts
import { create } from 'zustand';

/**
 * A promo code handed off from a campaign tap to the booking flow. The carousel
 * sets it, and BookingStep1Screen reads it once on mount to prefill the promo
 * field, then clears it so it never leaks into a later, unrelated booking.
 */
type PendingPromoState = {
  pendingPromoCode: string | null;
  setPendingPromoCode: (code: string) => void;
  clear: () => void;
};

export const usePendingPromoStore = create<PendingPromoState>((set) => ({
  pendingPromoCode: null,
  setPendingPromoCode: (pendingPromoCode) => set({ pendingPromoCode }),
  clear: () => set({ pendingPromoCode: null }),
}));
```

- [ ] **Step 2: Create the campaigns hook**

Create `apps/mobile/src/hooks/useCampaigns.ts`:

```ts
import type { PublicCampaign } from '@nanny-app/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';

export const CAMPAIGNS_KEY = 'campaigns';

export function useActiveCampaigns() {
  return useQuery({
    queryKey: [CAMPAIGNS_KEY, 'list'],
    queryFn: () => unwrap<PublicCampaign[]>(api.get('/campaigns')),
    staleTime: 60_000,
  });
}

export function useTrackImpression() {
  return useMutation<unknown, Error, number>({
    mutationFn: (campaignId) => unwrap(api.post(`/campaigns/${campaignId}/impression`)),
  });
}

export function useTrackClick() {
  return useMutation<unknown, Error, number>({
    mutationFn: (campaignId) => unwrap(api.post(`/campaigns/${campaignId}/click`)),
  });
}
```

> This matches `usePackages.ts`, which imports `{ api, unwrap }` from `@mobile/lib/api` and calls `unwrap<T>(api.get(...))` / `unwrap(api.post(url))` (no body). Same shape used here.

- [ ] **Step 3: Typecheck mobile**

Run: `pnpm --filter @nanny-app/mobile typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/hooks/useCampaigns.ts apps/mobile/src/store/pendingPromoStore.ts
git commit -m "feat(mobile): campaigns hook + pending-promo store"
```

---

## Task 8: Mobile — CampaignCarousel + Home integration + promo prefill

**Files:**
- Create: `apps/mobile/src/components/CampaignCarousel.tsx`
- Create: `apps/mobile/src/components/styles/campaign-carousel.styles.ts`
- Modify: `apps/mobile/src/screens/parent/HomeScreen.tsx`
- Modify: `apps/mobile/src/screens/parent/BookingStep1Screen.tsx`

**Interfaces:**
- Consumes: `useActiveCampaigns`, `useTrackImpression`, `useTrackClick`, `usePendingPromoStore`, `expo-router` `useRouter`, theme tokens.

- [ ] **Step 1: Create the carousel styles**

Create `apps/mobile/src/components/styles/campaign-carousel.styles.ts`:

```ts
import { StyleSheet } from 'react-native';

import { borderRadius, colors, screenPadding, shadows, spacing, typeScale } from '@mobile/theme';

const CARD_WIDTH = 280;

export const CARD_WIDTH_PX = CARD_WIDTH;

export const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    paddingHorizontal: screenPadding,
  },
  listContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadows.sm,
  },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: colors.neutralLight,
  },
  body: {
    padding: spacing.md,
  },
  title: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
```

> Tokens above are verified against `@mobile/theme`: `typeScale.headingSm` / `typeScale.labelLg` / `typeScale.caption`, `colors.surface` / `colors.neutralLight` / `colors.textPrimary` / `colors.textSecondary`, `shadows.sm`, `borderRadius.lg`, `spacing.lg|md|sm|xxs`, `screenPadding`. If `pnpm typecheck` flags any (e.g. a renamed scale key), substitute the nearest existing token — never add a new one (mobile CLAUDE.md rule).

- [ ] **Step 2: Create the carousel component**

Create `apps/mobile/src/components/CampaignCarousel.tsx`:

```tsx
import React, { useCallback, useRef } from 'react';
import { FlatList, Image, Pressable, Text, View, type ViewToken } from 'react-native';
import { useRouter } from 'expo-router';

import type { PublicCampaign } from '@nanny-app/shared';

import { useActiveCampaigns, useTrackClick, useTrackImpression } from '@mobile/hooks/useCampaigns';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';
import { styles } from './styles/campaign-carousel.styles';

// A campaign is "seen" once ≥ 60% of its card is on screen; count it at most
// once per mount so a scroll back and forth doesn't inflate impressions.
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 } as const;

export default function CampaignCarousel() {
  const router = useRouter();
  const { data: campaigns } = useActiveCampaigns();
  const trackImpression = useTrackImpression();
  const trackClick = useTrackClick();
  const setPendingPromoCode = usePendingPromoStore((s) => s.setPendingPromoCode);
  const seen = useRef<Set<number>>(new Set());

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const token of viewableItems) {
        const item = token.item as PublicCampaign;
        if (token.isViewable && !seen.current.has(item.id)) {
          seen.current.add(item.id);
          trackImpression.mutate(item.id);
        }
      }
    },
  ).current;

  const handlePress = useCallback(
    (campaign: PublicCampaign) => {
      trackClick.mutate(campaign.id);
      if (campaign.targetType === 'PACKAGE' && campaign.packageId != null) {
        router.push({
          pathname: '/(parent)/packages/checkout',
          params: { packageId: String(campaign.packageId) },
        } as never);
        return;
      }
      if (campaign.targetType === 'PROMO_CODE' && campaign.promoCode) {
        setPendingPromoCode(campaign.promoCode);
        router.push('/(parent)/book/booking-date-picker' as never);
      }
    },
    [router, setPendingPromoCode, trackClick],
  );

  if (!campaigns || campaigns.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Offers for you</Text>
      <FlatList
        horizontal
        data={campaigns}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => handlePress(item)}>
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
```

> `onViewableItemsChanged` and `viewabilityConfig` must be stable references (RN throws if they change between renders) — the `useRef` wrappers above satisfy that.

- [ ] **Step 3: Render the carousel on Home**

In `apps/mobile/src/screens/parent/HomeScreen.tsx`, add the import:

```ts
import CampaignCarousel from '@mobile/components/CampaignCarousel';
```

Insert `<CampaignCarousel />` immediately after the closing `</Pressable>` of the "Book care" card (before the `{/* How it works */}` section):

```tsx
        </Pressable>

        <CampaignCarousel />

        {/* How it works */}
```

- [ ] **Step 4: Prefill the promo in Step 1 from the store**

In `apps/mobile/src/screens/parent/BookingStep1Screen.tsx`, add the imports:

```ts
import { useEffect } from 'react';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';
```

(If `useEffect` is already imported from `react`, extend that import instead of adding a new line.)

Inside the component, after the `promoCode` / `appliedPromo` state is declared, add:

```tsx
  const pendingPromoCode = usePendingPromoStore((s) => s.pendingPromoCode);
  const clearPendingPromo = usePendingPromoStore((s) => s.clear);

  // A campaign tap can hand a code to the booking flow. Prefill it once, then
  // clear it so it never rides along into a future, unrelated booking.
  useEffect(() => {
    if (pendingPromoCode) {
      setPromoCode(pendingPromoCode);
      clearPendingPromo();
    }
    // Run once on mount; the store is a one-shot handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 5: Typecheck mobile**

Run: `pnpm --filter @nanny-app/mobile typecheck`
Expected: exit 0.

- [ ] **Step 6: Visual smoke check (preview)**

Per the mobile CLAUDE.md preview workflow, create a `src/__preview__/CampaignCarouselPreview.tsx` wrapper that seeds a `QueryClient` with 2–3 fake `PublicCampaign` items for `['campaigns','list']`, then run:

```bash
COMPONENT=src/__preview__/CampaignCarouselPreview.tsx npm run preview:web
```

Serve `dist/preview` on port 3100 and screenshot via the Playwright MCP tools (navigate → wait for `#root > *` → screenshot to `screenshots/CampaignCarousel.png`). Confirm the horizontal cards render with image + title + subtitle. Tear down the server.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/CampaignCarousel.tsx apps/mobile/src/components/styles/campaign-carousel.styles.ts apps/mobile/src/screens/parent/HomeScreen.tsx apps/mobile/src/screens/parent/BookingStep1Screen.tsx
git commit -m "feat(mobile): campaign carousel on Home + promo prefill"
```

---

## Final verification

- [ ] **Full typecheck across packages**

Run: `pnpm -r typecheck`
Expected: exit 0 for shared, backend, admin, mobile.

- [ ] **Backend tests + coverage**

Run: `pnpm --filter @nanny-app/backend test`
Expected: PASS, ≥ 80% coverage.

- [ ] **Manual acceptance (when a DB + apps are running):**
  - Admin: create a package-linked and a promo-linked campaign (image uploads to Firebase); toggle active; delete. Table shows impressions/taps/total-usage and the correct status badge.
  - Mobile: Home shows the carousel; scrolling a card registers an impression (admin count rises); tapping a package campaign opens package checkout; tapping a promo campaign opens the booking date picker and, at Step 1, the promo field is prefilled with the code.

---

## Out of scope (do not build)

- Conversion attribution, per-event analytics history, unique users, time-series CTR.
- A/B testing, targeting/segmentation, campaign push notifications.
- Post-payment placement of the carousel (Home only).
- Editing a campaign's image/target inline in the table beyond the active toggle + delete (create replaces; a full edit form is a follow-up if desired).
