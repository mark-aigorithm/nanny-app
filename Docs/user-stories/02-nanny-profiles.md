# Epic 2: Nanny Discovery & Profiles

## Context

NannyMom allows mothers to discover, search, and bookmark nannies based on location, availability, certifications, and ratings. Nannies manage their own profiles including bio, hourly rate, availability schedule, and certifications. Location-based search uses PostGIS `ST_DWithin` on geography columns for efficient radius queries. Certifications are uploaded by nannies and verified by admins before displaying a verified badge.

**PRD references:** Section 6.2 (Nanny Discovery & Profiles), Table 8 (FR-02-*), Table 19 (Config — search radius default 5 miles)
**Architecture references:** Section 2 (PostGIS), Backend CLAUDE.md (PostGIS raw SQL in `nannies.service.ts`)

---

## Prerequisites (Prisma Models)

### NANNY-01: Prisma schema — NannyProfile model
**As a** developer
**I want** the Prisma schema to define the `NannyProfile` model with PostGIS location support
**So that** nanny discovery and profile features have a persistent data layer.

**Acceptance criteria:**
- `NannyProfile` model with fields: `id` (UUID), `userId` (unique FK to `User`), `bio` (nullable text), `hourlyRate` (Decimal), `yearsOfExperience` (Int, default 0), `age` (Int, nullable), `ageGroupsServed` (String array — e.g., `["infant", "toddler", "preschool", "school-age"]`), `isBackgroundChecked` (Boolean, default false), `isVerified` (Boolean, default false), `averageRating` (Float, default 0), `totalReviews` (Int, default 0), `neighborhood` (String, nullable), `isAvailable` (Boolean, default true), `createdAt`, `updatedAt`
- Location column: `location` as `Unsupported("geography(Point, 4326)")` — requires raw SQL for reads/writes
- Migration includes: `CREATE EXTENSION IF NOT EXISTS postgis` (idempotent)
- Migration adds a GIST spatial index on `location`: `CREATE INDEX idx_nanny_profile_location ON "NannyProfile" USING GIST (location)`
- Relation: `NannyProfile` belongs to `User` (one-to-one)
- `pnpm db:migrate:dev` and `pnpm db:generate` succeed

### NANNY-02: Prisma schema — Certification model
**As a** developer
**I want** the Prisma schema to define the `Certification` model
**So that** nanny certifications can be stored, verified, and displayed.

**Acceptance criteria:**
- `Certification` model with fields: `id` (UUID), `nannyProfileId` (FK to `NannyProfile`), `type` (enum: `FIRST_AID`, `CPR`, `BACKGROUND_CHECK`, `ECE_DEGREE`, `OTHER`), `title` (String), `issuingOrganization` (String, nullable), `issueDate` (DateTime, nullable), `expiryDate` (DateTime, nullable), `documentUrl` (String — S3 key), `isVerified` (Boolean, default false), `verifiedAt` (DateTime, nullable), `verifiedBy` (FK to `User`, nullable — admin who verified), `createdAt`, `updatedAt`
- Enum `CertificationType { FIRST_AID CPR BACKGROUND_CHECK ECE_DEGREE OTHER }`
- Relation: `Certification` belongs to `NannyProfile` (many-to-one)
- Migration generated and applied

### NANNY-03: Prisma schema — FavoriteNanny model
**As a** developer
**I want** the Prisma schema to define the `FavoriteNanny` model
**So that** mothers can bookmark nannies.

**Acceptance criteria:**
- `FavoriteNanny` model with fields: `id` (UUID), `motherId` (FK to `User`), `nannyProfileId` (FK to `NannyProfile`), `createdAt`
- Unique compound index on `(motherId, nannyProfileId)` — a mother can favorite a nanny only once
- Relation: `FavoriteNanny` belongs to `User` (mother) and `NannyProfile`
- Migration generated and applied

### NANNY-04: Shared Zod schemas — Nanny module
**As a** developer
**I want** Zod schemas for nanny profile requests and responses in `packages/shared`
**So that** validation and types are shared between backend and mobile.

**Acceptance criteria:**
- `packages/shared/src/nanny.ts` exports:
  - `NannyProfileSchema` — full nanny profile response shape
  - `UpdateNannyProfileSchema` — partial update (bio, hourlyRate, yearsOfExperience, age, ageGroupsServed, neighborhood)
  - `SetNannyLocationSchema` — `{ latitude: number, longitude: number }`
  - `SearchNanniesQuerySchema` — `{ latitude, longitude, radiusMiles? (default 5), minRating?, maxPrice?, ageGroup?, certifications?, availableOn?, sortBy? ("rating" | "distance" | "price"), page?, limit? }`
  - `CertificationSchema` — certification response shape
  - `CreateCertificationSchema` — `{ type, title, issuingOrganization?, issueDate?, expiryDate? }`
  - `AvailabilitySlotSchema` — `{ dayOfWeek (0-6), startTime (HH:mm), endTime (HH:mm) }`
  - `WeeklyScheduleSchema` — array of `AvailabilitySlotSchema`
  - `BlockedDateSchema` — `{ date (ISO date string), reason? }`
- All types inferred with `z.infer<>` and re-exported
- Barrel export from `packages/shared/src/index.ts`
- `pnpm build --filter=@nanny-app/shared` succeeds

---

## Nanny Profile Management Stories

### NANNY-05: Nanny updates own profile
**As a** nanny
**I want** to update my profile information (bio, hourly rate, experience, age groups served)
**So that** mothers see accurate and up-to-date information about me.

**Acceptance criteria:**
- `PATCH /nannies/me` (requires auth, role: NANNY)
- Request body validated with `UpdateNannyProfileSchema`
- Updates the authenticated nanny's `NannyProfile` record
- `hourlyRate` must be > 0 and <= 500 (configurable max)
- `ageGroupsServed` values must be from the allowed set: `["infant", "toddler", "preschool", "school-age"]`
- Returns `200 { data: { nannyProfile } }`
- Returns `404` if the nanny profile does not exist (should not happen if AUTH-05 created it)
- Unit tests cover: happy path, invalid hourly rate, invalid age group, partial update

### NANNY-06: Nanny sets location
**As a** nanny
**I want** to set my service location (latitude/longitude)
**So that** mothers searching nearby can find me.

**Acceptance criteria:**
- `PUT /nannies/me/location` (requires auth, role: NANNY)
- Request body validated with `SetNannyLocationSchema`: `{ latitude, longitude }`
- Latitude must be between -90 and 90; longitude between -180 and 180
- Updates the PostGIS `location` column via raw SQL: `UPDATE "NannyProfile" SET location = ST_SetSRID(ST_MakePoint($longitude, $latitude), 4326)::geography WHERE "userId" = $userId`
- Optionally reverse-geocodes to populate `neighborhood` (future enhancement — for now, accept optional `neighborhood` string in request body)
- Returns `200 { data: { message: "Location updated" } }`
- Unit tests cover: valid coordinates, out-of-range latitude, out-of-range longitude

### NANNY-07: Nanny manages weekly availability schedule
**As a** nanny
**I want** to set my weekly availability (day-of-week + time slots)
**So that** mothers can see when I am available to book.

**Acceptance criteria:**
- `PUT /nannies/me/availability` (requires auth, role: NANNY)
- Request body validated with `WeeklyScheduleSchema`: array of `{ dayOfWeek (0=Sunday..6=Saturday), startTime, endTime }`
- Replaces all existing availability slots for the nanny (full replacement, not merge)
- `startTime` must be before `endTime` for each slot
- No overlapping slots for the same day
- Stored in a `NannyAvailability` table (or JSON column on `NannyProfile` — implementation choice)
- Returns `200 { data: { schedule } }`
- `GET /nannies/me/availability` returns the current schedule
- Unit tests cover: set schedule, overlapping slots rejected, empty schedule (clears all), get schedule

### NANNY-08: Nanny manages blocked dates
**As a** nanny
**I want** to block specific dates when I am unavailable
**So that** mothers cannot book me on those days.

**Acceptance criteria:**
- `POST /nannies/me/blocked-dates` (requires auth, role: NANNY) — add a blocked date
- Request body: `{ date (ISO date string), reason? }`
- Date must be today or in the future
- `DELETE /nannies/me/blocked-dates/:date` — remove a blocked date
- `GET /nannies/me/blocked-dates` — list all blocked dates (future only)
- Returns `200 { data: { blockedDates } }`
- Duplicate date returns `409`
- Unit tests cover: add blocked date, duplicate blocked date, remove blocked date, list blocked dates, past date rejected

---

## Nanny Discovery Stories (Mother-Facing)

### NANNY-09: View public nanny profile
**As a** mother
**I want** to view a nanny's full public profile
**So that** I can evaluate the nanny before booking.

**Acceptance criteria:**
- `GET /nannies/:id` (requires auth, role: MOTHER or ADMIN)
- Returns the full `NannyProfile` including: user info (name, avatar), bio, hourly rate, average rating, total reviews, years of experience, age, age groups served, neighborhood, verification status, background check status
- Includes `certifications` array (only verified certifications shown to mothers)
- Includes recent reviews (latest 5, with reviewer name, date, rating, comment, booking type)
- Includes `isFavorited: boolean` — whether the requesting mother has bookmarked this nanny
- Returns `200 { data: { nannyProfile } }`
- Returns `404` if nanny profile does not exist or is not active
- Unit tests cover: happy path, nanny not found, includes favorite status, filters unverified certs

### NANNY-10: Search nannies by location and filters
**As a** mother
**I want** to search for nannies near my location with filters for price, rating, certifications, and age group
**So that** I can find the best nanny for my needs.

**Acceptance criteria:**
- `GET /nannies/search` (requires auth, role: MOTHER)
- Query params validated with `SearchNanniesQuerySchema`
- Required: `latitude`, `longitude`
- Optional filters: `radiusMiles` (default 5, max 50), `minRating` (0-5), `maxPrice` (Decimal), `ageGroup` (one of the allowed values), `certifications` (comma-separated certification types), `availableOn` (ISO date string — checks against weekly schedule and blocked dates)
- Location search uses raw SQL with PostGIS: `ST_DWithin(location, ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography, $radiusMeters)`
- Only returns nannies where `isActive = true` on the User and `isAvailable = true` on the NannyProfile
- Sort options (`sortBy` query param): `rating` (desc), `distance` (asc), `price` (asc) — default: `rating`
- Paginated: `page` (default 1), `limit` (default 20, max 50)
- Response includes `meta: { page, limit, total, totalPages }`
- Each result includes `distanceMiles` computed via `ST_Distance`
- Returns `200 { data: { nannies }, meta }`
- Unit tests cover: basic search, filter by rating, filter by price, filter by age group, filter by certification, sort by distance, sort by price, pagination, no results

### NANNY-11: Get recommended nearby nannies (dashboard)
**As a** mother
**I want** to see recommended nannies near me on the home dashboard
**So that** I can quickly discover top-rated nannies.

**Acceptance criteria:**
- `GET /nannies/recommended` (requires auth, role: MOTHER)
- Query params: `latitude`, `longitude`
- Returns up to 8 nannies within 5-mile radius, sorted by `averageRating` descending (FR-01-04)
- Same active/available filtering as NANNY-10
- Each result includes `distanceMiles`
- Returns `200 { data: { nannies } }`
- Unit tests cover: happy path, fewer than 8 results, no results

### NANNY-12: Social proof — common connections
**As a** mother
**I want** to see if I share common connections with a nanny (other mothers who also hired this nanny)
**So that** I feel more confident booking.

**Acceptance criteria:**
- Included in the `GET /nannies/:id` response (NANNY-09) as `commonConnections` array
- A "common connection" is a mother who: (a) the requesting mother follows or is friends with (future feature — for now, mothers who are in the same community/neighborhood), AND (b) has completed at least one booking with this nanny
- For MVP: return up to 3 mothers who have also booked this nanny (anonymized to first name + last initial + avatar) — no friendship graph needed yet
- Response shape: `commonConnections: [{ firstName, lastInitial, avatarUrl }]`
- Returns empty array if no common connections
- Unit tests cover: connections found, no connections, max 3 returned

---

## Favorite Nannies Stories

### NANNY-13: Add nanny to favorites
**As a** mother
**I want** to bookmark a nanny by tapping the heart icon
**So that** I can quickly find her later on my dashboard.

**Acceptance criteria:**
- `POST /nannies/:id/favorite` (requires auth, role: MOTHER)
- Creates a `FavoriteNanny` record linking the mother to the nanny profile
- Idempotent: if already favorited, returns `200` (not `409`)
- Returns `200 { data: { message: "Nanny added to favorites" } }`
- Returns `404` if the nanny profile does not exist
- Unit tests cover: add favorite, already favorited (idempotent), nanny not found

### NANNY-14: Remove nanny from favorites
**As a** mother
**I want** to un-bookmark a nanny
**So that** my favorites list stays curated.

**Acceptance criteria:**
- `DELETE /nannies/:id/favorite` (requires auth, role: MOTHER)
- Deletes the `FavoriteNanny` record
- Idempotent: if not currently favorited, returns `200`
- Returns `200 { data: { message: "Nanny removed from favorites" } }`
- Unit tests cover: remove favorite, not currently favorited (idempotent)

### NANNY-15: List favorite nannies
**As a** mother
**I want** to see all the nannies I have bookmarked
**So that** I can quickly re-access their profiles or book them.

**Acceptance criteria:**
- `GET /nannies/favorites` (requires auth, role: MOTHER)
- Returns all `FavoriteNanny` records for the authenticated mother, with the associated nanny profile summary (name, avatar, hourly rate, rating, neighborhood)
- Sorted by `createdAt` descending (most recently favorited first)
- Paginated: `page` (default 1), `limit` (default 20)
- Returns `200 { data: { favorites }, meta }`
- Unit tests cover: list favorites, empty list, pagination

---

## Certification Management Stories

### NANNY-16: Nanny uploads a certification
**As a** nanny
**I want** to upload my certifications (First Aid, CPR, Background Check, ECE Degree)
**So that** mothers can see my qualifications and trust my profile.

**Acceptance criteria:**
- `POST /nannies/me/certifications` (requires auth, role: NANNY)
- Request body validated with `CreateCertificationSchema`: `{ type, title, issuingOrganization?, issueDate?, expiryDate? }`
- Returns a presigned S3 upload URL for the certificate document (similar to AUTH-11 avatar flow)
- Key format: `certifications/{nannyProfileId}/{uuid}.{ext}`
- Accepted types: `image/jpeg`, `image/png`, `image/pdf` (max 10MB)
- Creates a `Certification` record with `isVerified = false`
- Returns `201 { data: { certification, uploadUrl } }`
- Unit tests cover: happy path, invalid certification type, presigned URL generation

### NANNY-17: Nanny lists own certifications
**As a** nanny
**I want** to view all my uploaded certifications and their verification status
**So that** I know which ones have been approved.

**Acceptance criteria:**
- `GET /nannies/me/certifications` (requires auth, role: NANNY)
- Returns all `Certification` records for the authenticated nanny
- Each record includes `isVerified`, `verifiedAt` status
- Sorted by `createdAt` descending
- Returns `200 { data: { certifications } }`
- Unit tests cover: list with verified and unverified certs, empty list

### NANNY-18: Nanny deletes a certification
**As a** nanny
**I want** to remove an outdated or incorrect certification
**So that** my profile only shows current qualifications.

**Acceptance criteria:**
- `DELETE /nannies/me/certifications/:certId` (requires auth, role: NANNY)
- Deletes the `Certification` record and queues S3 object deletion (async — Lambda job)
- Returns `200 { data: { message: "Certification deleted" } }`
- Returns `404` if the certification does not exist or does not belong to the authenticated nanny
- Unit tests cover: delete own cert, cert not found, cert belongs to different nanny

### NANNY-19: Admin verifies a certification
**As an** admin
**I want** to verify or reject a nanny's uploaded certification
**So that** only legitimate certifications display the verified badge.

**Acceptance criteria:**
- `PATCH /admin/certifications/:certId` (requires auth, role: ADMIN)
- Request body: `{ isVerified: boolean }`
- Sets `isVerified`, `verifiedAt` (current timestamp), `verifiedBy` (admin user ID)
- If all key certifications are verified (FIRST_AID + BACKGROUND_CHECK at minimum), auto-updates `NannyProfile.isVerified = true`
- Returns `200 { data: { certification } }`
- Returns `404` if the certification does not exist
- Unit tests cover: verify cert, reject cert, auto-verify nanny profile, cert not found

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `PATCH` | `/nannies/me` | Yes | NANNY | NANNY-05 |
| `PUT` | `/nannies/me/location` | Yes | NANNY | NANNY-06 |
| `GET` | `/nannies/me/availability` | Yes | NANNY | NANNY-07 |
| `PUT` | `/nannies/me/availability` | Yes | NANNY | NANNY-07 |
| `GET` | `/nannies/me/blocked-dates` | Yes | NANNY | NANNY-08 |
| `POST` | `/nannies/me/blocked-dates` | Yes | NANNY | NANNY-08 |
| `DELETE` | `/nannies/me/blocked-dates/:date` | Yes | NANNY | NANNY-08 |
| `GET` | `/nannies/me/certifications` | Yes | NANNY | NANNY-17 |
| `POST` | `/nannies/me/certifications` | Yes | NANNY | NANNY-16 |
| `DELETE` | `/nannies/me/certifications/:certId` | Yes | NANNY | NANNY-18 |
| `GET` | `/nannies/search` | Yes | MOTHER | NANNY-10 |
| `GET` | `/nannies/recommended` | Yes | MOTHER | NANNY-11 |
| `GET` | `/nannies/favorites` | Yes | MOTHER | NANNY-15 |
| `GET` | `/nannies/:id` | Yes | MOTHER, ADMIN | NANNY-09 |
| `POST` | `/nannies/:id/favorite` | Yes | MOTHER | NANNY-13 |
| `DELETE` | `/nannies/:id/favorite` | Yes | MOTHER | NANNY-14 |
| `PATCH` | `/admin/certifications/:certId` | Yes | ADMIN | NANNY-19 |

---

## Implementation Order

```
NANNY-01  Prisma — NannyProfile (PostGIS)
    |
NANNY-02  Prisma — Certification
    |
NANNY-03  Prisma — FavoriteNanny
    |
NANNY-04  Shared Zod schemas
    |
    ├── NANNY-05  Nanny updates profile
    |       |
    |   NANNY-06  Nanny sets location
    |       |
    |   NANNY-07  Nanny availability schedule
    |       |
    |   NANNY-08  Nanny blocked dates
    |
    ├── NANNY-16  Nanny uploads certification
    |       |
    |   NANNY-17  Nanny lists certifications
    |       |
    |   NANNY-18  Nanny deletes certification
    |       |
    |   NANNY-19  Admin verifies certification
    |
    ├── NANNY-09  View public nanny profile
    |       |
    |   NANNY-12  Social proof / common connections
    |
    ├── NANNY-10  Search nannies (PostGIS)
    |       |
    |   NANNY-11  Recommended nearby nannies
    |
    └── NANNY-13  Add favorite
            |
        NANNY-14  Remove favorite
            |
        NANNY-15  List favorites
```

---

## Non-Functional Requirements (from PRD Table 18 & Table 19)

| Requirement | Target |
|---|---|
| Search results render | <= 1.5 seconds initial content |
| Pagination loads | <= 1 second |
| Default nanny search radius | 5 miles (configurable, Table 19) |
| PostGIS spatial index | GIST index on `NannyProfile.location` |
| Profile photo/cert uploads | Max 5MB (avatar), 10MB (cert document) |
| Certification verification | Admin-gated; auto-verify nanny profile when key certs approved |
| API rate limit | 100 req / 15 min per user (general) |
| All API traffic | HTTPS/TLS 1.3 minimum |
| Location privacy | Precise coordinates never exposed to other users; only distance/neighborhood shown (PRD Table 6) |
| Review submission | Only after completed booking (FR-02-05, enforced server-side) |
