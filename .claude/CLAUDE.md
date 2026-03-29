# NannyApp — CLAUDE.md

Authoritative reference for this codebase. Keep this file accurate and up-to-date.
Every architectural decision, convention, and "why" lives here.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack & Decisions](#tech-stack--decisions)
3. [Monorepo Structure](#monorepo-structure)
4. [Coding Conventions](#coding-conventions)
5. [Environment Variables](#environment-variables)
6. [Local Development](#local-development)
7. [Running Tests](#running-tests)
8. [Deployment](#deployment)
9. [Project Status](#project-status)
10. [Known Gotchas & Decisions to Revisit](#known-gotchas--decisions-to-revisit)

---

## Architecture Overview

NannyApp is a two-sided marketplace connecting parents with nannies.

```
┌─────────────────────────────────────────────────────────┐
│                     Mobile App (Expo)                   │
│  Parent: map → nanny profile → book → track → review    │
│  Nanny:  receive requests → confirm → navigate → earn   │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (Firebase JWT)
                         ▼
┌─────────────────────────────────────────────────────────┐
│             Backend API (Express + TypeScript)           │
│  ECS Fargate │ REST │ Zod validation │ Prisma ORM        │
└──────┬───────┴──────────────────────┬───────────────────┘
       │                              │
  PostgreSQL                        Redis
  (RDS, PostGIS)              (ElastiCache, rate limit,
                                sessions, cache)
       │
  Firebase Admin SDK          AWS S3 + CloudFront
  (JWT verify, FCM push)      (profile photos, assets)

  Firestore (realtime)        SQS + Lambda
  (live location tracking)    (async notification jobs)
```

### Request lifecycle
1. Mobile sends `Authorization: Bearer <firebase-jwt>`
2. `auth.middleware.ts` verifies token with Firebase Admin SDK
3. Route handler validates request body/query with Zod (from `@nanny-app/shared`)
4. Service layer executes business logic against Prisma / Redis
5. All responses use `ApiResponse<T>` wrapper `{ data, error, meta }`
6. Errors bubble up to `globalErrorHandler` in `error.middleware.ts`

---

## Tech Stack & Decisions

| Layer | Technology | Why |
|---|---|---|
| Mobile | Expo (React Native) | Managed workflow, OTA updates, single codebase for iOS + Android |
| Backend | Express + TypeScript | Lightweight, widely understood, easy to deploy on Fargate |
| Database | PostgreSQL + PostGIS | Relational integrity + native geospatial for radius nanny search |
| ORM | Prisma | Type-safe queries, auto-generated client, migration management |
| Cache / Rate limit | Redis (ElastiCache) | Fast session data, Redis-backed rate limiter, short-lived cache |
| Auth | Firebase Auth | Handles OAuth, email/password, phone auth, JWT out of the box |
| Realtime | Firestore | Live nanny location tracking without managing WebSocket infra |
| Push | Firebase Cloud Messaging | Cross-platform push, integrates naturally with Firebase Auth |
| Storage | S3 + CloudFront | Scalable object storage + CDN for profile photos/assets |
| Hosting | ECS Fargate | Serverless container management, no EC2 to patch |
| Async jobs | Lambda + SQS | Decouple notification delivery from request path |
| IaC | AWS CDK v2 (TypeScript) | Type-safe infra, same language as app code |
| CI/CD | GitHub Actions + CodePipeline | GitHub Actions for PR checks; CodePipeline for ECR → ECS deploy |
| Monorepo | pnpm workspaces + Turborepo | Fast installs, intelligent task caching |
| Validation | Zod | Single source of truth for types (inferred from schema) |

### Why shared Zod schemas?
Types are defined **once** in `packages/shared` as Zod schemas and inferred into TypeScript types.
Both backend (Zod validation middleware) and mobile (form validation, API response typing)
consume the same package. This eliminates type drift between client and server.

---

## Monorepo Structure

```
nanny-app/
├── apps/
│   ├── mobile/              # Expo React Native app
│   │   ├── src/
│   │   │   ├── screens/     # auth/, parent/, nanny/
│   │   │   ├── components/  # NannyCard, BookingStatusBadge, MapView
│   │   │   ├── hooks/       # useAuth, useNannies, useBookings
│   │   │   ├── navigation/  # RootNavigator, ParentNavigator, NannyNavigator
│   │   │   ├── store/       # authStore.ts (Zustand)
│   │   │   └── lib/         # firebase.ts, api.ts, queryClient.ts
│   │   ├── app.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── backend/             # Node.js Express API
│       ├── src/
│       │   ├── routes/      # auth, nannies, bookings, reviews
│       │   ├── services/    # auth, nannies, bookings, reviews, notifications
│       │   ├── middleware/  # auth, validate, error, rateLimit
│       │   ├── db/          # prisma.ts, redis.ts
│       │   └── lib/         # config.ts, logger.ts, firebase.ts, s3.ts
│       ├── prisma/
│       │   └── schema.prisma
│       ├── Dockerfile
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── shared/              # Zod schemas + inferred TS types (shared by all)
│   └── config/              # ESLint, TypeScript, Prettier shared configs
│
├── infra/                   # AWS CDK v2 stack
│   ├── bin/app.ts
│   ├── lib/nanny-app-stack.ts
│   └── cdk.json
│
├── .github/workflows/       # ci.yml, deploy-backend.yml, deploy-infra.yml
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── CLAUDE.md
```

### Package dependency rules
```
mobile  →  @nanny-app/shared
backend →  @nanny-app/shared
infra   →  (no internal deps)
config  →  (no internal deps — only dev tooling)
```

Circular deps are **forbidden**. `shared` and `config` must never depend on `mobile` or `backend`.

---

## Coding Conventions

### TypeScript
- **Strict mode always** — `strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`
- **No `any`** — ever. Use `unknown` + type guard, or fix the actual type.
- Types are **inferred from Zod schemas** in `packages/shared`. Do not duplicate type definitions.
- Use `type` imports: `import type { Foo } from './foo'`

### Naming
| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `auth.service.ts`, `nanny-card.tsx` |
| Variables / functions | camelCase | `getUserById`, `isAvailable` |
| Classes / types / interfaces | PascalCase | `AppError`, `NannyProfile` |
| Env vars | SCREAMING_SNAKE_CASE | `DATABASE_URL` |
| DB columns | snake_case (Prisma `@map`) | `created_at` |
| React components | PascalCase | `NannyCard`, `BookingStatusBadge` |

### File structure rules
- **No business logic in routes** — routes only validate input, call one service function, return response.
- **Services are the only place** that touch Prisma, Redis, Firebase, or S3.
- **Middleware** handles cross-cutting concerns (auth, validation, rate limit, error handling).
- **One service function = one unit test** (mocked dependencies).

### Error handling
- Throw `AppError(message, statusCode)` from services for expected errors.
- Unexpected errors (DB connection lost, etc.) propagate as-is to `globalErrorHandler`.
- `globalErrorHandler` is the **only place** that calls `res.status().json()` for errors.
- All responses — success and error — use `ApiResponse<T>` shape: `{ data, error, meta? }`.

### API responses
```typescript
// Success
{ data: T, error: null, meta?: PaginationMeta }

// Error
{ data: null, error: "Human-readable message" }
```

### Environment / config
- **Never use `process.env` directly** in application code.
- All env vars are validated with Zod at startup in `src/lib/config.ts`.
- Export a typed `config` object and import that everywhere.

### Path aliases
| Alias | Resolves to |
|---|---|
| `@shared/*` | `packages/shared/src/*` |
| `@backend/*` | `apps/backend/src/*` |
| `@mobile/*` | `apps/mobile/src/*` |

### React Native / Mobile
- All API calls go through the Axios instance in `src/lib/api.ts` (auto-attaches JWT).
- All server state via **React Query** (TanStack) — no manual fetch/useEffect for data.
- UI state (auth, theme) via **Zustand**.
- No business logic in screens — delegate to hooks and services.

---

## Environment Variables

### Backend (`apps/backend/.env`)

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

### Mobile (`apps/mobile` — via `app.config.ts` + Expo Constants)

| Variable | Description |
|---|---|
| `API_BASE_URL` | Backend API base URL |
| `FIREBASE_PROJECT_ID` | Firebase project |
| `FIREBASE_API_KEY` | Firebase web API key |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain |

---

## Local Development

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose (for Postgres + Redis locally)
- Firebase project with Auth enabled
- AWS credentials (for S3 — optional locally)

### 1. Clone and install

```bash
git clone <repo>
cd nanny-app
pnpm install
```

### 2. Start local services

```bash
# Postgres (with PostGIS) + Redis
docker compose up -d
```

A `docker-compose.yml` should be added at the root with:
- `postgis/postgis:16-3.4` on port 5432
- `redis:7-alpine` on port 6379

### 3. Configure environment

```bash
cp apps/backend/.env.example apps/backend/.env
# Fill in Firebase credentials and leave AWS vars empty for local dev
```

### 4. Set up database

```bash
cd apps/backend
pnpm db:generate    # generate Prisma client
pnpm db:migrate:dev # run migrations
```

### 5. Start backend

```bash
# From repo root
pnpm dev --filter=@nanny-app/backend
```

### 6. Start mobile

```bash
pnpm dev --filter=@nanny-app/mobile
# Then press 'i' for iOS simulator or 'a' for Android emulator
```

### 7. Start everything at once

```bash
pnpm dev  # Turborepo runs all dev scripts in parallel
```

---

## Running Tests

```bash
# All tests
pnpm test

# Single package
pnpm test --filter=@nanny-app/backend

# With coverage
pnpm test:coverage --filter=@nanny-app/backend

# Watch mode
cd apps/backend && pnpm test --watch
```

### Test strategy
- **Backend**: Jest unit tests for every service function. Prisma, Redis, Firebase, and S3 are mocked with `jest.mock()`. No integration tests against real DB in CI (use contract tests or separate test environment).
- **Mobile**: React Native Testing Library for components and hooks.
- **Coverage threshold**: 80% across lines/branches/functions (enforced in CI).
- Test files live at `src/__tests__/*.test.ts` (backend) and `src/**/__tests__/*.test.tsx` (mobile).

---

## Deployment

### Backend

1. **Merge to `main`** triggers `deploy-backend.yml`
2. Docker image built and pushed to ECR
3. AWS CodePipeline picks up the new image and deploys to ECS Fargate
4. Prisma migrations run as a one-off ECS task before traffic is switched
5. ECS uses rolling deployment (no downtime)

### Infrastructure

1. **Changes to `/infra`** on a PR trigger `cdk diff` — output posted as PR comment
2. **Merge to `main`** triggers `cdk deploy` for changed stacks

### Mobile

- OTA updates via Expo EAS Update for JS-only changes
- Full native build via Expo EAS Build for native dependency changes
- App Store / Play Store submission via EAS Submit

### Environments

| Env | Branch | Backend URL | DB |
|---|---|---|---|
| development | local | `localhost:3000` | Local Docker |
| staging | `develop` | `api.staging.nannyapp.com` | RDS dev instance |
| production | `main` | `api.nannyapp.com` | RDS prod instance |

---

## Project Status

> _Leave this section blank — fill in as the project progresses._

- [ ] Requirements finalised
- [ ] Shared Zod schemas defined
- [ ] Prisma schema complete
- [ ] Backend services implemented
- [ ] Backend API tested
- [ ] Mobile navigation wired up
- [ ] Mobile screens implemented
- [ ] CDK stack deployed to staging
- [ ] CI/CD green
- [ ] Production launch

---

## Known Gotchas & Decisions to Revisit

### Gotchas

**PostGIS geography type with Prisma**
Prisma does not natively support PostGIS `geography` columns — they appear as `Unsupported("geography(...)")` in the schema. Radius searches must use raw SQL (`prisma.$queryRaw`). Keep these queries in `nannies.service.ts`, never in routes.

**Firebase Private Key newlines**
When storing the private key in AWS Secrets Manager or `.env`, the literal `\n` characters must be replaced with real newlines before passing to the Firebase SDK. Handle this in `config.ts`.

**Expo managed workflow limitations**
Some native modules (e.g., react-native-maps with Google Maps on Android) require config plugins. Test early on a real device, not just Expo Go.

**pnpm + React Native**
Metro bundler does not understand pnpm's symlink structure by default. You may need `resolver.nodeModulesPaths` or `unstable_enablePackageExports` in `metro.config.js`.

**ECS task role vs. execution role**
ECS has two IAM roles:
- **Execution role**: used by ECS to pull ECR image and read Secrets Manager at startup.
- **Task role**: used by the running container for S3, SQS, etc. at runtime.
Don't conflate them — apply least-privilege to each separately.

### Decisions to Revisit

| Decision | Why it might change |
|---|---|
| REST API (no GraphQL) | If mobile queries become complex with many joins, consider GraphQL |
| Firestore for live location | Adds a second DB to manage; could replace with WebSockets on the backend |
| ECS Fargate (always-on) | If traffic is very spiky, Lambda + API Gateway might be cheaper |
| Email/password auth | May need to add phone number auth for markets where email adoption is low |
| Single AWS region | If launching internationally, multi-region RDS and CloudFront geo-restriction needed |
| FCM topics for push | Topics are broadcast; for per-user push, store FCM tokens in DB |
