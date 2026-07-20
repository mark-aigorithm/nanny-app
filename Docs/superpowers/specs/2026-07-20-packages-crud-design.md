# Packages Module — Backend + Admin CRUD — Design

Date: 2026-07-20
Status: Approved

## Goal

Add a new `Package` entity and full CRUD management for it in the admin app. A
package bundles a number of hours for a fixed price (e.g. "Starter Pack — 50
hours for 2000 EGP"). Backend + admin only for this iteration — **not** wired to
mobile. Mirrors the existing certifications module in structure and conventions.

## Decisions

- **Integer sequential IDs.** `id Int @id @default(autoincrement())`, per the
  user's request and the certifications precedent (root CLAUDE.md's cuid rule is
  superseded for these newer catalog modules — see
  `2026-07-17-sequential-int-ids-design.md`).
- **Name + optional description.** Packages carry a unique `name` and optional
  `description`, matching the certification catalog shape.
- **`hours` is a whole integer** (`Int`, ≥ 1). Matches the "50 hours" example; no
  fractional hours.
- **`price` as `Decimal(10,2)`.** Project money convention (`@db.Decimal(10,2)`),
  single currency **EGP**. No currency column; the admin UI labels amounts as EGP
  (e.g. "2,000 EGP"). Price crosses the API as a JS `number`; the service converts
  Prisma `Decimal ↔ number`.
- **`isActive` flag.** `Boolean @default(true)`, same as certifications.
- **`expiresAt` nullable catalog offer end date.** `DateTime?`; the datetime after
  which the package is no longer offered. `null` = never expires. (This is the
  catalog listing's expiry, not a per-purchase validity duration.)
- **Soft delete.** Per repo convention every model includes `created_at`,
  `updated_at`, `deleted_at`; all reads filter `deleted_at IS NULL`, deletes are
  soft (`update` sets `deleted_at`).
- **Admin-only for now.** No public/mobile list function or route. No
  `listActivePackages` equivalent yet — added later when mobile consumes it.

## 1. Data model — `apps/backend/prisma/schema.prisma`

New model:

```prisma
model Package {
  id          Int       @id @default(autoincrement())
  name        String    @unique
  description String?   @db.Text
  hours       Int
  price       Decimal   @db.Decimal(10, 2)
  isActive    Boolean   @default(true) @map("is_active")
  expiresAt   DateTime? @map("expires_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt      @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  @@index([deletedAt])
  @@map("packages")
}
```

Migration: `pnpm db:migrate:dev --name add_packages_table`.

## 2. Shared schemas — `packages/shared/src/package.ts`

Exported from `packages/shared/src/index.ts`. Imports nothing internal.

- `PackageSchema` — full admin DTO:
  ```ts
  {
    id: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
    hours: z.number().int(),
    price: z.number(),            // Decimal serialized to number
    isActive: z.boolean(),
    expiresAt: z.string().nullable(),  // ISO string or null
    createdAt: z.string(),
  }
  ```
- `CreatePackageSchema`:
  ```ts
  {
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    hours: z.number().int().min(1),
    price: z.number().positive().multipleOf(0.01),
    isActive: z.boolean().default(true),
    expiresAt: z.string().datetime().optional(),  // ISO 8601
  }
  ```
- `UpdatePackageSchema` — every field optional, `expiresAt` also
  `.nullable()` so it can be cleared, with `.refine(v => Object.keys(v).length > 0)`
  requiring at least one field.

Corresponding inferred types: `Package`, `CreatePackageInput`, `UpdatePackageInput`.

## 3. Backend service — `apps/backend/src/services/package.service.ts`

Mirrors `certification.service.ts`. A local `PackageRow` type and a `toDto` mapper
that converts `price` via `Number(row.price)` and `expiresAt`/`createdAt` via
`?.toISOString() ?? null`.

- `listPackages(): Promise<Package[]>` — `findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } })`.
- `createPackage(input): Promise<Package>` — unique-name conflict guard
  (`errors.conflict`), maps `expiresAt` string → `new Date(...)`.
- `updatePackage(id, input): Promise<Package>` — `findFirst({ id, deletedAt: null })`
  or `errors.notFound`; rename conflict guard; spreads only provided fields;
  `expiresAt` set to `new Date(...)` when a string, `null` when explicitly null.
- `deletePackage(id): Promise<{ id: number }>` — soft delete via
  `update({ data: { deletedAt: new Date() } })`.

## 4. Backend routes — `apps/backend/src/routes/admin.routes.ts`

New section mirroring certifications:

- `GET    /admin/packages`        → `listPackages`
- `POST   /admin/packages`        → `validateBody(CreatePackageSchema)` → `createPackage` (201)
- `PATCH  /admin/packages/:id`    → `validateBody(UpdatePackageSchema)` → `updatePackage`
- `DELETE /admin/packages/:id`    → `deletePackage`

Uses existing `routeIdParam`, `ok`, `validateBody` helpers.

## 5. Backend tests — `apps/backend/src/__tests__/package.service.test.ts`

Jest, Prisma mocked (`jest.mock`), matching `certification.service.test.ts`
coverage: list, create (success + name conflict), update (success + not-found +
rename conflict + clearing expiresAt), delete (success + not-found). Keeps the
package ≥ 80% coverage gate green.

## 6. Admin frontend

- **`lib/api.ts`** — `fetchPackages`, `createPackage`, `updatePackage`,
  `deletePackage` (typed, unwrap `{ data, error }`).
- **`pages/packages-page.tsx`** — `PageHeader` + `PackageForm` + `PackageTable`,
  TanStack Query `['packages']`, `TableSkeleton` / `ErrorState` states (mirrors
  `certifications-page.tsx`).
- **`features/packages/package-form.tsx`** — create form: name, description,
  hours, price (labeled EGP), isActive, optional expiresAt (date input). Reuses
  `Field`, `Input`, `Button`; reports via `useToast`; invalidates `['packages']`.
- **`features/packages/package-table.tsx`** — columns: Name, Hours, Price (EGP),
  Active, Expires At, actions (edit inline/modal + delete via `ConfirmDialog`),
  mirroring `certification-table.tsx`.
- **Nav** — add route in `apps/admin/src/app.tsx` (lowercase entry file per repo
  memory) and a nav item + lucide icon in `admin-layout.tsx` / `ui/icon.tsx`.

## 7. Seed — `apps/backend/prisma/seed-demo.ts`

Add 2–3 idempotent demo packages via `upsert` on unique `name` (e.g. Starter 20h,
Standard 50h, Premium 100h) with EGP prices.

## Out of scope

- Mobile wiring (no `useNannies`-style hook, no public schema/endpoint).
- Purchase/checkout flow, linking packages to bookings or parents.
- Multi-currency support.

## Verification

Per repo memory (`local-dev-constraints`): no Docker/DB locally. Verify via
`pnpm typecheck` (backend + admin + shared) and `pnpm test --filter=@nanny-app/backend`
for the service tests. Migration SQL reviewed by hand before commit.
