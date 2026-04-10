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

- Jest unit tests for every service function.
- Prisma, Redis, Firebase, and S3 are mocked with `jest.mock()`.
- No integration tests against real DB in CI (use contract tests or separate test environment).
- Test files live at `src/__tests__/*.test.ts`.
- Coverage threshold: 80% (enforced in CI).

---

## Known Gotchas

**PostGIS geography type with Prisma**
Prisma does not natively support PostGIS `geography` columns — they appear as `Unsupported("geography(...)")` in the schema. Radius searches must use raw SQL (`prisma.$queryRaw`). Keep these queries in `nannies.service.ts`, never in routes.

**Firebase Private Key newlines**
When storing the private key in AWS Secrets Manager or `.env`, the literal `\n` characters must be replaced with real newlines before passing to the Firebase SDK. Handle this in `config.ts`.

**ECS task role vs. execution role**
ECS has two IAM roles:
- **Execution role**: used by ECS to pull ECR image and read Secrets Manager at startup.
- **Task role**: used by the running container for S3, SQS, etc. at runtime.
Don't conflate them — apply least-privilege to each separately.
