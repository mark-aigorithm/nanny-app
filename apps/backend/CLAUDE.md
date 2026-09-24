# Backend API — CLAUDE.md

Node.js Express API for NannyApp. See root `.claude/CLAUDE.md` for architecture and shared conventions.

---

## Directory Structure

```
src/
├── routes/       # auth, nannies, bookings, reviews
├── services/     # auth, nannies, bookings, reviews, notifications
├── middleware/    # auth, validate, error, rateLimit
├── db/           # prisma.ts, redis.ts
└── lib/          # config.ts, logger.ts, firebase.ts, s3.ts
prisma/
└── schema.prisma
```

---

## Request Lifecycle

1. Mobile sends `Authorization: Bearer <firebase-jwt>`
2. `auth.middleware.ts` verifies token with Firebase Admin SDK
3. Route handler validates request body/query with Zod (from `@nanny-app/shared`)
4. Service layer executes business logic against Prisma / Redis
5. All responses use `ApiResponse<T>` wrapper `{ data, error, meta }`
6. Errors bubble up to `globalErrorHandler` in `error.middleware.ts`

---

## File Structure Rules

- **No business logic in routes** — routes only validate input, call one service function, return response.
- **Services are the only place** that touch Prisma, Redis, Firebase, or S3.
- **Middleware** handles cross-cutting concerns (auth, validation, rate limit, error handling).
- **One service function = one unit test** (mocked dependencies).

---

## Admin Privileges (console roles)

Three roles reach the console: `ADMIN` and `SUPERUSER` (everything), and `OPERATOR` (only the
sections the superuser granted, stored as a JSON map in `users.admin_permissions`).

- **`src/lib/admin-permissions.ts` is the source of truth.** Every admin route declares what it
  requires in `ADMIN_ROUTE_PERMISSIONS`. The table is **deny-by-default** — a route with no entry is
  refused, so adding an endpoint without declaring its privilege makes it unreachable, not open.
- Enforcement is mounted once: `adminRouter.use(requireFreshAuth, requireAdmin, requireSectionAccess)`.
  The admin console verifies revocation on every request — a token from a session that was signed
  out, disabled, or deleted must not act, even if it hasn't expired yet.
  **Never add a per-route privilege check** — add a row to the table instead.
- `hasSectionAccess` (in `@nanny-app/shared`) is the only place the rules are evaluated; the admin
  UI calls the same function, so the sidebar and the API can't disagree.
- **`admin-permissions.test.ts` walks the live router** and fails if any route is undeclared or any
  entry is stale. If it fails, the fix is a table row — not a change to the test.
- `PUT /config` is privilege-scoped by *body key* (`CONFIG_KEY_SECTIONS`), because one row is edited
  by both Pricing & Fees and Booking Options.

---

## Error Handling

- Throw `AppError(message, statusCode)` from services for expected errors.
- Unexpected errors (DB connection lost, etc.) propagate as-is to `globalErrorHandler`.
- `globalErrorHandler` is the **only place** that calls `res.status().json()` for errors.
- All responses — success and error — use `ApiResponse<T>` shape:

```typescript
// Success
{ data: T, error: null, meta?: PaginationMeta }

// Error
{ data: null, error: "Human-readable message" }
```

---

## Environment Variables (`apps/backend/.env`)

| Variable | Required | Source | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | Secrets Manager | PostgreSQL connection string |

**Production rule:** All secrets come from AWS Secrets Manager, injected as env vars by ECS task definition. `.env` files are for local dev only and must never be committed.

---

## Prisma Conventions

### Schema Design Rules

- **Every model** must include these three columns:
  ```prisma
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")
  ```
- **Soft delete only** — never use hard `DELETE`. All queries must filter `WHERE deleted_at IS NULL`. The service layer is responsible for adding this filter; never rely on the caller.
- **Naming**: Prisma fields use camelCase, DB columns use snake_case via `@map`, table names are plural snake_case via `@@map`.
- **Enums**: PascalCase in Prisma, snake_case in DB via `@@map("enum_name")`.
- **IDs**: Use `@id @default(cuid())` for all primary keys.
- **Decimals**: Use `@db.Decimal(10, 2)` for monetary values — never `Float`.
- **PostGIS**: Geography columns use `Unsupported("geography(Point, 4326)")`. All spatial queries go through `prisma.$queryRaw` in the service layer.
- **Indexes**: Add `@@index` for columns used in WHERE clauses and foreign keys queried frequently. Prisma auto-indexes `@unique` and `@relation` fields.
- **Relations**: Always define both sides of a relation. Use `@relation` name strings when a model has multiple relations to the same table.

### Prisma Client Usage

- **Single instance**: Import the Prisma client from `src/db/prisma.ts` — never instantiate `new PrismaClient()` elsewhere.
- **Soft delete in queries**: Every `findMany`, `findFirst`, `findUnique` must include `where: { deletedAt: null }` unless explicitly querying deleted records.
- **Soft delete writes**: Use `update({ data: { deletedAt: new Date() } })` — never `delete()` or `deleteMany()`.
- **Transactions**: Use `prisma.$transaction([...])` for multi-step writes that must be atomic.
- **Select only what you need**: Use `select` or `include` to avoid over-fetching. Never return full models to the client without stripping internal fields.

### Prisma 7 Config

Connection URL is configured in `prisma/prisma.config.ts` (not in `schema.prisma`). This file provides the `DATABASE_URL` to the Prisma CLI for migrations. The Prisma Client receives its connection via the adapter or URL passed in `src/db/prisma.ts`.

### Migration Workflow

```bash
# During development — create and apply a migration
pnpm db:migrate:dev --name descriptive_migration_name

# Generate Prisma client after schema changes (also runs automatically after migrate dev)
pnpm db:generate

# In production / CI — apply pending migrations (no new migration created)
pnpm db:migrate

# Browse data locally
pnpm db:studio

# Seed the database
pnpm db:seed
```

**Migration rules:**
- **Never** edit or delete a migration that has been applied to staging or production.
- **Never** use `prisma db push` in staging/production — always use migrations.
- Migration names should be descriptive: `add_users_table`, `add_booking_status_index`, `rename_hourly_rate_column`.
- When renaming a column or table, add a comment in the migration SQL to clarify intent — Prisma may generate a DROP + CREATE instead of a RENAME.
- Review generated SQL in `prisma/migrations/` before committing. Prisma's auto-generated SQL is not always optimal.
- Destructive changes (dropping columns/tables) should be split into two releases: (1) stop reading the column, (2) drop it in the next migration.
- After pulling new migrations from another branch, run `pnpm db:migrate:dev` to apply them locally.

### Seeding

- Seed file lives at `prisma/seed.ts`.
- Run with `pnpm db:seed` (configure in `package.json` under `prisma.seed`).
- Seeds must be idempotent — safe to run multiple times without duplicating data (use `upsert`).

---

## Testing

Two Jest projects, split by what they require — see `jest.config.cjs`.

| Project | Location | Dependencies | Command |
|---|---|---|---|
| `unit` | `src/__tests__/*.test.ts` | none — Prisma, Firebase and S3 are `jest.mock()`ed | `pnpm test:unit` |
| `integration` | `src/__integration__/*.test.ts` | real PostGIS DB, Auth emulator, Paymob fake | `pnpm test:integration` |

- **Run them separately, never in one `jest` invocation.** The integration project must not be
  parallelised — its tests truncate a shared database — and `maxWorkers` cannot be set per project.
  `pnpm test` runs unit then integration in sequence.
- **Unit tests are still the default** for a service function's logic: one function, one test,
  mocked dependencies. Reach for an integration test when the thing under test *is* the database —
  raw SQL / PostGIS, constraints, transactions, cascades — or the HTTP contract of a route.
- **Start the stack first** (`pnpm test:env` from the repo root), or the integration project fails
  at `globalSetup`.

### Integration fixtures (`test/`)

| Path | Purpose |
|---|---|
| `env.ts` | Loads `.env.test` and **refuses to run** unless `DATABASE_URL` targets `nannyapp_test` |
| `db/global-setup.ts` | Once per run: `prisma migrate deploy`, then seeds `app_settings` |
| `db/reset.ts` | Per test: truncate every table, restore the seeded settings |
| `factories/` | `makeMother`, `makeNanny`, `makeBooking`, `makeOperator`, … — each creates the Firebase emulator account *and* the DB row, and returns a usable ID token |
| `auth.ts` | `signInAs(email)` → a real ID token from the emulator; `authHeader(token)` for supertest |
| `fakes/paymob-server.ts` | Stands in for Paymob; signs webhooks with the **production** HMAC helpers so it cannot drift from the verifier |

- **Never hand-build an entity in an integration test** — add or extend a factory. And never
  hand-compute a price: `makeBooking` runs the real `calculatePriceBreakdown` from
  `@nanny-app/shared`, so totals stay correct when the pricing rules change.
- Tests must be order-independent. `db/reset.ts` and `clearEmulatorUsers()` both run in
  `beforeEach`; nothing may rely on a previous test's rows.

- Coverage threshold: 80% (enforced in CI — not yet wired; see the CI plan).

---

## Known Gotchas

**Upload URLs are accepted only from the caller's own folder**
`lib/storage-url.ts` refuses any `avatarUrl` / `idDocumentFrontUrl` / `idDocumentBackUrl` that
isn't a download URL for `<folder>/<uid>/…` in our bucket — otherwise a client could pin its
profile or KYC record to someone else's upload, or to any image on the web. In every real
environment this checks host, protocol and bucket as well as the path. The one relaxation is
path-only matching when `UPLOAD_URL_EMULATOR_HOST` is set (`.env.test` sets it; `config.ts`
refuses it outright in production): the mobile device lab keeps the app's Storage on the emulator
in both its suites (even `start:test:live-auth`, which points Auth at the real project), so its
upload URLs come from `10.0.2.2:9199` and name the app's real bucket, which the backend's test
config doesn't otherwise recognise.

**A Firebase account without a `users` row is an unfinished sign-up, not garbage**
Registration creates the Firebase account first and the row last, so a row-less uid is someone
mid-wizard. `/auth/me` 404s for it and the app resumes the wizard; nothing deletes it on sight
(the one exception is client-side: an SMS sign-in that mints a phone-only account for an unknown
number discards it).
`DELETE /auth/me` has two modes: **no body** discards the caller's own row-less account (409 if a
row exists — it can never delete a real account); **`{ confirm: 'delete-my-account' }`** deletes a
mother/nanny account — row soft-deleted with email/phone/uid scrambled (`scrambleIdentity`) so all
three can register again, then the Firebase user deleted; staff 403, active bookings 409.
`POST /auth/reclaim-email` deletes another *row-less* account squatting an address the caller has
just proven. The reverse case — a live row whose Firebase user is gone — is re-attached to the new
uid by `reattachOrphanedRow` in `auth.service.ts`, never onto a soft-deleted row.

**`requireFreshAuth` wiring is pinned by a unit test, not integration**
The Auth emulator checks revocation on every `verifyIdToken` call regardless of whether a route
asked for it, so an integration test cannot tell `requireAuth` from `requireFreshAuth` apart —
either would pass a "refuses a revoked session" case. Which routes are mounted behind which
middleware is proven instead by `src/__tests__/fresh-auth.routes.test.ts`, which mocks Firebase
Admin and asserts the exact `verifyIdToken` call each route makes.

**Location lives on `addresses`, not `users`**
`users.address / latitude / longitude` are gone: `add_addresses_table` backfilled them into each
user's default `addresses` row and `drop_user_location_columns` removed them. Read a user's
location through `getDefaultAddress` in `address.service.ts`, and keep the one-default-per-user
rule inside that service's transactions; there is no database constraint for it (Prisma cannot
declare a partial unique index, and one would show as permanent drift in `migrate diff`). See
`Docs/superpowers/specs/2026-09-19-addresses-design.md`.

**PostGIS geography type with Prisma**
Prisma does not natively support PostGIS `geography` columns — they appear as `Unsupported("geography(...)")` in the schema. Radius searches must use raw SQL (`prisma.$queryRaw`). Keep these queries in `nannies.service.ts`, never in routes.

**Firebase Private Key newlines**
When storing the private key in AWS Secrets Manager or `.env`, the literal `\n` characters must be replaced with real newlines before passing to the Firebase SDK. Handle this in `config.ts`.

**ECS task role vs. execution role**
ECS has two IAM roles:
- **Execution role**: used by ECS to pull ECR image and read Secrets Manager at startup.
- **Task role**: used by the running container for S3, SQS, etc. at runtime.
Don't conflate them — apply least-privilege to each separately.
