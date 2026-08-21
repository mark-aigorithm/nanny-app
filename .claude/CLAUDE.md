# NannyApp — CLAUDE.md

Authoritative reference for this codebase. Keep this file accurate and up-to-date.

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
│   ├── mobile/              # Expo React Native app (see apps/mobile/CLAUDE.md)
│   └── backend/             # Node.js Express API (see apps/backend/CLAUDE.md)
├── packages/
│   ├── shared/              # Zod schemas + inferred TS types (shared by all)
│   └── config/              # ESLint, TypeScript, Prettier shared configs
├── infra/                   # AWS CDK v2 stack
├── .github/workflows/       # ci.yml, deploy-backend.yml, deploy-infra.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
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

## Shared Coding Conventions

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

### Path aliases
| Alias | Resolves to |
|---|---|
| `@shared/*` | `packages/shared/src/*` |
| `@backend/*` | `apps/backend/src/*` |
| `@mobile/*` | `apps/mobile/src/*` |

### Environment / config
- **Never use `process.env` directly** in application code.
- All env vars are validated with Zod at startup in `src/lib/config.ts`.
- Export a typed `config` object and import that everywhere.

---

## Local Development

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose (for Postgres + Redis locally)
- Firebase project with Auth enabled
- AWS credentials (for S3 — optional locally)

### Quick start

```bash
git clone <repo>
cd nanny-app
pnpm install

# Postgres (with PostGIS) + Redis
docker compose up -d

cp apps/backend/.env.example apps/backend/.env
# Fill in Firebase credentials and leave AWS vars empty for local dev

cd apps/backend
pnpm db:generate    # generate Prisma client
pnpm db:migrate:dev # run migrations

# From repo root — start everything
pnpm dev
```

---

## Running Tests

### Tiers

| Tier | Where | Needs the test stack? | Command |
|---|---|---|---|
| Unit / component | backend `src/__tests__`, shared, admin, mobile | no | `pnpm test:unit` |
| Integration (real DB + HTTP) | backend `src/__integration__` | **yes** | `pnpm test:integration` |
| E2E (browser) | `apps/admin/e2e` | **yes**, plus a backend on :3001 | `pnpm --filter=@nanny-app/admin test:e2e` |
| E2E (device) | `apps/mobile/e2e` | **yes**, plus a backend, Metro and an Android emulator | `pnpm test:e2e:mobile` |

| Package | Runner |
|---|---|
| backend | Jest (two projects: `unit`, `integration`) |
| shared | Vitest |
| admin | Vitest + Testing Library + MSW; Playwright for E2E |
| mobile | Jest (`jest-expo`) + React Native Testing Library; Maestro for device E2E |

The device tier drives the real app on a real emulator and has more moving parts than the rest of
the suite put together — a debug APK, Metro, an AVD, and a Maestro CLI that is not on `PATH`.
Its prerequisites and the several non-obvious things that make a flow pass are in
[apps/mobile/e2e/README.md](../apps/mobile/e2e/README.md); read that before touching a flow.

### The test stack

Integration and E2E tests run against real services — a real PostGIS database and a real Firebase
token path — so that a passing test means something. Everything is local, free and deterministic:

```bash
pnpm test:env          # Postgres+PostGIS, Mailpit, Auth emulator, Paymob fake
```

| Service | Port | Notes |
|---|---|---|
| PostGIS (`nannyapp_test`) | 55432 | Separate port/volume from the dev DB on 5432 — tests truncate every table |
| Mailpit | 1025 SMTP / 8025 HTTP | Assert on sent mail instead of mocking nodemailer |
| Firebase Auth emulator | 9099 | Project `demo-nannyapp`; the backend, admin and mobile all point at it |
| Paymob fake | 4010 | Signs webhooks with the real HMAC secret |

**Why the Auth emulator matters:** all three surfaces authenticate through Firebase, so pointing
them at one emulator lets tests mint and delete users freely while `verifyIdToken` still runs its
real code path. Enabled per surface by an env var (`FIREBASE_AUTH_EMULATOR_HOST`,
`VITE_FIREBASE_AUTH_EMULATOR_HOST`, `extra.firebaseAuthEmulatorHost`) that is unset in every real
build.

For an E2E run, also start the backend against that stack:

```bash
pnpm --filter=@nanny-app/backend start:test
```

The device tier needs two more processes on top of that — an emulator and Metro — and a one-time
setup (Maestro CLI, an AVD, a debug build). All of it is in
[apps/mobile/e2e/README.md](../apps/mobile/e2e/README.md).

**Payment is exercised for real on both E2E tiers.** The Paymob fake serves the same
`/unifiedcheckout/` page the app opens, signs its webhooks with the production HMAC helpers and
delivers them itself — so a WebView completing a checkout is the production path with a local
issuer, not a mock.

- **Coverage threshold**: 80% across lines/branches/functions (planned; the CI gate is not yet wired).

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

## Decisions to Revisit

| Decision | Why it might change |
|---|---|
| REST API (no GraphQL) | If mobile queries become complex with many joins, consider GraphQL |
| Firestore for live location | Adds a second DB to manage; could replace with WebSockets on the backend |
| ECS Fargate (always-on) | If traffic is very spiky, Lambda + API Gateway might be cheaper |
| Email/password auth | May need to add phone number auth for markets where email adoption is low |
| Single AWS region | If launching internationally, multi-region RDS and CloudFront geo-restriction needed |
| FCM topics for push | Topics are broadcast; for per-user push, store FCM tokens in DB |
