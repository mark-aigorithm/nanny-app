# Epic 1: Authentication & User Management

## Context

NannyMom uses Firebase Auth as the identity provider. The backend verifies Firebase JWTs via the Admin SDK and maintains its own User record in PostgreSQL (linked by Firebase UID). Two primary roles exist: **Mother** (parent) and **Nanny** (caregiver). Role is selected at registration and stored in both Firebase custom claims and the local DB.

**PRD references:** Section 4 (Roles), Section 5 (Permissions), Table 18 (NFRs), Table 19 (Config)
**Architecture references:** Section 2.1 (JWT Authorizer), Section 5 (Notifications/OTP)

---

## Prerequisites (Backend Foundation)

These infrastructure stories must be completed before any feature work.

### FOUND-01: Project scaffolding
**As a** developer
**I want** the backend `src/` directory created with the standard folder structure (routes, services, middleware, db, lib)
**So that** all subsequent stories have a consistent place to land.

**Acceptance criteria:**
- `src/server.ts` — Express app with helmet, cors, morgan, JSON body parser, and the global error handler
- `src/lib/config.ts` — Zod-validated config object for all env vars (per CLAUDE.md)
- `src/lib/logger.ts` — Winston logger (JSON format in production, pretty in dev)
- `src/middleware/error.middleware.ts` — `AppError` class + `globalErrorHandler`
- `src/db/prisma.ts` — singleton Prisma client export
- `src/db/redis.ts` — ioredis client export (graceful fallback if unavailable)
- App starts with `pnpm dev` and responds to `GET /health` with `{ status: "ok" }`

### FOUND-02: Shared Zod schemas package
**As a** developer
**I want** `packages/shared/src/` to contain the base Zod schemas consumed by both backend and mobile
**So that** request/response types are defined once and shared.

**Acceptance criteria:**
- `packages/shared/src/api.ts` — `ApiResponseSchema<T>`, `PaginationMetaSchema`
- `packages/shared/src/user.ts` — `UserSchema`, `CreateUserSchema`, `UpdateUserSchema`, `RoleEnum` (`mother | nanny | admin`)
- `packages/shared/src/auth.ts` — `SignUpRequestSchema`, `SignInResponseSchema`, `RefreshTokenResponseSchema`
- All types inferred with `z.infer<>` and re-exported
- `packages/shared/src/index.ts` barrel export
- `pnpm build --filter=@nanny-app/shared` succeeds

### FOUND-03: Prisma schema — User model
**As a** developer
**I want** the Prisma schema to define the `User` model
**So that** auth services can persist and query users.

**Acceptance criteria:**
- `User` model with fields: `id` (UUID), `firebaseUid` (unique), `email` (unique), `phone` (nullable, unique), `firstName`, `lastName`, `role` (enum: MOTHER, NANNY, ADMIN), `avatarUrl` (nullable), `isVerified` (default false), `isActive` (default true), `lastLoginAt`, `createdAt`, `updatedAt`
- Enum `Role { MOTHER NANNY ADMIN }`
- PostGIS extension enabled: `CREATE EXTENSION IF NOT EXISTS postgis`
- Migration generated and applied: `pnpm db:migrate:dev`
- Prisma client generated: `pnpm db:generate`

### FOUND-04: Validation middleware
**As a** developer
**I want** a reusable Zod validation middleware
**So that** route handlers can declaratively validate body, query, and params.

**Acceptance criteria:**
- `src/middleware/validate.middleware.ts` exports `validate(schema)` that validates `req.body` against a Zod schema
- Invalid requests return `400` with `{ data: null, error: "<Zod error message>" }`
- Valid requests attach parsed data to `req.body` (stripped of unknown keys)

### FOUND-05: Rate limiting middleware
**As a** developer
**I want** Redis-backed rate limiting on all API routes
**So that** the platform is protected from abuse.

**Acceptance criteria:**
- `src/middleware/rateLimit.middleware.ts` using `express-rate-limit` + `rate-limit-redis`
- Default: 100 requests per 15-minute window (configurable via env)
- Auth routes (`/auth/register`, `/auth/signin`) have a stricter limit: 10 requests per 15 minutes
- Falls back to in-memory store if Redis is unavailable
- Rate limit headers included in responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

---

## Authentication Stories

### AUTH-01: Firebase Admin SDK initialization
**As a** backend service
**I want** Firebase Admin SDK initialized at startup
**So that** I can verify Firebase ID tokens and manage custom claims.

**Acceptance criteria:**
- `src/lib/firebase.ts` initializes `firebase-admin` with credentials from `config`
- Private key newlines handled correctly (replace `\\n` with `\n`)
- Exports `firebaseAuth` (admin.auth instance)
- Startup fails fast with a clear error if Firebase credentials are missing or invalid
- Unit test verifies initialization with mocked credentials

### AUTH-02: Auth middleware — JWT verification
**As a** backend service
**I want** every protected route to verify the Firebase JWT from the `Authorization` header
**So that** only authenticated users can access the API.

**Acceptance criteria:**
- `src/middleware/auth.middleware.ts` exports `requireAuth`
- Extracts `Bearer <token>` from `Authorization` header
- Calls `firebaseAuth.verifyIdToken(token)` to validate
- On success: attaches `req.user = { uid, email, role }` to the request (role from custom claims)
- On missing/invalid token: returns `401 { data: null, error: "Authentication required" }`
- On expired token: returns `401 { data: null, error: "Token expired" }`
- Unit tests cover: valid token, missing header, malformed header, expired token, invalid token

### AUTH-03: Role authorization middleware
**As a** backend service
**I want** route-level role checks
**So that** endpoints can be restricted to specific roles (mother, nanny, admin).

**Acceptance criteria:**
- `src/middleware/auth.middleware.ts` exports `requireRole(...roles: Role[])`
- Must be used after `requireAuth`
- Checks `req.user.role` against allowed roles
- On unauthorized role: returns `403 { data: null, error: "Insufficient permissions" }`
- Unit tests cover: allowed role passes, disallowed role blocked, missing role blocked

### AUTH-04: User registration (Mother)
**As a** mother
**I want** to create an account with my email, password, name, and phone number
**So that** I can book nannies and join the community.

**Acceptance criteria:**
- `POST /auth/register`
- Request body validated with `SignUpRequestSchema`: `{ email, password, firstName, lastName, phone?, role: "mother" }`
- Creates Firebase Auth user with email/password
- Sets Firebase custom claims: `{ role: "mother" }`
- Creates `User` record in PostgreSQL linked by `firebaseUid`
- Returns `201 { data: { user, token } }` where token is a fresh Firebase ID token
- Duplicate email returns `409 { data: null, error: "Email already registered" }`
- Weak password returns `400` (Firebase enforces minimum 6 chars)
- Rate limited: 10 requests per 15 minutes per IP
- Unit tests cover: happy path, duplicate email, invalid input, weak password

### AUTH-05: User registration (Nanny)
**As a** nanny
**I want** to create an account with my professional details
**So that** I can receive booking requests and manage my profile.

**Acceptance criteria:**
- `POST /auth/register` (same endpoint, role = "nanny")
- Request body: `{ email, password, firstName, lastName, phone?, role: "nanny" }`
- Sets Firebase custom claims: `{ role: "nanny" }`
- Creates `User` record with `role: NANNY`
- Creates a placeholder `NannyProfile` record linked to the user (to be populated later in onboarding)
- Returns `201 { data: { user, token } }`
- Same validation and error handling as AUTH-04

### AUTH-06: User sign-in (email/password)
**As a** registered user (mother or nanny)
**I want** to sign in with my email and password
**So that** I can access my account.

**Acceptance criteria:**
- Sign-in happens client-side via Firebase Auth SDK (mobile)
- `POST /auth/signin` is called after Firebase client-side sign-in to sync with the backend
- Request body: `{ firebaseToken }` (the Firebase ID token obtained client-side)
- Backend verifies the token, looks up or creates the local `User` record
- Updates `lastLoginAt` timestamp
- Returns `200 { data: { user } }` with the full user profile
- Unknown Firebase UID auto-creates a local user record (handles Firebase-first registration via social auth)
- Unit tests cover: existing user, first-time sync, invalid token

### AUTH-07: Social authentication (Google / Apple)
**As a** mother or nanny
**I want** to sign in with Google or Apple
**So that** I can use my existing account without creating a new password.

**Acceptance criteria:**
- Social sign-in handled entirely by Firebase Auth SDK on the mobile client
- Backend receives the Firebase ID token via `POST /auth/signin` (same as AUTH-06)
- If the Firebase UID is new, creates a local `User` record with: name from Firebase profile, email from Firebase profile, role defaulting to `null` (must be set via `POST /auth/set-role`)
- If user has no role set, response includes `requiresRoleSelection: true`
- Unit tests cover: new social user, existing social user, missing role

### AUTH-08: Set user role (post-social-auth)
**As a** user who signed up via social auth
**I want** to select my role (mother or nanny) after first sign-in
**So that** the platform knows how to serve me.

**Acceptance criteria:**
- `POST /auth/set-role` (requires auth, user must have `role = null`)
- Request body: `{ role: "mother" | "nanny" }`
- Updates Firebase custom claims with the selected role
- Updates local `User` record
- If role is "nanny", creates placeholder `NannyProfile`
- Returns `200 { data: { user } }`
- Returns `400` if user already has a role set
- Unit tests cover: happy path, role already set, invalid role value

### AUTH-09: Get current user profile
**As an** authenticated user
**I want** to fetch my profile
**So that** the app can display my information.

**Acceptance criteria:**
- `GET /auth/me` (requires auth)
- Returns the full `User` record from PostgreSQL
- If role is NANNY, includes the associated `NannyProfile`
- If role is MOTHER, includes count of children, favorite nannies count, wallet balance
- Returns `200 { data: { user } }`
- Unit test covers: mother profile, nanny profile

### AUTH-10: Update user profile
**As an** authenticated user
**I want** to update my name, phone, and avatar
**So that** my profile stays current.

**Acceptance criteria:**
- `PATCH /auth/me` (requires auth)
- Request body validated with `UpdateUserSchema`: `{ firstName?, lastName?, phone?, avatarUrl? }`
- Updates the local `User` record
- If email or phone changes, sets `isVerified = false` and triggers re-verification (see AUTH-12)
- Returns `200 { data: { user } }`
- Phone uniqueness enforced — `409` if phone already taken
- Unit tests cover: update name, update phone (unique check), partial update

### AUTH-11: Upload profile avatar
**As an** authenticated user
**I want** to upload a profile photo
**So that** other users can see my face.

**Acceptance criteria:**
- `POST /auth/me/avatar` (requires auth)
- Returns a presigned S3 upload URL for the client to PUT the image directly
- Key format: `avatars/{userId}/{uuid}.{ext}`
- Accepted types: `image/jpeg`, `image/png`, `image/webp` (max 5MB)
- After client confirms upload, `PATCH /auth/me` updates `avatarUrl`
- Returns `200 { data: { uploadUrl, key } }`
- Unit tests cover: URL generation, invalid file type rejection

### AUTH-12: Phone number verification (OTP)
**As a** user
**I want** to verify my phone number via SMS OTP
**So that** my account is fully verified and I can receive SMS alerts.

**Acceptance criteria:**
- `POST /auth/verify-phone/send` (requires auth)
- Generates a 6-digit OTP, stores in Redis with 5-minute TTL keyed by userId
- Sends OTP via Amazon SNS SMS
- Rate limited: 3 OTP requests per 15 minutes per user
- Returns `200 { data: { message: "OTP sent" } }`
- `POST /auth/verify-phone/confirm` (requires auth)
- Request body: `{ otp }` (6-digit string)
- Validates OTP against Redis
- On match: sets `isVerified = true` on the User record, deletes OTP from Redis
- On mismatch: returns `400 { data: null, error: "Invalid or expired OTP" }`
- Max 5 attempts before OTP is invalidated
- Unit tests cover: send OTP, verify OTP (correct), verify OTP (wrong), verify OTP (expired), rate limit exceeded

### AUTH-13: Forgot password
**As a** user
**I want** to reset my password via email
**So that** I can regain access to my account.

**Acceptance criteria:**
- `POST /auth/forgot-password`
- Request body: `{ email }`
- Calls `firebaseAuth.generatePasswordResetLink(email)` and sends via SES (or Firebase's built-in email)
- Always returns `200 { data: { message: "If this email exists, a reset link has been sent" } }` (no user enumeration)
- Rate limited: 3 requests per 15 minutes per email
- Unit test covers: existing email, non-existing email (same response)

### AUTH-14: Account deactivation
**As a** user
**I want** to delete my account
**So that** my data is removed from the platform per GDPR/CCPA requirements.

**Acceptance criteria:**
- `DELETE /auth/me` (requires auth)
- Request body: `{ confirmation: "DELETE" }` (explicit confirmation required)
- Soft-deletes: sets `isActive = false`, anonymizes PII (name → "Deleted User", email → hashed, phone → null)
- Disables the Firebase Auth account
- Cancels any upcoming bookings (notifies the other party)
- Returns `200 { data: { message: "Account scheduled for deletion" } }`
- Hard delete of data after 30 days (background job — future story)
- Unit tests cover: happy path, missing confirmation, user with active booking

### AUTH-15: Token refresh awareness
**As a** mobile client
**I want** the backend to handle expired tokens gracefully
**So that** the app can prompt for re-authentication.

**Acceptance criteria:**
- Token refresh is handled client-side by Firebase SDK (automatic)
- Backend auth middleware returns clear `401` with `error: "Token expired"` (distinct from `"Authentication required"`)
- Mobile can distinguish between "need to refresh" vs. "need to re-login"
- No backend endpoint needed — this is a middleware behavior documented in the API contract

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `GET` | `/health` | No | — | FOUND-01 |
| `POST` | `/auth/register` | No | — | AUTH-04, AUTH-05 |
| `POST` | `/auth/signin` | No | — | AUTH-06, AUTH-07 |
| `POST` | `/auth/set-role` | Yes | any | AUTH-08 |
| `GET` | `/auth/me` | Yes | any | AUTH-09 |
| `PATCH` | `/auth/me` | Yes | any | AUTH-10 |
| `POST` | `/auth/me/avatar` | Yes | any | AUTH-11 |
| `POST` | `/auth/verify-phone/send` | Yes | any | AUTH-12 |
| `POST` | `/auth/verify-phone/confirm` | Yes | any | AUTH-12 |
| `POST` | `/auth/forgot-password` | No | — | AUTH-13 |
| `DELETE` | `/auth/me` | Yes | any | AUTH-14 |

---

## Implementation Order

```
FOUND-01  Project scaffolding
    |
FOUND-02  Shared Zod schemas
    |
FOUND-03  Prisma schema (User model)
    |
FOUND-04  Validation middleware ──── FOUND-05  Rate limiting
    |                                    |
AUTH-01   Firebase Admin SDK init        |
    |                                    |
AUTH-02   Auth middleware (JWT)           |
    |                                    |
AUTH-03   Role authorization             |
    |____________________________________|
    |
AUTH-04   Registration (Mother)
    |
AUTH-05   Registration (Nanny)
    |
AUTH-06   Sign-in (email/password)
    |
AUTH-07   Social auth (Google/Apple)
    |
AUTH-08   Set role (post-social)
    |
AUTH-09   Get current user ──── AUTH-10  Update profile
    |                               |
AUTH-11   Avatar upload         AUTH-12  Phone OTP
    |
AUTH-13   Forgot password
    |
AUTH-14   Account deactivation
```

---

## Non-Functional Requirements (from PRD Table 18)

| Requirement | Target |
|---|---|
| JWT access token expiry | 15 minutes |
| Refresh token expiry | 30 days |
| All API traffic | HTTPS/TLS 1.3 minimum |
| Password hashing | Handled by Firebase Auth (bcrypt/scrypt) |
| Registration rate limit | 10 req / 15 min per IP |
| OTP rate limit | 3 req / 15 min per user |
| Forgot password rate limit | 3 req / 15 min per email |
| General API rate limit | 100 req / 15 min per user |
