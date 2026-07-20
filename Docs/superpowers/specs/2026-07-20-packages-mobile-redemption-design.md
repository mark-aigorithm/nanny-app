# Packages Module — Mobile Wiring: Purchase + Redemption — Design

Date: 2026-07-20
Status: Approved

## Goal

Wire the existing admin-only `Package` catalog into the parent-facing product:
parents **browse** active packages, **purchase** a bundle of hours (via Paymob),
and **redeem** those hours against bookings (1 prepaid hour = 1 hour of care).
Each package also grants a configurable number of **free skill add-ons** on a
package-paid booking. Builds on `2026-07-20-packages-crud-design.md` (which
delivered the admin catalog + CRUD, explicitly excluding purchase/redemption).

## Decisions

- **Full lifecycle this iteration.** Browse → purchase → redeem, end to end
  (backend + mobile).
- **Per-package validity → per-purchase buckets.** Each `Package` defines
  `validityDays`; each purchase becomes its own expiring bucket. Bookings consume
  hours **FIFO** (soonest-to-expire first). This rules out a single pooled balance.
- **1 prepaid hour = 1 hour of care (time, not money).** A prepaid hour cancels an
  hour of the booking's base duration regardless of the nanny's rate; the platform
  absorbs rate variance (the package is a genuine bulk-time discount). The booking
  snapshots both the hours applied and their EGP value for accounting/refunds.
- **Configurable free skills per package.** `Package.maxSkills` = number of skill
  add-ons **included free** on a package-paid booking. When more than `maxSkills`
  skills are selected, the **N most expensive** are waived (best for the parent)
  and the remainder are billed normally. Snapshotted onto the purchase.
- **Polymorphic `Payment`.** One payment table serves both bookings and package
  purchases. `bookingId` becomes nullable; add nullable unique `packagePurchaseId`
  and a `purpose` enum (`BOOKING | PACKAGE`). One Paymob intention / webhook /
  reconciliation path for both.
- **Append-only hours ledger.** `PackageHoursLedger` records every hours movement
  (purchase, redemption, refund, expiry, admin adjust), modeled on
  `RewardLedgerEntry`. Needed because FIFO consumption spans buckets and refunds
  must be reversible per bucket.
- **No cached hours-wallet.** Available balance is derived:
  `SUM(hoursRemaining)` over the parent's `ACTIVE`, non-expired purchases. Avoids
  the sync-drift risk a denormalized wallet would introduce.
- **Snapshot-on-purchase.** `PackagePurchase` freezes `nameSnapshot`,
  `hoursPurchased`, `pricePaid`, `maxSkillsSnapshot`, and `expiresAt` so later
  catalog edits or soft-deletes never corrupt a parent's owned hours.

## 1. Data model — `apps/backend/prisma/schema.prisma`

### 1.1 `Package` — 2 new fields

```prisma
validityDays Int  @map("validity_days")            // days a purchase stays usable
maxSkills    Int  @default(0) @map("max_skills")   // free skill add-ons on a package-paid booking
```

### 1.2 `PackagePurchase` — new model (the bucket)

```prisma
model PackagePurchase {
  id                Int                   @id @default(autoincrement())
  userId            Int                   @map("user_id")
  user              User                  @relation("PackagePurchaseUser", fields: [userId], references: [id])
  packageId         Int                   @map("package_id")
  package           Package               @relation(fields: [packageId], references: [id])
  // Snapshots frozen at purchase time
  nameSnapshot      String                @map("name_snapshot")
  hoursPurchased    Int                   @map("hours_purchased")
  pricePaid         Decimal               @map("price_paid") @db.Decimal(10, 2)
  maxSkillsSnapshot Int                   @map("max_skills_snapshot")
  hoursRemaining    Decimal               @default(0) @map("hours_remaining") @db.Decimal(6, 2)
  status            PackagePurchaseStatus @default(PENDING_PAYMENT)
  purchasedAt       DateTime?             @map("purchased_at")   // set when payment completes
  expiresAt         DateTime?             @map("expires_at")     // purchasedAt + validityDays
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

enum PackagePurchaseStatus {
  PENDING_PAYMENT
  ACTIVE
  EXPIRED
  REFUNDED

  @@map("package_purchase_status")
}
```

### 1.3 `PackageHoursLedger` — new model (append-only movements)

```prisma
model PackageHoursLedger {
  id           Int                    @id @default(autoincrement())
  purchaseId   Int                    @map("purchase_id")
  purchase     PackagePurchase        @relation(fields: [purchaseId], references: [id])
  userId       Int                    @map("user_id")
  user         User                   @relation("PackageHoursLedgerUser", fields: [userId], references: [id])
  type         PackageHoursEntryType
  hours        Decimal                @db.Decimal(6, 2)   // signed: + credit, - debit
  balanceAfter Decimal                @map("balance_after") @db.Decimal(6, 2)
  reason       String?
  bookingId    Int?                   @map("booking_id")  // set on REDEMPTION / REFUND
  booking      Booking?               @relation(fields: [bookingId], references: [id])
  adminId      Int?                   @map("admin_id")    // set on ADMIN_ADJUST
  admin        User?                  @relation("PackageHoursLedgerAdmin", fields: [adminId], references: [id])
  createdAt    DateTime               @default(now()) @map("created_at")
  updatedAt    DateTime               @updatedAt @map("updated_at")
  deletedAt    DateTime?              @map("deleted_at")

  @@index([userId, createdAt])
  @@index([purchaseId])
  @@index([bookingId])
  @@map("package_hours_ledger")
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

### 1.4 `Payment` — polymorphic

```prisma
bookingId         Int?  @map("booking_id")          // WAS required @unique → nullable @unique
packagePurchaseId Int?  @unique @map("package_purchase_id")
purpose           PaymentPurpose @default(BOOKING)

enum PaymentPurpose {
  BOOKING
  PACKAGE

  @@map("payment_purpose")
}
```

Service-layer invariant: exactly one of `bookingId` / `packagePurchaseId` is set
(enforced in the service, matching the repo's "guards live in the service" pattern).

### 1.5 `Booking` — 3 new snapshot fields (mirror `rewardCredit*`)

```prisma
packageHoursApplied  Decimal @default(0) @map("package_hours_applied") @db.Decimal(6, 2)
packageSkillsCovered Int     @default(0) @map("package_skills_covered")
packageCreditAmount  Decimal @default(0) @map("package_credit_amount") @db.Decimal(10, 2)
```

`packageCreditAmount` = (hours applied × baseRate) + waived skill-fee value; folded
into the existing discount math so `totalAmount` drops accordingly. `nannyAmount`
is unaffected — the platform pays the nanny in full.

Relations added to `User`: `packagePurchases`, `packageHoursLedger`,
`packageHoursGrants` (admin). Relation added to `Booking`: `packageHoursLedger`.

Migration: `pnpm db:migrate:dev --name add_package_purchases_and_redemption`.
Review generated SQL by hand (nullable-ising `Payment.bookingId` + backfill
`purpose = BOOKING` for existing rows).

## 2. Shared schemas — `packages/shared/src/package.ts`

- Extend `PackageSchema` / `CreatePackageSchema` / `UpdatePackageSchema` with
  `validityDays` (int ≥ 1) and `maxSkills` (int ≥ 0, default 0).
- `PublicPackageSchema` — mobile catalog DTO: `id, name, description, hours, price,
  validityDays, maxSkills`. Omits internal `isActive` / catalog `expiresAt`.
- `PackagePurchaseSchema` — parent's owned bucket: `id, packageName, hoursPurchased,
  hoursRemaining, maxSkills, status, purchasedAt, expiresAt`.
- `PackageHoursBalanceSchema` — `{ availableHours: number, buckets: PackagePurchase[] }`.
- `PurchasePackageInput` — `{ packageId: number }` (method/redirect handled server-side
  like booking payments).
- Inferred types exported from `packages/shared/src/index.ts`.

## 3. Backend surface — routes + services

New `package-purchase.service.ts` + `package-hours.service.ts` (redemption/ledger).
Public routes (Firebase-authed parent):

- `GET  /packages`                       → active, offer-not-expired catalog (`PublicPackageSchema[]`)
- `POST /packages/:id/purchase`          → create `PackagePurchase(PENDING_PAYMENT)` + `Payment(PACKAGE)` Paymob intention → return client secret
- `GET  /me/package-hours`               → `PackageHoursBalanceSchema`

Payment completion (existing Paymob webhook/reconcile) branches on
`payment.purpose`: `PACKAGE` → activate purchase, set `hoursRemaining`/`expiresAt`,
write `PURCHASE` ledger entry (idempotent).

Redemption is invoked from the booking pricing/creation path:
`applyPackageHours(booking, availableBuckets)` — FIFO decrement, `REDEMPTION` ledger
rows per bucket, waive N most-expensive skills, set `Booking.package*` fields.
Cancellation/refund path writes `REFUND` rows restoring `hoursRemaining` (skipping
`EXPIRED` buckets). Expiry sweep (or lazy-on-read) flips `ACTIVE → EXPIRED` + `EXPIRY`
ledger row for the forfeited remainder.

## 4. Admin

Extend the existing Packages form + table (`features/packages/*`) with
`validityDays` and `maxSkills` inputs/columns. Read-only purchases view is out of
scope for this iteration.

## 5. Mobile — `apps/mobile`

- **Catalog screen** — browse active packages (`GET /packages`), TanStack Query
  `['packages']`.
- **Purchase flow** — `POST /packages/:id/purchase` → Paymob checkout, reusing the
  existing booking-payment UI/handoff.
- **"My Hours" screen** — balance + per-bucket expiries (`GET /me/package-hours`),
  `['package-hours']`.
- **Booking flow** — surface available hours in the price breakdown; hours
  auto-applied FIFO, showing hours covered + free skills granted.

## Out of scope

- Admin analytics / reporting on purchases.
- Gifting or transferring hours between parents.
- Multi-currency.
- Mixing cash + hours on the *same* base hour (a booking hour is either fully
  package-covered or fully cash).

## Verification

Per repo memory (`local-dev-constraints`): no Docker/DB locally. Verify via
`pnpm typecheck` (backend + mobile + shared) and
`pnpm test --filter=@nanny-app/backend` for the new service tests. Migration SQL
reviewed by hand before commit.
