# Packages Admin — Purchases + Consumption Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a read-only "Package Purchases" page listing everyone who bought a package (hours left, expiry, status) with a drill-in showing each purchase's full consumption ledger.

**Architecture:** Templated on the existing admin **Rewards wallets** feature (paginated user-balance list → ledger drill-in). New `admin-package-purchase.service.ts` reads `PackagePurchase` + `PackageHoursLedger`; two `adminRouter` GET endpoints; new shared admin schemas; a new admin React page + table + ledger detail drawer.

**Tech Stack:** Express + TypeScript, Prisma, Zod (`@nanny-app/shared`), Jest (backend); React + Vite + TanStack Query (admin web).

## Global Constraints

- **Strict TS, no `any`.** Types inferred from Zod in `packages/shared`; never duplicate.
- **Soft delete only** — every read filters `deletedAt: null` in the service layer.
- **Money** `Decimal ↔ number` in the service; EGP. **Hours** are `number` in DTOs (`Decimal → Number`).
- **No business logic in routes** — validate (`validateQuery`) + call one service fn + `ok(...)`/`okPaged(...)`.
- **Pagination**: `AdminListQuerySchema` (`page`/`limit`, `z.coerce`, default 1/20, max 200) + `okPaged(data, meta)` where `meta: { page, limit, total, totalPages }`.
- **Admin entry file is lowercase** `apps/admin/src/app.tsx` (repo memory `admin-entry-file-lowercase`) — never `App.tsx`.
- **Errors**: `errors.notFound(...)` etc. from `@backend/lib/errors`.
- **Every backend service function = one Jest unit test**, Prisma mocked. Coverage gate 80%. Admin web gated on `pnpm typecheck` (no admin jest harness).
- **Read-only** — no balance-adjust write endpoint this iteration.
- **Verification** (repo memory `local-dev-constraints`): `pnpm typecheck` + `pnpm test --filter=@nanny-app/backend`; preview the admin page in the Browser pane.

**Depends on:** the backend plan **Task 1** (schema: `PackagePurchase`, `PackageHoursLedger`, enums). Build this after that migration exists. Data to display is produced by backend plan Tasks 4–6 (purchases + ledger movements).

---

## File Structure

- `packages/shared/src/package.ts` (or `admin.ts`) — admin purchase + ledger schemas (Task 1).
- `apps/backend/src/services/admin-package-purchase.service.ts` — list + detail (Task 2).
- `apps/backend/src/routes/admin.routes.ts` — two GET routes (Task 3).
- `apps/admin/src/lib/api.ts` — `fetchPackagePurchases`, `fetchPackagePurchaseDetail` (Task 4).
- `apps/admin/src/pages/package-purchases-page.tsx` — page (Task 4).
- `apps/admin/src/features/package-purchases/purchase-table.tsx`, `purchase-ledger-drawer.tsx` — table + drill-in (Task 4).
- `apps/admin/src/app.tsx`, `admin-layout.tsx`, `ui/icon.tsx` — route + nav (Task 5).

---

### Task 1: Shared admin schemas

**Files:**
- Modify: `packages/shared/src/package.ts`
- Test: `packages/shared/src/__tests__/package.test.ts` (extend the file from the backend plan)

**Interfaces:**
- Produces: `AdminPackagePurchaseSchema`, `AdminPackagePurchaseListQuerySchema`, `PackageHoursLedgerEntrySchema`, `AdminPackagePurchaseDetailSchema`, and types `AdminPackagePurchase`, `AdminPackagePurchaseListQuery`, `PackageHoursLedgerEntry`, `AdminPackagePurchaseDetail`.

- [ ] **Step 1: Write failing test**

Append to `packages/shared/src/__tests__/package.test.ts`:
```ts
import {
  AdminPackagePurchaseSchema,
  AdminPackagePurchaseListQuerySchema,
  AdminPackagePurchaseDetailSchema,
} from '../package';

describe('admin package purchase schemas', () => {
  it('parses a purchase list row with buyer + consumed hours', () => {
    const row = AdminPackagePurchaseSchema.parse({
      id: 1, buyerName: 'Sara M', buyerEmail: 's@x.com', packageName: 'Starter',
      hoursPurchased: 50, hoursRemaining: 32.5, hoursConsumed: 17.5,
      pricePaid: 2000, status: 'ACTIVE',
      purchasedAt: '2026-07-01T00:00:00.000Z', expiresAt: '2026-09-29T00:00:00.000Z',
    });
    expect(row.hoursConsumed).toBe(17.5);
  });

  it('list query coerces page/limit and accepts a status filter', () => {
    const q = AdminPackagePurchaseListQuerySchema.parse({ page: '2', limit: '50', status: 'EXPIRED' });
    expect(q).toMatchObject({ page: 2, limit: 50, status: 'EXPIRED' });
  });

  it('detail carries a ledger array with signed hours + balanceAfter', () => {
    const d = AdminPackagePurchaseDetailSchema.parse({
      id: 1, buyerName: 'Sara M', buyerEmail: 's@x.com', packageName: 'Starter',
      hoursPurchased: 50, hoursRemaining: 44, hoursConsumed: 6, pricePaid: 2000,
      status: 'ACTIVE', purchasedAt: '2026-07-01T00:00:00.000Z', expiresAt: null,
      ledger: [
        { id: 9, type: 'REDEMPTION', hours: -6, balanceAfter: 44, reason: 'booking #12',
          bookingId: 12, createdAt: '2026-07-05T00:00:00.000Z' },
      ],
    });
    expect(d.ledger[0].hours).toBe(-6);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm --filter @nanny-app/shared test -- package.test`

- [ ] **Step 3: Implement** (append to `package.ts`; reuse `PackagePurchaseStatusSchema` from the backend plan):
```ts
import { AdminListQuerySchema } from './admin';

export const AdminPackagePurchaseSchema = z.object({
  id: z.number().int(),
  buyerName: z.string(),
  buyerEmail: z.string(),
  packageName: z.string(),
  hoursPurchased: z.number().int(),
  hoursRemaining: z.number(),
  hoursConsumed: z.number(),
  pricePaid: z.number(),
  status: PackagePurchaseStatusSchema,
  purchasedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type AdminPackagePurchase = z.infer<typeof AdminPackagePurchaseSchema>;

export const AdminPackagePurchaseListQuerySchema = AdminListQuerySchema.extend({
  status: PackagePurchaseStatusSchema.optional(),
  search: z.string().trim().min(1).optional(),
});
export type AdminPackagePurchaseListQuery = z.infer<typeof AdminPackagePurchaseListQuerySchema>;

export const PackageHoursLedgerEntrySchema = z.object({
  id: z.number().int(),
  type: z.enum(['PURCHASE', 'REDEMPTION', 'REFUND', 'EXPIRY', 'ADMIN_ADJUST']),
  hours: z.number(),
  balanceAfter: z.number(),
  reason: z.string().nullable(),
  bookingId: z.number().int().nullable(),
  createdAt: z.string(),
});
export type PackageHoursLedgerEntry = z.infer<typeof PackageHoursLedgerEntrySchema>;

export const AdminPackagePurchaseDetailSchema = AdminPackagePurchaseSchema.extend({
  ledger: z.array(PackageHoursLedgerEntrySchema),
});
export type AdminPackagePurchaseDetail = z.infer<typeof AdminPackagePurchaseDetailSchema>;
```
> `PackagePurchaseStatusSchema` was added in the backend plan Task 2. If building admin-first, add it here.

- [ ] **Step 4: Run — expect PASS + typecheck.** `pnpm --filter @nanny-app/shared test -- package.test && pnpm typecheck`

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/package.ts packages/shared/src/__tests__/package.test.ts
git commit -m "feat(shared): admin package-purchase list + ledger detail schemas"
```

---

### Task 2: Backend admin service — list + detail

**Files:**
- Create: `apps/backend/src/services/admin-package-purchase.service.ts`
- Test: `apps/backend/src/__tests__/admin-package-purchase.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `errors`; types `AdminPackagePurchase`, `AdminPackagePurchaseDetail`, `AdminPackagePurchaseListQuery`, `PaginationMeta`.
- Produces:
  - `listPackagePurchases(query: AdminPackagePurchaseListQuery): Promise<{ purchases: AdminPackagePurchase[]; meta: PaginationMeta }>`
  - `getPackagePurchaseDetail(id: number): Promise<AdminPackagePurchaseDetail>`

- [ ] **Step 1: Write failing tests**
```ts
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    packagePurchase: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    packageHoursLedger: { findMany: jest.fn() },
  },
}));
import { prisma } from '@backend/db/prisma';
import {
  listPackagePurchases, getPackagePurchaseDetail,
} from '@backend/services/admin-package-purchase.service';
const m = prisma as unknown as {
  packagePurchase: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
  packageHoursLedger: { findMany: jest.Mock };
};
beforeEach(() => jest.clearAllMocks());

function row(over = {}) {
  return {
    id: 1, hoursPurchased: 50, hoursRemaining: '32.50', pricePaid: '2000.00',
    status: 'ACTIVE', purchasedAt: new Date('2026-07-01'), expiresAt: new Date('2026-09-29'),
    nameSnapshot: 'Starter', user: { firstName: 'Sara', lastName: 'M', email: 's@x.com' }, ...over,
  };
}

it('paginates and maps buyer + hoursConsumed', async () => {
  m.packagePurchase.count.mockResolvedValue(1);
  m.packagePurchase.findMany.mockResolvedValue([row()]);
  const res = await listPackagePurchases({ page: 1, limit: 20 });
  expect(res.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  expect(res.purchases[0]).toMatchObject({
    buyerName: 'Sara M', buyerEmail: 's@x.com', packageName: 'Starter',
    hoursRemaining: 32.5, hoursConsumed: 17.5, pricePaid: 2000,
  });
});

it('detail includes the ledger, newest first', async () => {
  m.packagePurchase.findFirst.mockResolvedValue(row());
  m.packageHoursLedger.findMany.mockResolvedValue([
    { id: 9, type: 'REDEMPTION', hours: '-6.00', balanceAfter: '44.00',
      reason: 'booking #12', bookingId: 12, createdAt: new Date('2026-07-05') },
  ]);
  const d = await getPackagePurchaseDetail(1);
  expect(d.ledger[0]).toMatchObject({ type: 'REDEMPTION', hours: -6, balanceAfter: 44, bookingId: 12 });
});

it('throws 404 when the purchase is missing', async () => {
  m.packagePurchase.findFirst.mockResolvedValue(null);
  await expect(getPackagePurchaseDetail(999)).rejects.toMatchObject({ statusCode: 404 });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm test --filter=@nanny-app/backend -- admin-package-purchase`

- [ ] **Step 3: Implement**
```ts
import type {
  AdminPackagePurchase, AdminPackagePurchaseDetail,
  AdminPackagePurchaseListQuery, PackageHoursLedgerEntry, PaginationMeta,
} from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

const round2 = (n: number) => Math.round(n * 100) / 100;

type PurchaseWithUser = {
  id: number; hoursPurchased: number; hoursRemaining: Prisma.Decimal; pricePaid: Prisma.Decimal;
  status: AdminPackagePurchase['status']; purchasedAt: Date | null; expiresAt: Date | null;
  nameSnapshot: string; user: { firstName: string; lastName: string; email: string };
};

function toPurchaseDto(r: PurchaseWithUser): AdminPackagePurchase {
  const hoursRemaining = Number(r.hoursRemaining);
  return {
    id: r.id,
    buyerName: `${r.user.firstName} ${r.user.lastName}`.trim(),
    buyerEmail: r.user.email,
    packageName: r.nameSnapshot,
    hoursPurchased: r.hoursPurchased,
    hoursRemaining,
    hoursConsumed: round2(Math.max(0, r.hoursPurchased - hoursRemaining)),
    pricePaid: Number(r.pricePaid),
    status: r.status,
    purchasedAt: r.purchasedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
  };
}

export async function listPackagePurchases(
  query: AdminPackagePurchaseListQuery,
): Promise<{ purchases: AdminPackagePurchase[]; meta: PaginationMeta }> {
  const { page, limit, status, search } = query;
  const where: Prisma.PackagePurchaseWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          user: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.packagePurchase.count({ where }),
    prisma.packagePurchase.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    purchases: rows.map(toPurchaseDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPackagePurchaseDetail(id: number): Promise<AdminPackagePurchaseDetail> {
  const row = await prisma.packagePurchase.findFirst({
    where: { id, deletedAt: null },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!row) throw errors.notFound('Package purchase not found');

  const entries = await prisma.packageHoursLedger.findMany({
    where: { purchaseId: id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  const ledger: PackageHoursLedgerEntry[] = entries.map((e) => ({
    id: e.id, type: e.type, hours: Number(e.hours), balanceAfter: Number(e.balanceAfter),
    reason: e.reason, bookingId: e.bookingId, createdAt: e.createdAt.toISOString(),
  }));
  return { ...toPurchaseDto(row), ledger };
}
```

- [ ] **Step 4: Run — expect PASS.** `pnpm test --filter=@nanny-app/backend -- admin-package-purchase`

- [ ] **Step 5: Commit**
```bash
git add apps/backend/src/services/admin-package-purchase.service.ts apps/backend/src/__tests__/admin-package-purchase.service.test.ts
git commit -m "feat(backend): admin package-purchase list + ledger detail service"
```

---

### Task 3: Backend admin routes

**Files:**
- Modify: `apps/backend/src/routes/admin.routes.ts`

**Interfaces:**
- Consumes: `listPackagePurchases`, `getPackagePurchaseDetail` (Task 2), `AdminPackagePurchaseListQuerySchema`, `routeIdParam`, `okPaged`, `ok`, `validateQuery`.

- [ ] **Step 1: Add the route block** (mirror the Rewards wallets routes at admin.routes.ts:732). Add imports for the two service fns + the query schema, then:
```ts
// ── Package purchases (parent hour bundles — read-only) ────────
adminRouter.get(
  '/package-purchases',
  validateQuery(AdminPackagePurchaseListQuerySchema),
  async (req, res, next) => {
    try {
      const { purchases, meta } = await listPackagePurchases(
        req.query as unknown as AdminPackagePurchaseListQuery,
      );
      res.json(okPaged(purchases, meta));
    } catch (err) { next(err); }
  },
);

adminRouter.get('/package-purchases/:id', async (req, res, next) => {
  try {
    res.json(ok(await getPackagePurchaseDetail(routeIdParam(req.params.id))));
  } catch (err) { next(err); }
});
```
Import `AdminPackagePurchaseListQuery` type + `AdminPackagePurchaseListQuerySchema` from `@nanny-app/shared`; confirm `okPaged` is already imported (it is, for other paged routes).

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add apps/backend/src/routes/admin.routes.ts
git commit -m "feat(backend): admin routes for package purchases list + detail"
```

---

### Task 4: Admin web — page, table, ledger drawer

**Files:**
- Modify: `apps/admin/src/lib/api.ts`
- Create: `apps/admin/src/pages/package-purchases-page.tsx`
- Create: `apps/admin/src/features/package-purchases/purchase-table.tsx`
- Create: `apps/admin/src/features/package-purchases/purchase-ledger-drawer.tsx`

**Interfaces:**
- Consumes: the `Paged<T>` helper + `fetchPackagePurchases`/`fetchPackagePurchaseDetail`; TanStack Query; `use-pagination.ts`; existing UI (`PageHeader`, `TableSkeleton`, `ErrorState`, table primitives) — mirror `rewards-page.tsx`.
- Produces: route `package-purchases` (registered in Task 5).

- [ ] **Step 1: API client fns** (mirror `fetchMothers` in `api.ts`):
```ts
import type {
  AdminPackagePurchase, AdminPackagePurchaseDetail, AdminPackagePurchaseListQuery,
} from '@nanny-app/shared';

export async function fetchPackagePurchases(
  params: AdminPackagePurchaseListQuery,
): Promise<Paged<AdminPackagePurchase[]>> {
  const res = await client.get('/admin/package-purchases', { params });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchPackagePurchaseDetail(id: number): Promise<AdminPackagePurchaseDetail> {
  const res = await client.get(`/admin/package-purchases/${id}`);
  return res.data.data;
}
```

- [ ] **Step 2: Page** `package-purchases-page.tsx` (mirror `rewards-page.tsx`): `PageHeader` ("Package Purchases"), a status `<select>` filter + search input, `usePagination()`, `useQuery(['package-purchases', { page, limit, status, search }], () => fetchPackagePurchases(...))`, `keepPreviousData`. Render `TableSkeleton` while loading, `ErrorState` on error, else `<PurchaseTable rows={data.data} onRowClick={setSelectedId} />` + pagination controls from the shared pattern. Hold `selectedId` state; render `<PurchaseLedgerDrawer id={selectedId} onClose={...} />` when set.

- [ ] **Step 3: Table** `purchase-table.tsx` — columns: Buyer (name + email), Package, Hours (`{hoursRemaining} / {hoursPurchased}`), Consumed (`{hoursConsumed}h`), Price (`{pricePaid} EGP`), Status (badge), Purchased (date), Expires (date or "—"). Each row `onClick={() => onRowClick(row.id)}`. Reuse existing table primitives + `formatDate`/`format.ts`.

- [ ] **Step 4: Ledger drawer** `purchase-ledger-drawer.tsx` — `useQuery(['package-purchase', id], () => fetchPackagePurchaseDetail(id!), { enabled: id != null })`. Header shows buyer + package + hours summary; body is the `ledger` timeline: each entry as a row with a type badge, signed hours (green `+`, red `−`), `balanceAfter`, `reason`, a booking link when `bookingId` is set (`/bookings/{bookingId}`), and `createdAt`. Loading/error states via the same components.

- [ ] **Step 5: Typecheck + preview**

Run: `pnpm typecheck`. Open the admin preview, log in, navigate to Package Purchases; confirm the table renders and a row opens the ledger drawer. Commit:
```bash
git add apps/admin/src/lib/api.ts apps/admin/src/pages/package-purchases-page.tsx apps/admin/src/features/package-purchases
git commit -m "feat(admin): package purchases page with consumption ledger drill-in"
```

---

### Task 5: Admin route + nav registration

**Files:**
- Modify: `apps/admin/src/app.tsx` (lowercase — repo memory `admin-entry-file-lowercase`)
- Modify: `apps/admin/src/features/.../admin-layout.tsx` (nav items)
- Modify: `apps/admin/src/components/ui/icon.tsx` (or wherever lucide icons are registered)

- [ ] **Step 1: Register the route** in `app.tsx`, next to the existing `packages` route (line ~60):
```tsx
<Route path="package-purchases" element={<PackagePurchasesPage />} />
```
Add the import: `import { PackagePurchasesPage } from '@admin/pages/package-purchases-page';` (match the existing import style in `app.tsx`).

- [ ] **Step 2: Add the nav item** in `admin-layout.tsx` — a link to `/package-purchases` labeled "Package Purchases" with a lucide icon (e.g. `Receipt` or `Wallet`), placed near the existing "Packages" nav entry. Register the icon in `ui/icon.tsx` if that indirection is used.

- [ ] **Step 3: Typecheck + preview + commit**

Run: `pnpm typecheck`; confirm the nav item appears and routes correctly in the admin preview. Commit:
```bash
git add apps/admin/src/app.tsx apps/admin/src/features apps/admin/src/components/ui/icon.tsx
git commit -m "feat(admin): register Package Purchases route + nav item"
```

---

## Self-Review Notes
- Spec §4b (admin purchases + full-ledger drill-in) → Tasks 1–5. Read-only; no `ADMIN_ADJUST` write path (deferred).
- **Sequencing:** needs backend plan Task 1 (schema). `PackagePurchaseStatusSchema` is shared with backend plan Task 2 — whichever plan lands first defines it; the other imports it. Build order overall: backend Task 1 → this plan (any time after) → but the list is only meaningful once purchases/redemptions exist (backend Tasks 4–6).
- Type consistency: `AdminPackagePurchase` / `AdminPackagePurchaseDetail` / `PackageHoursLedgerEntry` / `AdminPackagePurchaseListQuery` used identically across shared, backend service, backend routes, and admin api/page.
