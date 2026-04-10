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
| `NODE_ENV` | yes | manual | `development` / `staging` / `production` |
| `PORT` | yes | manual | HTTP port (default 3000) |
| `DATABASE_URL` | yes | Secrets Manager | PostgreSQL connection string |
| `REDIS_URL` | yes | Secrets Manager | Redis connection string |
| `FIREBASE_PROJECT_ID` | yes | Secrets Manager | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | yes | Secrets Manager | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | yes | Secrets Manager | Firebase service account private key |
| `AWS_REGION` | yes | ECS task role | AWS region |
| `S3_BUCKET_NAME` | yes | CDK output | S3 bucket for assets |
| `CLOUDFRONT_DOMAIN` | yes | CDK output | CloudFront distribution domain |
| `CORS_ORIGINS` | yes | manual | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MS` | no | manual | Rate limit window (default 900000ms) |
| `RATE_LIMIT_MAX_REQUESTS` | no | manual | Max requests per window (default 100) |

**Production rule:** All secrets come from AWS Secrets Manager, injected as env vars by ECS task definition. `.env` files are for local dev only and must never be committed.

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
