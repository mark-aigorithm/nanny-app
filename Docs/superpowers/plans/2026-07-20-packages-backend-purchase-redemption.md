# Packages Backend — Purchase + Redemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let parents buy prepaid-hour packages (Paymob) and redeem those hours (1hr = 1hr of care) plus a per-package free-skill allowance against bookings, on the backend + admin.

**Architecture:** New `PackagePurchase` (per-purchase bucket, snapshots + FIFO consumption) and append-only `PackageHoursLedger`, both modeled on the existing `RewardWallet`/`RewardLedgerEntry` pattern. `Payment` becomes polymorphic (`BOOKING | PACKAGE`) so one Paymob intention/webhook/reconcile path serves both; the purpose branch lives in `finalizePaymentCaptured`. Redemption is applied inside `createBooking`'s pricing transaction because it also waives skill fees.

**Tech Stack:** Express + TypeScript, Prisma (PostgreSQL), Zod (`@nanny-app/shared`), Jest, Paymob.

## Global Constraints

- **Strict TS, no `any`** — use `unknown` + guards. Types inferred from Zod in `packages/shared`; never duplicate type definitions.
- **Never use `process.env` directly** — import the typed `config` from `src/lib/config.ts`.
- **Every model** has `createdAt @default(now())`, `updatedAt @updatedAt`, `deletedAt?` (all `@map` snake_case). **Soft delete only**; every read filters `deletedAt: null` in the service layer.
- **IDs**: `Int @id @default(autoincrement())` (sequential-int precedent, supersedes root cuid rule for catalog modules).
- **Money**: `@db.Decimal(10, 2)`, single currency **EGP**, crosses the API as a JS `number` (service converts `Decimal ↔ number`). Hours use `@db.Decimal(6, 2)`.
- **No business logic in routes** — routes validate + call one service fn + return `ok(...)`/`okPaged(...)`. Only services touch Prisma/Redis/Firebase/S3.
- **Errors**: throw `errors.badRequest|conflict|notFound|forbidden|unauthorized(msg)` from `@backend/lib/errors`; `AppError(msg, code)` for other codes. Only `globalErrorHandler` sends error responses.
- **Every service function = one Jest unit test**, Prisma mocked via `jest.mock('@backend/db/prisma', …)`. Coverage gate **80%**.
- **Verification** (repo memory `local-dev-constraints`: no Docker/DB locally): `pnpm typecheck` + `pnpm test --filter=@nanny-app/backend`; review migration SQL by hand.

---

## File Structure

- `apps/backend/prisma/schema.prisma` — Package fields, `PackagePurchase`, `PackageHoursLedger`, enums, polymorphic `Payment`, Booking fields (Task 1).
- `packages/shared/src/package.ts` + `index.ts` — extend + new schemas (Task 2).
- `apps/backend/src/services/package-hours.service.ts` — ledger/wallet engine: balance, credit, FIFO redeem, refund, expire (Tasks 3, 6a).
- `apps/backend/src/services/package-purchase.service.ts` — public catalog, purchase-intent, balance DTO (Tasks 4, 5).
- `apps/backend/src/services/paymob.service.ts` — polymorphic completion branch + package intention (Task 5).
- `apps/backend/src/services/booking.service.ts` — apply package hours in `createBooking` (Task 6).
- `apps/backend/src/routes/package.routes.ts` + `routes/index.ts` — public parent routes (Task 7).
- `apps/backend/src/routes/admin.routes.ts` — no change (schema drives new fields); admin web fields (Task 8).
- `apps/backend/prisma/seed-demo.ts` — demo packages with new fields (Task 9).

---

### Task 1: Schema — bucket, ledger, polymorphic payment

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (Package ~332-346, User relations ~182-203, Booking ~589-595, Payment ~606-639)
- Migration: `apps/backend/prisma/migrations/<ts>_add_package_purchases_and_redemption/migration.sql`

**Interfaces:**
- Produces: models `PackagePurchase`, `PackageHoursLedger`; enums `PackagePurchaseStatus { PENDING_PAYMENT, ACTIVE, EXPIRED, REFUNDED }`, `PackageHoursEntryType { PURCHASE, REDEMPTION, REFUND, EXPIRY, ADMIN_ADJUST }`, `PaymentPurpose { BOOKING, PACKAGE }`; new columns on `Package` (`validityDays`, `maxSkills`), `Payment` (`purpose`, `packagePurchaseId`, `bookingId` now nullable), `Booking` (`packageHoursApplied`, `packageSkillsCovered`, `packageCreditAmount`).

- [ ] **Step 1: Add the two Package fields**

In `model Package` (after `price`):
```prisma
  validityDays Int  @map("validity_days")
  maxSkills    Int  @default(0) @map("max_skills")
```

- [ ] **Step 2: Add the two new models + enums**

Append near the other catalog models:
```prisma
model PackagePurchase {
  id                Int                   @id @default(autoincrement())
  userId            Int                   @map("user_id")
  user              User                  @relation("PackagePurchaseUser", fields: [userId], references: [id])
  packageId         Int                   @map("package_id")
  package           Package               @relation(fields: [packageId], references: [id])
  nameSnapshot      String                @map("name_snapshot")
  hoursPurchased    Int                   @map("hours_purchased")
  pricePaid         Decimal               @map("price_paid") @db.Decimal(10, 2)
  maxSkillsSnapshot Int                   @map("max_skills_snapshot")
  hoursRemaining    Decimal               @default(0) @map("hours_remaining") @db.Decimal(6, 2)
  status            PackagePurchaseStatus @default(PENDING_PAYMENT)
  purchasedAt       DateTime?             @map("purchased_at")
  expiresAt         DateTime?             @map("expires_at")
  payment           Payment?
  ledgerEntries     PackageHoursLedger[]
  createdAt         DateTime              @default(now()) @map("created_at")
  updatedAt         DateTime              @updatedAt @map("updated_at")
  deletedAt         DateTime?             @map("deleted_at")

  @@index([userId, status])
  @@index([expiresAt])
  @@index([deletedAt])
  @@map("package_purchases")
}

model PackageHoursLedger {
  id           Int                   @id @default(autoincrement())
  purchaseId   Int                   @map("purchase_id")
  purchase     PackagePurchase       @relation(fields: [purchaseId], references: [id])
  userId       Int                   @map("user_id")
  user         User                  @relation("PackageHoursLedgerUser", fields: [userId], references: [id])
  type         PackageHoursEntryType
  hours        Decimal               @db.Decimal(6, 2)
  balanceAfter Decimal               @map("balance_after") @db.Decimal(6, 2)
  reason       String?
  bookingId    Int?                  @map("booking_id")
  booking      Booking?              @relation(fields: [bookingId], references: [id])
  adminId      Int?                  @map("admin_id")
  admin        User?                 @relation("PackageHoursLedgerAdmin", fields: [adminId], references: [id])
  createdAt    DateTime              @default(now()) @map("created_at")
  updatedAt    DateTime              @updatedAt @map("updated_at")
  deletedAt    DateTime?             @map("deleted_at")

  @@index([userId, createdAt])
  @@index([purchaseId])
  @@index([bookingId])
  @@map("package_hours_ledger_entries")
}

enum PackagePurchaseStatus {
  PENDING_PAYMENT
  ACTIVE
  EXPIRED
  REFUNDED

  @@map("package_purchase_status")
}

enum PackageHoursEntryType {
  PURCHASE
  REDEMPTION
  REFUND
  EXPIRY
  ADMIN_ADJUST

  @@map("package_hours_entry_type")
}
```
Add to `model Package`: `purchases PackagePurchase[]`.

- [ ] **Step 3: Make Payment polymorphic**

In `model Payment`, change `bookingId` and add fields:
```prisma
  bookingId         Int?           @unique @map("booking_id")   // was: Int @unique
  booking           Booking?       @relation(fields: [bookingId], references: [id])   // was non-optional
  packagePurchaseId Int?           @unique @map("package_purchase_id")
  packagePurchase   PackagePurchase? @relation(fields: [packagePurchaseId], references: [id])
  purpose           PaymentPurpose @default(BOOKING)
```
Add enum:
```prisma
enum PaymentPurpose {
  BOOKING
  PACKAGE

  @@map("payment_purpose")
}
```

- [ ] **Step 4: Add Booking snapshot fields + ledger relation**

In `model Booking` (near the `rewardCredit*` fields):
```prisma
  packageHoursApplied  Decimal @default(0) @map("package_hours_applied") @db.Decimal(6, 2)
  packageSkillsCovered Int     @default(0) @map("package_skills_covered")
  packageCreditAmount  Decimal @default(0) @map("package_credit_amount") @db.Decimal(10, 2)
  packageHoursLedger   PackageHoursLedger[]
```

- [ ] **Step 5: Add User relations**

In `model User`, add:
```prisma
  packagePurchases   PackagePurchase[]     @relation("PackagePurchaseUser")
  packageHoursLedger PackageHoursLedger[]  @relation("PackageHoursLedgerUser")
  packageHoursGrants PackageHoursLedger[]  @relation("PackageHoursLedgerAdmin")
```

- [ ] **Step 6: Create + review the migration**

Run: `cd apps/backend && pnpm db:migrate:dev --name add_package_purchases_and_redemption`
Expected: new migration folder created, client regenerated. **Open the SQL and confirm** it (a) creates the two tables + three enums, (b) `ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL`, adds `purpose` with default `'BOOKING'` (existing rows backfill to BOOKING via the default), adds `package_purchase_id`. If DB is unavailable locally, hand-write the SQL to match and note "applied in CI" — do NOT invent data loss.

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @nanny-app/backend db:generate && pnpm typecheck`
Expected: PASS (new Prisma types available).
```bash
git add apps/backend/prisma
git commit -m "feat(backend): schema for package purchases, hours ledger, polymorphic payment"
```

---

### Task 2: Shared schemas

> **PARTIALLY COMPLETE** (commit `fc935c1`). Already done, do NOT redo:
> `validityDays`/`maxSkills` on `PackageSchema`/`CreatePackageSchema`/`UpdatePackageSchema`
> (note: `validityDays` **defaults to 30** and `maxSkills` to 0 in `CreatePackageSchema` —
> keep those defaults; they mirror the DB backfill), plus Step 5's `package.service.ts`
> threading and its tests.
>
> **REMAINING work for this task:** only the new schemas — `PublicPackageSchema`,
> `PackagePurchaseStatusSchema`, `PackagePurchaseSchema`, `PackageHoursBalanceSchema`,
> `PurchasePackageSchema` — and their inferred types. Skip Step 5 entirely.

**Files:**
- Modify: `packages/shared/src/package.ts`
- Modify: `packages/shared/src/index.ts` (already re-exports `./package` — verify)
- Test: `packages/shared/src/__tests__/package.test.ts` (create; use ts-jest isolatedModules per repo memory `worktree-shared-resolution` if in a worktree)

**Interfaces:**
- Produces: `PackageSchema`/`CreatePackageSchema`/`UpdatePackageSchema` gain `validityDays`,`maxSkills`; new `PublicPackageSchema`, `PackagePurchaseSchema`, `PackageHoursBalanceSchema`, `PurchasePackageSchema`; types `PublicPackage`, `PackagePurchase`, `PackageHoursBalance`, `PurchasePackageInput`.

- [ ] **Step 1: Write failing test**

Create `packages/shared/src/__tests__/package.test.ts`:
```ts
import {
  CreatePackageSchema,
  PublicPackageSchema,
  PackageHoursBalanceSchema,
} from '../package';

describe('package shared schemas', () => {
  it('requires validityDays >= 1 and maxSkills >= 0 on create', () => {
    const ok = CreatePackageSchema.safeParse({
      name: 'Starter', hours: 50, price: 2000, validityDays: 90, maxSkills: 2,
    });
    expect(ok.success).toBe(true);
    expect(CreatePackageSchema.safeParse({
      name: 'X', hours: 1, price: 1, validityDays: 0, maxSkills: 0,
    }).success).toBe(false);
  });

  it('PublicPackageSchema omits internal fields but keeps validity + maxSkills', () => {
    const parsed = PublicPackageSchema.parse({
      id: 1, name: 'Starter', description: null, hours: 50, price: 2000,
      validityDays: 90, maxSkills: 2,
    });
    expect(parsed.maxSkills).toBe(2);
  });

  it('PackageHoursBalanceSchema shape', () => {
    const b = PackageHoursBalanceSchema.parse({ availableHours: 12.5, buckets: [] });
    expect(b.availableHours).toBe(12.5);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @nanny-app/shared test -- package.test`
Expected: FAIL (`validityDays` unknown / `PublicPackageSchema` not exported).

- [ ] **Step 3: Extend `package.ts`**

Add `validityDays`/`maxSkills` to the three existing schemas, and append:
```ts
// Add to PackageSchema object:
  validityDays: z.number().int(),
  maxSkills: z.number().int(),

// Add to CreatePackageSchema object:
  validityDays: z.number().int().min(1),
  maxSkills: z.number().int().min(0).default(0),

// Add to UpdatePackageSchema object:
  validityDays: z.number().int().min(1).optional(),
  maxSkills: z.number().int().min(0).optional(),

// ── Mobile-facing catalog DTO ──────────────────────────────────
export const PublicPackageSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  hours: z.number().int(),
  price: z.number(),
  validityDays: z.number().int(),
  maxSkills: z.number().int(),
});
export type PublicPackage = z.infer<typeof PublicPackageSchema>;

export const PackagePurchaseStatusSchema = z.enum([
  'PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'REFUNDED',
]);

export const PackagePurchaseSchema = z.object({
  id: z.number().int(),
  packageName: z.string(),
  hoursPurchased: z.number().int(),
  hoursRemaining: z.number(),
  maxSkills: z.number().int(),
  status: PackagePurchaseStatusSchema,
  purchasedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type PackagePurchase = z.infer<typeof PackagePurchaseSchema>;

export const PackageHoursBalanceSchema = z.object({
  availableHours: z.number(),
  buckets: z.array(PackagePurchaseSchema),
});
export type PackageHoursBalance = z.infer<typeof PackageHoursBalanceSchema>;

export const PurchasePackageSchema = z.object({ packageId: z.number().int().positive() });
export type PurchasePackageInput = z.infer<typeof PurchasePackageSchema>;
```

- [ ] **Step 4: Run — expect PASS + typecheck**

Run: `pnpm --filter @nanny-app/shared test -- package.test && pnpm typecheck`
Expected: PASS. (Note: this makes `validityDays` required in `CreatePackageSchema`/admin — Task 8 wires the admin form; existing backend `createPackage` service is updated in Step 5.)

- [ ] **Step 5: Update `createPackage`/`updatePackage` service for the new columns**

In `apps/backend/src/services/package.service.ts`: extend `PackageRow` with `validityDays: number; maxSkills: number`, add them to `toDto`, and pass `validityDays`/`maxSkills` through `createPackage` (`data`) and `updatePackage` (conditional spreads). Update `apps/backend/src/__tests__/package.service.test.ts` `makePackage` factory + create assertion to include the two fields.

Run: `pnpm test --filter=@nanny-app/backend -- package.service`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add packages/shared apps/backend/src/services/package.service.ts apps/backend/src/__tests__/package.service.test.ts
git commit -m "feat(shared): package validity + maxSkills, public/purchase/balance schemas"
```

---

### Task 3: `package-hours.service.ts` — ledger engine

**Files:**
- Create: `apps/backend/src/services/package-hours.service.ts`
- Test: `apps/backend/src/__tests__/package-hours.service.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@backend/db/prisma`; `errors` from `@backend/lib/errors`.
- Produces:
  - `type Db = Prisma.TransactionClient | typeof prisma`
  - `getAvailableHours(userId: number, db?: Db): Promise<number>`
  - `creditPurchaseHours(db: Db, purchaseId: number): Promise<void>` — idempotent, called on payment capture
  - `redeemPackageHours(db: Db, params: { userId: number; bookingId: number; hoursNeeded: number }): Promise<{ hoursApplied: number; maxSkillsAllowed: number; purchaseIds: number[] }>` — FIFO
  - `refundPackageHours(db: Db, bookingId: number): Promise<number>` — reverses redemption
  - `expirePackagesForUser(userId: number, db?: Db): Promise<void>` — lazy expiry
  - `getMyPackageHours(firebaseUid: string): Promise<PackageHoursBalance>`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/__tests__/package-hours.service.test.ts` (mirror `package.service.test.ts` mock scaffolding):
```ts
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    packagePurchase: { findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    packageHoursLedger: { create: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  getAvailableHours,
  redeemPackageHours,
} from '@backend/services/package-hours.service';

const m = prisma as unknown as {
  packagePurchase: { findMany: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
  packageHoursLedger: { create: jest.Mock; findMany: jest.Mock };
};

function bucket(over = {}) {
  return {
    id: 1, userId: 7, hoursRemaining: '10.00', maxSkillsSnapshot: 2,
    status: 'ACTIVE', expiresAt: new Date('2026-12-01'), packageId: 3,
    nameSnapshot: 'Starter', ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('getAvailableHours', () => {
  it('sums hoursRemaining across active non-expired buckets', async () => {
    m.packagePurchase.findMany.mockResolvedValue([bucket(), bucket({ id: 2, hoursRemaining: '5.50' })]);
    expect(await getAvailableHours(7)).toBe(15.5);
  });
});

describe('redeemPackageHours (FIFO)', () => {
  it('drains soonest-expiring bucket first and writes REDEMPTION rows', async () => {
    m.packagePurchase.findMany.mockResolvedValue([
      bucket({ id: 1, hoursRemaining: '4.00', expiresAt: new Date('2026-08-01'), maxSkillsSnapshot: 1 }),
      bucket({ id: 2, hoursRemaining: '10.00', expiresAt: new Date('2026-10-01'), maxSkillsSnapshot: 3 }),
    ]);
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});
    const res = await redeemPackageHours(prisma as never, { userId: 7, bookingId: 99, hoursNeeded: 6 });
    expect(res.hoursApplied).toBe(6);
    expect(res.maxSkillsAllowed).toBe(3); // max across consumed buckets
    expect(res.purchaseIds).toEqual([1, 2]);
    expect(m.packageHoursLedger.create).toHaveBeenCalledTimes(2);
  });

  it('applies only what is available when short', async () => {
    m.packagePurchase.findMany.mockResolvedValue([bucket({ hoursRemaining: '2.00' })]);
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});
    const res = await redeemPackageHours(prisma as never, { userId: 7, bookingId: 99, hoursNeeded: 6 });
    expect(res.hoursApplied).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test --filter=@nanny-app/backend -- package-hours`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the service**

Create `apps/backend/src/services/package-hours.service.ts`:
```ts
import type { PackageHoursBalance } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type Db = Prisma.TransactionClient | typeof prisma;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Active, non-expired buckets with hours left, soonest-to-expire first (FIFO). */
async function activeBuckets(userId: number, db: Db) {
  const rows = await db.packagePurchase.findMany({
    where: { userId, status: 'ACTIVE', deletedAt: null, hoursRemaining: { gt: 0 } },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
  });
  const now = new Date();
  return rows.filter((r) => !r.expiresAt || r.expiresAt > now);
}

export async function getAvailableHours(userId: number, db: Db = prisma): Promise<number> {
  const buckets = await activeBuckets(userId, db);
  return round2(buckets.reduce((sum, b) => sum + Number(b.hoursRemaining), 0));
}

/** Idempotent: turn a paid purchase into usable hours + a PURCHASE ledger row. */
export async function creditPurchaseHours(db: Db, purchaseId: number): Promise<void> {
  const purchase = await db.packagePurchase.findFirst({
    where: { id: purchaseId, deletedAt: null },
  });
  if (!purchase) throw errors.notFound('Package purchase not found');
  if (purchase.status !== 'PENDING_PAYMENT') return; // already credited — idempotent

  const purchasedAt = new Date();
  const expiresAt = new Date(purchasedAt.getTime() + purchase.hoursPurchased * 0); // placeholder
  // validityDays lives on the purchase's package; snapshot it at purchase creation (Task 4) instead:
  const validExpiry = purchase.expiresAt ?? expiresAt;

  await db.packagePurchase.update({
    where: { id: purchase.id },
    data: {
      status: 'ACTIVE',
      hoursRemaining: purchase.hoursPurchased,
      purchasedAt,
      expiresAt: validExpiry,
    },
  });
  await db.packageHoursLedger.create({
    data: {
      purchaseId: purchase.id,
      userId: purchase.userId,
      type: 'PURCHASE',
      hours: purchase.hoursPurchased,
      balanceAfter: purchase.hoursPurchased,
      reason: `Purchased ${purchase.nameSnapshot}`,
    },
  });
}

/** FIFO consume across buckets. Returns hours actually applied + the free-skill
 *  allowance (max maxSkillsSnapshot among consumed buckets). */
export async function redeemPackageHours(
  db: Db,
  params: { userId: number; bookingId: number; hoursNeeded: number },
): Promise<{ hoursApplied: number; maxSkillsAllowed: number; purchaseIds: number[] }> {
  const buckets = await activeBuckets(params.userId, db);
  let remaining = round2(params.hoursNeeded);
  let maxSkillsAllowed = 0;
  const purchaseIds: number[] = [];

  for (const b of buckets) {
    if (remaining <= 0) break;
    const avail = Number(b.hoursRemaining);
    const take = round2(Math.min(avail, remaining));
    if (take <= 0) continue;
    const balanceAfter = round2(avail - take);
    await db.packagePurchase.update({
      where: { id: b.id },
      data: { hoursRemaining: balanceAfter },
    });
    await db.packageHoursLedger.create({
      data: {
        purchaseId: b.id, userId: params.userId, type: 'REDEMPTION',
        hours: -take, balanceAfter, bookingId: params.bookingId,
        reason: `Applied ${take}h to booking #${params.bookingId}`,
      },
    });
    maxSkillsAllowed = Math.max(maxSkillsAllowed, b.maxSkillsSnapshot);
    purchaseIds.push(b.id);
    remaining = round2(remaining - take);
  }
  return { hoursApplied: round2(params.hoursNeeded - remaining), maxSkillsAllowed, purchaseIds };
}

/** Reverse a booking's redemption into the originating buckets (skip EXPIRED). */
export async function refundPackageHours(db: Db, bookingId: number): Promise<number> {
  const debits = await db.packageHoursLedger.findMany({
    where: { bookingId, type: 'REDEMPTION', deletedAt: null },
  });
  let refunded = 0;
  for (const d of debits) {
    const purchase = await db.packagePurchase.findFirst({ where: { id: d.purchaseId } });
    if (!purchase || purchase.status === 'EXPIRED') continue;
    const restore = Math.abs(Number(d.hours));
    const balanceAfter = round2(Number(purchase.hoursRemaining) + restore);
    await db.packagePurchase.update({ where: { id: purchase.id }, data: { hoursRemaining: balanceAfter } });
    await db.packageHoursLedger.create({
      data: {
        purchaseId: purchase.id, userId: d.userId, type: 'REFUND',
        hours: restore, balanceAfter, bookingId, reason: `Refunded ${restore}h from booking #${bookingId}`,
      },
    });
    refunded = round2(refunded + restore);
  }
  return refunded;
}

/** Lazy expiry: flip past-due ACTIVE buckets to EXPIRED + forfeiture ledger row. */
export async function expirePackagesForUser(userId: number, db: Db = prisma): Promise<void> {
  const now = new Date();
  const stale = await db.packagePurchase.findMany({
    where: { userId, status: 'ACTIVE', deletedAt: null, expiresAt: { lt: now } },
  });
  for (const p of stale) {
    const forfeited = Number(p.hoursRemaining);
    await db.packagePurchase.update({ where: { id: p.id }, data: { status: 'EXPIRED', hoursRemaining: 0 } });
    if (forfeited > 0) {
      await db.packageHoursLedger.create({
        data: {
          purchaseId: p.id, userId, type: 'EXPIRY',
          hours: -forfeited, balanceAfter: 0, reason: `Expired ${forfeited}h`,
        },
      });
    }
  }
}

type PurchaseRow = {
  id: number; nameSnapshot: string; hoursPurchased: number; hoursRemaining: Prisma.Decimal;
  maxSkillsSnapshot: number; status: 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'REFUNDED';
  purchasedAt: Date | null; expiresAt: Date | null;
};

function toPurchaseDto(r: PurchaseRow) {
  return {
    id: r.id, packageName: r.nameSnapshot, hoursPurchased: r.hoursPurchased,
    hoursRemaining: Number(r.hoursRemaining), maxSkills: r.maxSkillsSnapshot,
    status: r.status, purchasedAt: r.purchasedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
  };
}

export async function getMyPackageHours(firebaseUid: string): Promise<PackageHoursBalance> {
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) throw errors.notFound('User not found');
  await expirePackagesForUser(user.id);
  const rows = await prisma.packagePurchase.findMany({
    where: { userId: user.id, deletedAt: null, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
  });
  const active = rows.filter((r) => r.status === 'ACTIVE');
  const now = new Date();
  const availableHours = round2(
    active.filter((r) => !r.expiresAt || r.expiresAt > now)
      .reduce((s, r) => s + Number(r.hoursRemaining), 0),
  );
  return { availableHours, buckets: rows.map(toPurchaseDto) };
}
```
> Note on `creditPurchaseHours`: `expiresAt` is computed at **purchase-creation** time (Task 4) as `now + validityDays`, so this function just promotes `PENDING_PAYMENT → ACTIVE`. Delete the placeholder `expiresAt` math and keep `expiresAt: purchase.expiresAt` — the test doesn't cover expiry math here.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test --filter=@nanny-app/backend -- package-hours`
Expected: PASS (both describe blocks).

- [ ] **Step 5: Commit**
```bash
git add apps/backend/src/services/package-hours.service.ts apps/backend/src/__tests__/package-hours.service.test.ts
git commit -m "feat(backend): package-hours ledger engine (balance, FIFO redeem, refund, expiry)"
```

---

### Task 4: `package-purchase.service.ts` — catalog + purchase intent + balance

**Files:**
- Create: `apps/backend/src/services/package-purchase.service.ts`
- Test: `apps/backend/src/__tests__/package-purchase.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `errors`, `getMyPackageHours` (Task 3), `createPaymobIntentionForPackagePurchase` (Task 5).
- Produces:
  - `listActivePackages(): Promise<PublicPackage[]>` — active, `expiresAt` (catalog offer) null-or-future
  - `createPackagePurchase(firebaseUid: string, input: PurchasePackageInput): Promise<{ purchaseId: number }>` — snapshots package into a `PENDING_PAYMENT` row with `expiresAt = now + validityDays`

- [ ] **Step 1: Write failing tests**
```ts
jest.mock('@backend/db/prisma', () => ({
  prisma: { package: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    packagePurchase: { create: jest.fn(), findFirst: jest.fn() } },
}));
import { prisma } from '@backend/db/prisma';
import { listActivePackages, createPackagePurchase } from '@backend/services/package-purchase.service';
const m = prisma as unknown as Record<string, Record<string, jest.Mock>>;
beforeEach(() => jest.clearAllMocks());

it('lists only active, offer-not-expired packages as public DTOs', async () => {
  m.package.findMany.mockResolvedValue([{
    id: 1, name: 'Starter', description: null, hours: 50, price: '2000.00',
    validityDays: 90, maxSkills: 2, isActive: true, expiresAt: null,
    createdAt: new Date(), deletedAt: null,
  }]);
  const list = await listActivePackages();
  expect(list[0]).toMatchObject({ id: 1, price: 2000, validityDays: 90, maxSkills: 2 });
  expect(list[0]).not.toHaveProperty('isActive');
});

it('snapshots the package into a PENDING_PAYMENT purchase with computed expiry', async () => {
  m.user.findUnique.mockResolvedValue({ id: 7 });
  m.packagePurchase.findFirst.mockResolvedValue(null); // no active package yet
  m.package.findFirst.mockResolvedValue({
    id: 1, name: 'Starter', hours: 50, price: '2000.00', validityDays: 90,
    maxSkills: 2, isActive: true, expiresAt: null, deletedAt: null,
  });
  m.packagePurchase.create.mockResolvedValue({ id: 55 });
  const res = await createPackagePurchase('uid', { packageId: 1 });
  expect(res.purchaseId).toBe(55);
  const arg = m.packagePurchase.create.mock.calls[0][0].data;
  expect(arg).toMatchObject({ userId: 7, packageId: 1, nameSnapshot: 'Starter',
    hoursPurchased: 50, maxSkillsSnapshot: 2, status: 'PENDING_PAYMENT' });
  expect(arg.expiresAt).toBeInstanceOf(Date);
});

it('rejects (409) a second purchase while an active package still has hours', async () => {
  m.user.findUnique.mockResolvedValue({ id: 7 });
  m.packagePurchase.findFirst.mockResolvedValue({ id: 40, status: 'ACTIVE', hoursRemaining: '12.00' });
  await expect(createPackagePurchase('uid', { packageId: 1 })).rejects.toMatchObject({ statusCode: 409 });
  expect(m.packagePurchase.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm test --filter=@nanny-app/backend -- package-purchase`

- [ ] **Step 3: Implement**
```ts
import type { PublicPackage, PurchasePackageInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listActivePackages(): Promise<PublicPackage[]> {
  const now = new Date();
  const rows = await prisma.package.findMany({
    where: {
      deletedAt: null, isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { price: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, description: r.description, hours: r.hours,
    price: Number(r.price), validityDays: r.validityDays, maxSkills: r.maxSkills,
  }));
}

export async function createPackagePurchase(
  firebaseUid: string, input: PurchasePackageInput,
): Promise<{ purchaseId: number }> {
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) throw errors.notFound('User not found');

  // Invariant: at most one ACTIVE package per user. Block a second purchase while
  // the parent still holds an active, non-expired package with hours remaining.
  const now = new Date();
  const activeExisting = await prisma.packagePurchase.findFirst({
    where: {
      userId: user.id, status: 'ACTIVE', deletedAt: null,
      hoursRemaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (activeExisting) {
    throw errors.conflict('You already have an active package. Use it up or wait for it to expire before buying another.');
  }

  const pkg = await prisma.package.findFirst({
    where: { id: input.packageId, deletedAt: null, isActive: true },
  });
  if (!pkg) throw errors.notFound('Package not found');
  if (pkg.expiresAt && pkg.expiresAt <= now) throw errors.conflict('Package is no longer offered');

  const purchase = await prisma.packagePurchase.create({
    data: {
      userId: user.id, packageId: pkg.id, nameSnapshot: pkg.name,
      hoursPurchased: pkg.hours, pricePaid: pkg.price, maxSkillsSnapshot: pkg.maxSkills,
      hoursRemaining: 0, status: 'PENDING_PAYMENT',
      expiresAt: new Date(now.getTime() + pkg.validityDays * DAY_MS),
    },
  });
  return { purchaseId: purchase.id };
}
```

- [ ] **Step 4: Run — expect PASS.** `pnpm test --filter=@nanny-app/backend -- package-purchase`

- [ ] **Step 5: Commit**
```bash
git add apps/backend/src/services/package-purchase.service.ts apps/backend/src/__tests__/package-purchase.service.test.ts
git commit -m "feat(backend): public package catalog + purchase-intent snapshot service"
```

---

### Task 5: Package payment settlement — separate handler + purpose dispatch

> **Design decision (owner, supersedes the original plan):** package-purchase payments are
> settled by a **separate handler**, NOT by branching inside `finalizePaymentCaptured`.
> The existing guard in `finalizePaymentCaptured` (added in `fc935c1`) stays as-is: it
> returns early when `bookingId` is null.
>
> **The trap this task must close:** `processPaymobWebhook`, `syncPaymobPaymentForBooking`,
> and `reconcileStalePaymobPayments` currently funnel *unconditionally* into
> `finalizePaymentCaptured`. With a separate handler and no dispatch, every PACKAGE capture
> would hit that guard and be **logged-and-dropped forever** — the parent pays and never
> receives hours. Purpose-based dispatch at each entry point is the core of this task, not
> an afterthought.

**Files:**
- Create: `apps/backend/src/services/package-payment.service.ts` (intention + capture/failure settlement for PACKAGE payments)
- Modify: `apps/backend/src/services/paymob.service.ts` (purpose dispatch at the three entry points)
- Test: `apps/backend/src/__tests__/package-payment.service.test.ts` (new)

**Interfaces:**
- Consumes: `creditPurchaseHours` (Task 3); the purchase row from `createPackagePurchase` (Task 4); the existing Paymob API client + config used by `createPaymobIntentionForBooking`.
- Produces:
  - `createPaymobIntentionForPackagePurchase(decoded: DecodedIdToken, purchaseId: number): Promise<{ paymentId: number; clientSecret: string; publicKey: string; intentionId: string }>`
  - `finalizePackagePaymentCaptured(paymentId: number, paymobTransactionId: string | null): Promise<void>` — idempotent
  - `finalizePackagePaymentFailed(paymentId: number, reason: string): Promise<void>`
  - `syncPaymobPaymentForPackagePurchase(decoded: DecodedIdToken, purchaseId: number): Promise<{ status: PaymentStatus }>` — post-checkout poll for mobile

- [ ] **Step 1: Write the failing dispatch tests first**

The dispatch is the risk; test it first. In `package-payment.service.test.ts`, assert:
1. A captured payment with `purpose: 'PACKAGE'` routes to `finalizePackagePaymentCaptured` and credits hours — and does NOT reach the booking-confirmation path.
2. A captured payment with `purpose: 'BOOKING'` still routes to `finalizePaymentCaptured` (existing behavior unchanged — this is the regression guard).
3. `finalizePackagePaymentCaptured` is idempotent: called twice for the same payment, hours are credited once (assert `creditPurchaseHours` called once, or that a second call is a no-op because status is no longer `PENDING`).
4. A PACKAGE capture is NOT silently dropped by `finalizePaymentCaptured`'s null-`bookingId` guard.

Mock `package-hours.service` and Prisma per existing patterns. Note `finalizePaymentCaptured` is module-private — reach dispatch through the exported entry points (`processPaymobWebhook` / `reconcileStalePaymobPayments`); `reconcileStalePaymobPayments` has the fewest preconditions (no HMAC, no ownership checks) and was used as the seam for the existing guard test in `fc935c1` — follow that precedent.

Run: `pnpm test --filter=@nanny-app/backend -- package-payment` → Expected: FAIL.

- [ ] **Step 2: Add the settlement handler**

Create `package-payment.service.ts`. `finalizePackagePaymentCaptured` mirrors the shape of `finalizePaymentCaptured` but for purchases — inside a `prisma.$transaction`:
```ts
const payment = await tx.payment.findFirst({
  where: { id: paymentId, deletedAt: null, status: PaymentStatus.PENDING, purpose: 'PACKAGE' },
});
if (!payment || !payment.packagePurchaseId) return;   // idempotent: already settled or not ours
await tx.payment.update({
  where: { id: paymentId },
  data: {
    status: PaymentStatus.CAPTURED,
    paymobTransactionId: paymobTransactionId ?? undefined,
    failureReason: null, paymobNextReconcileAt: null, paymobClientSecret: null,
  },
});
await creditPurchaseHours(tx, payment.packagePurchaseId);
```
The `status: PENDING` filter is what makes it idempotent — a replayed webhook finds no row and returns. `creditPurchaseHours` (Task 3) is itself idempotent on `PENDING_PAYMENT`, giving belt-and-braces.

`finalizePackagePaymentFailed` mirrors `finalizePaymentFailed`: mark the payment `FAILED` with `failureReason`, and leave the purchase in `PENDING_PAYMENT` (it never becomes ACTIVE, so no hours are granted and the single-active-package rule is not tripped by an abandoned attempt).

- [ ] **Step 3: Add purpose dispatch at all three entry points**

In `paymob.service.ts`, before calling `finalizePaymentCaptured`, load the payment's `purpose` and route. Do this in **`processPaymobWebhook`**, **`reconcileStalePaymobPayments`**, and (for symmetry on the failure path) wherever `finalizePaymentFailed` is called:
```ts
const purpose = await getPaymentPurpose(paymentId);   // small helper: findFirst select purpose
if (purpose === 'PACKAGE') {
  await finalizePackagePaymentCaptured(paymentId, txnId);
} else {
  await finalizePaymentCaptured(paymentId, txnId);
}
```
`syncPaymobPaymentForBooking` is booking-scoped by signature (it takes a `bookingId`) — leave it alone and add the separate `syncPaymobPaymentForPackagePurchase` for the mobile post-checkout poll.

> Watch for an import cycle: `paymob.service.ts` importing `package-payment.service.ts` while the latter reuses Paymob helpers. If the helpers you need (`api.createIntention`, config, `resetPaymentData`) are module-private, export them or lift them into a shared module rather than duplicating them. If this turns structural, report DONE_WITH_CONCERNS rather than restructuring broadly.

- [ ] **Step 4: Add the intention creator**

Mirror `createPaymobIntentionForBooking`, keyed on the purchase: guard that the purchase exists, belongs to the caller, and is `PENDING_PAYMENT`; reuse a fresh unexpired intention if one exists (same TTL logic); create/update the `Payment` with `{ packagePurchaseId, motherId, purpose: 'PACKAGE', amount: Number(purchase.pricePaid) }` and **no** `bookingId`; call `api.createIntention` with `extras: { payment_id: String(payment.id) }`; store `paymobIntentionId`/`paymobClientSecret` back. Return `{ paymentId, clientSecret, publicKey, intentionId }`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm test --filter=@nanny-app/backend -- package-payment` → Expected: PASS.
Then the full suite: `pnpm test --filter=@nanny-app/backend` → Expected: all passing (baseline was 37 suites / 415 tests; booking-payment behavior must be unchanged).

- [ ] **Step 6: Commit**
```bash
git add apps/backend/src/services/package-payment.service.ts apps/backend/src/services/paymob.service.ts apps/backend/src/__tests__/package-payment.service.test.ts
git commit -m "feat(backend): separate package payment settlement handler + purpose dispatch"
```

---

### Task 6: Apply package hours during `createBooking`

**Files:**
- Modify: `apps/backend/src/services/booking.service.ts` (`createBooking` ~555-600; pricing transaction)
- Modify: `packages/shared/src/booking.ts` (add `usePackageHours?: boolean` to the create-booking request schema, default `true`)
- Test: `apps/backend/src/__tests__/booking-package-hours.service.test.ts` (new)

**Interfaces:**
- Consumes: `getAvailableHours`, `redeemPackageHours` (Task 3); the existing `buildBreakdown` (`pricing-config.service.ts`).
- Produces: `createBooking` sets `packageHoursApplied`, `packageSkillsCovered`, `packageCreditAmount`, and folds `packageCreditAmount` into `discountAmount`.

**Decision (resolved):** because a user holds **at most one active package** (invariant enforced at purchase, Task 4), redemption draws from that single active bucket and the free-skill allowance = **that package's `maxSkillsSnapshot`**; the **N most-expensive** selected skills are waived. `redeemPackageHours` returns `maxSkillsAllowed` (the active bucket's value). Redemption runs inside the same `$transaction` as booking creation so a failure rolls back the ledger too.

- [ ] **Step 1: Add `usePackageHours` to the request schema** (`booking.ts`), default `true`. Typecheck.

- [ ] **Step 2: Write failing test** — a booking for a mother with 10 available hours, duration 6h, baseRate 40, two skills selected, `maxSkillsAllowed = 2`: assert `packageHoursApplied === 6`, `packageSkillsCovered === 2`, `packageCreditAmount === round2(6*40 + waivedSkillFees)`, and `discountAmount` increased by `packageCreditAmount`. Mock `getAvailableHours`→10 and `redeemPackageHours`→`{ hoursApplied: 6, maxSkillsAllowed: 2, purchaseIds: [1] }`.

- [ ] **Step 3: Implement in `createBooking`** — inside the existing pricing transaction, after computing `durationHours` and resolving skill add-ons but before/around `buildBreakdown`:
```ts
let packageHoursApplied = 0;
let packageSkillsCovered = 0;
let packageCreditAmount = 0;

if (input.usePackageHours !== false) {
  const available = await getAvailableHours(motherId, tx);
  if (available > 0) {
    const redeem = await redeemPackageHours(tx, {
      userId: motherId, bookingId: booking.id, hoursNeeded: durationHours,
    });
    packageHoursApplied = redeem.hoursApplied;
    // Waive the N most-expensive selected skills, N = redeem.maxSkillsAllowed
    const sortedFees = [...perHourSkillFees].sort((a, b) => b - a);
    const waivedPerHour = sortedFees.slice(0, redeem.maxSkillsAllowed).reduce((s, f) => s + f, 0);
    packageSkillsCovered = Math.min(redeem.maxSkillsAllowed, perHourSkillFees.length);
    packageCreditAmount = round2(packageHoursApplied * Number(baseRate) + waivedPerHour * packageHoursApplied);
  }
}
// Fold into discountAmount fed to buildBreakdown, then persist the three package* fields on the booking row.
```
> `perHourSkillFees` = the per-hour EGP fee of each selected skill (already resolved for `effectiveHourlyRate`). Because booking is created before redemption needs its `id`, create the booking row first (status PENDING) then apply hours + update the row's package fields + recomputed totals within the same `tx` — matching `redeemBookingPoints`'s "apply-to-persisted-booking" shape.

- [ ] **Step 4: Add refund on cancellation** — in the booking-cancellation path, call `refundPackageHours(tx, booking.id)` (mirrors `refundBookingIfApplied`). Add a small test.

- [ ] **Step 5: Run + commit**
```bash
pnpm test --filter=@nanny-app/backend -- booking-package-hours
git add apps/backend/src/services/booking.service.ts packages/shared/src/booking.ts apps/backend/src/__tests__/booking-package-hours.service.test.ts
git commit -m "feat(backend): auto-apply prepaid package hours + free skills at booking creation"
```

---

### Task 7: Public parent routes

**Files:**
- Create: `apps/backend/src/routes/package.routes.ts`
- Modify: `apps/backend/src/routes/index.ts` (mount alongside line ~35)

**Interfaces:**
- Consumes: `listActivePackages`, `createPackagePurchase` (Task 4), `getMyPackageHours` (Task 3), `createPaymobIntentionForPackagePurchase` (Task 5).

- [ ] **Step 1: Implement router** (template `reward.routes.ts`):
```ts
import { PurchasePackageSchema } from '@nanny-app/shared';
import { Router } from 'express';

import { errors } from '@backend/lib/errors';
import { ok } from '@backend/lib/api-response';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import { getMyPackageHours } from '@backend/services/package-hours.service';
import { createPackagePurchase, listActivePackages } from '@backend/services/package-purchase.service';
import { createPaymobIntentionForPackagePurchase } from '@backend/services/package-payment.service';

export const packageRouter = Router();
packageRouter.use(requireAuth);

packageRouter.get('/', async (_req, res, next) => {
  try { res.json(ok(await listActivePackages())); } catch (err) { next(err); }
});

packageRouter.get('/me/hours', async (req, res, next) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await getMyPackageHours(req.firebaseUser.uid)));
  } catch (err) { next(err); }
});

packageRouter.post('/:id/purchase', validateBody(PurchasePackageSchema), async (req, res, next) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const { purchaseId } = await createPackagePurchase(req.firebaseUser.uid, req.body);
    const session = await createPaymobIntentionForPackagePurchase(req.firebaseUser, purchaseId);
    res.status(201).json(ok(session));
  } catch (err) { next(err); }
});

// Post-checkout poll, mirroring POST /bookings/:id/pay/paymob/sync.
// Mobile calls this when the Paymob WebView returns, so settlement does not
// depend solely on the webhook arriving.
packageRouter.post('/purchases/:id/sync', async (req, res, next) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await syncPaymobPaymentForPackagePurchase(
      req.firebaseUser, routeIdParam(req.params.id),
    )));
  } catch (err) { next(err); }
});
```
Import `syncPaymobPaymentForPackagePurchase` from `@backend/services/package-payment.service` and `routeIdParam` from `@backend/lib/route-param`.

> Route-ordering note: register `/purchases/:id/sync` **before** any `/:id`-style
> catch-all so `purchases` is not swallowed as a package id.
> `PurchasePackageSchema` ignores the `:id` path param; the body carries `packageId`. Keep the route path RESTful; validate `routeIdParam(req.params.id)` matches `req.body.packageId` (throw `errors.badRequest` on mismatch) for defensiveness.

- [ ] **Step 2: Mount in `routes/index.ts`**: `import { packageRouter } from './package.routes';` then `apiRouter.use('/packages', packageRouter);`

- [ ] **Step 3: Typecheck + commit**
```bash
pnpm typecheck
git add apps/backend/src/routes/package.routes.ts apps/backend/src/routes/index.ts
git commit -m "feat(backend): public /packages catalog, purchase, and /packages/me/hours routes"
```

---

### Task 8: Admin form + table fields (web)

**Files:**
- Modify: `apps/admin/src/features/packages/package-form.tsx`, `package-table.tsx`
- Modify: `apps/admin/src/lib/api.ts` (types flow from shared — verify create/update payloads include new fields)

- [ ] **Step 1:** Add `validityDays` (number, required, min 1) and `maxSkills` (number, min 0, default 0) inputs to `package-form.tsx`, reusing `Field`/`Input`. Wire into the create/update payload.
- [ ] **Step 2:** Add "Validity (days)" and "Free skills" columns to `package-table.tsx`.
- [ ] **Step 3:** `pnpm typecheck` (admin). Commit:
```bash
git add apps/admin/src/features/packages apps/admin/src/lib/api.ts
git commit -m "feat(admin): package validityDays + maxSkills form fields and columns"
```

---

### Task 9: Seed demo packages — ✅ COMPLETE (commit `fc935c1`)

> Already done, do NOT redo. `SEED_PACKAGES` carries `validityDays`/`maxSkills`
> (Starter 30d/0, Standard 60d/1, Premium 90d/2) and the `upsert` threads both
> fields through `create` and `update`. Idempotency preserved.

**Files:** Modify `apps/backend/prisma/seed-demo.ts`

- [ ] **Step 1:** Extend the existing package `upsert`s (unique `name`) to include `validityDays` and `maxSkills` (e.g. Starter 20h/60d/1 skill, Standard 50h/90d/2, Premium 100h/180d/3). Idempotent.
- [ ] **Step 2:** Commit:
```bash
git add apps/backend/prisma/seed-demo.ts
git commit -m "chore(backend): seed demo packages with validity + free-skill allowance"
```

---

## Self-Review Notes
- Spec §1 → Task 1; §2 → Task 2; §3 (catalog/purchase/balance/redeem/refund/expiry) → Tasks 3–7; §4 admin → Task 8; seed → Task 9. All covered.
- **Single-active-package invariant** (user decision): enforced at purchase (Task 4, 409 conflict). This makes the free-skill allowance unambiguous = the active package's `maxSkills` (Task 6). The `redeemPackageHours` engine is written generally (loops over buckets) but in practice sees one active bucket; its 2-bucket unit test documents engine correctness only.
- Redemption is auto (opt-in flag `usePackageHours`, default true) per spec §3/§5, applied in the pricing transaction so skill-fee waiver is consistent.
