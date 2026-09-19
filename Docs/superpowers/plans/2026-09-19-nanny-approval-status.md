# Nanny Approval — One Status, One Decision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nanny is visible to parents when — and only when — an admin has approved her; the status that records that decision is named `approvalStatus` everywhere; the profile-completeness gate, the dead `nanny_profiles` KYC columns and the "nanny in the ID gallery" path are gone; an admin can edit every field of her profile; and registration refuses a nanny who leaves her address, age ranges or working days empty.

**Architecture:** One rename (`idVerificationStatus` → `approvalStatus`, `idReviewedAt` → `reviewedAt`, `idRejectionReason` → `rejectionReason`, enum `IdVerificationStatus` → `ApprovalStatus`) flows from the Prisma schema through `@nanny-app/shared` into the backend, admin console and mobile app. The nanny gate collapses to `user.approvalStatus = APPROVED`. The admin ID-review queue is narrowed to parents; the nanny decision stays on her detail page. `writeNannyProfileFields` grows three user-level fields so the admin editor can set photo, date of birth and home pin.

**Tech Stack:** Prisma 7 + PostgreSQL, Express + Zod (`@nanny-app/shared`), React 19 + TanStack Query + MSW/Vitest (admin), Expo/RN + Jest (mobile), Playwright (admin E2E), Maestro seeders (mobile E2E).

Spec: `Docs/superpowers/specs/2026-09-19-nanny-approval-status-design.md`.

## Global Constraints

- **Names:** `approvalStatus` / `reviewedAt` / `rejectionReason` / `ApprovalStatus` (values `PENDING_ID | PENDING_REVIEW | APPROVED | REJECTED`). ID-document fields keep their `idDocument*` names.
- **No dead code or wording.** When a task deletes a concept, grep for its name before committing (`git grep -n <name>` from the repo root) — zero hits outside `Docs/superpowers/**` (dated records) and `apps/backend/prisma/migrations/**` (history).
- **Comments say what is true now**, not what changed ("approved by an admin", never "KYC gate now lives on the user row").
- **Nanny copy:** "Approve nanny" / "Reject application" / "Nanny approved" / "Application rejected". **Mother copy keeps "ID"** ("Approve ID", "ID approved").
- **Admin editable set for a nanny:** everything except email, phone and the ID images.
- **Verification:** ESLint is broken repo-wide — verify with `pnpm typecheck` and the package's test runner. Unit tests never need the test stack; integration/E2E tiers need `pnpm test:env` (+ `pnpm --filter=@nanny-app/backend start:test` for E2E) and are run once at the end (Task 14).
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Windows file casing:** edit files by their exact on-disk path (see memory `admin-entry-file-lowercase`).

---

## File map

| Area | Files |
|---|---|
| Shared | `packages/shared/src/auth.ts` (gains `ApprovalStatusSchema`), `nanny.ts` (loses status enums + completeness), `admin.ts` (one filter schema, parents-only ID review, wider nanny update), `__tests__/admin-nanny-update.test.ts` (new) |
| DB | `apps/backend/prisma/schema.prisma`, `prisma/migrations/20260919120000_rename_approval_status_and_drop_nanny_profile_kyc/migration.sql` (new) |
| Backend services | `auth.service.ts`, `nanny.service.ts`, `booking.service.ts`, `camera.service.ts`, `admin-user.service.ts`, `admin-nanny.service.ts`, `admin-id-review.service.ts`, `middleware/nanny.middleware.ts`, `routes/admin.routes.ts` |
| Backend tests | `__tests__/nanny-profile-completeness.test.ts` (deleted), `nanny-profile-update.test.ts`, `auth-register-nanny-profile.test.ts`, `admin-id-review.service.test.ts`, `admin-nanny.service.test.ts`, `admin-nanny-update.test.ts`, `admin-mother.service.test.ts`, `auth-service-id.test.ts`, `booking-mother-id-gate.test.ts`, `booking-create-children.test.ts`, `booking-broadcast-radius.test.ts`, `nanny-approval-gate.test.ts` (new), journeys `a10/a11/a14/a21`, `test/factories/user.ts`, `test/e2e/seed-mobile.ts`, `prisma/seed-demo.ts` |
| Admin | `lib/approval-status.ts` (renamed from `id-status.ts`), `lib/api.ts`, `features/nannies/nanny-review-tab.tsx`, `nanny-profile-editor.tsx`, `pages/nanny-detail-page.tsx`, `features/users/mothers-tab.tsx`, `pages/mother-detail-page.tsx`, `features/id-reviews/id-review-tab.tsx`, `id-review-card.tsx`, `pages/users-page.tsx`, `features/dashboard/use-dashboard-stats.ts`, tests `pages/__tests__/dashboard-page.test.tsx`, `features/id-reviews/__tests__/id-review-card.test.tsx` (new), `features/nannies/__tests__/nanny-profile-editor.test.tsx` (new), `e2e/b05-users-and-id-review.spec.ts`, `e2e/helpers/backend.ts` |
| Mobile | `src/components/ProfileVisibilityBanner.tsx` (deleted), `screens/nanny/NannyDashboardScreen.tsx`, `NannyProfileEditScreen.tsx`, `app/index.tsx`, `hooks/useIdGate.ts`, `screens/auth/PendingReviewScreen.tsx`, `UploadIdScreen.tsx`, `screens/parent/MotherProfileWalletScreen.tsx`, `__tests__/AccountScreen.test.tsx`, `e2e/accounts.mjs`, `e2e/scripts/advance.js` |
| Registration | `packages/shared/src/auth.ts` (`RegisterRequestSchema` refines) + `__tests__/register-nanny-required.test.ts` (new), `apps/mobile/src/screens/auth/RegistrationNannyLocationScreen.tsx`, `RegistrationNannyDetailsScreen.tsx`, `apps/mobile/e2e/flows/a10-nanny-onboarding.yaml`, `apps/backend/src/__integration__/journeys/a10-nanny-onboarding.test.ts`, `apps/admin/e2e/helpers/backend.ts` |
| Docs | `Docs/testing/e2e-flows.md`, `.claude/skills/mobile-e2e-lab/references/authoring-flows.md` |

---

### Task 1: Shared package — the `ApprovalStatus` enum, no completeness, one filter, parents-only ID review, wider nanny update

**Files:**
- Modify: `packages/shared/src/auth.ts`
- Modify: `packages/shared/src/nanny.ts:112-224`
- Modify: `packages/shared/src/admin.ts:13-21, 578-612, 652-655, 668-670, 724-792`
- Test: `packages/shared/src/__tests__/admin-nanny-update.test.ts` (new)

**Interfaces:**
- Produces: `ApprovalStatusSchema`, `ApprovalStatus` (const + type) exported from `auth.ts`; `UserResponse.approvalStatus`, `UserResponse.rejectionReason`; `AdminApprovalStatusFilterSchema` / `AdminApprovalStatusFilter`; `AdminNanny.approvalStatus`, `AdminMother.approvalStatus`, `AdminIdReview` `{ id, name, avatarUrl, location, idDocumentType, idDocumentFrontUrl, idDocumentBackUrl, approvalStatus, rejectionReason, reviewedAt, createdAt }`; `AdminIdReviewListQuery` `{ status, page, limit, sort }`; `UpdateAdminNanny` gains `avatarUrl?: string | null`, `dateOfBirth?: string`, `latitude?: number`, `longitude?: number`; `AdminNannyDetail` gains `latitude: number | null`, `longitude: number | null`.
- Removes: `IdVerificationStatusSchema`, `IdVerificationStatus`, `NannyApprovalStatusSchema`, `NannyApprovalStatus`, `NANNY_VISIBILITY_REQUIRED_FIELDS`, `NannyVisibilityFieldKey`, `NannyVisibilityField`, `NannyProfileCompletenessInput`, `getMissingNannyProfileFields`, `isNannyProfileComplete`, `NannyProfileResponse.isProfileComplete`, `AdminNannyStatusFilter(Schema)`, `AdminMotherStatusFilter(Schema)`, `AdminIdReviewStatusFilter(Schema)`, `AdminIdReviewRoleFilter(Schema)`, `AdminIdReview.role`, `AdminIdReview.userId`.

- [ ] **Step 1: Write the failing schema test**

Create `packages/shared/src/__tests__/admin-nanny-update.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { UpdateAdminNannySchema } from '../admin';

describe('UpdateAdminNannySchema', () => {
  it('accepts the fields an admin can now correct: photo, date of birth and home pin', () => {
    const parsed = UpdateAdminNannySchema.safeParse({
      avatarUrl: 'https://cdn.example/nanny.jpg',
      dateOfBirth: '1995-06-15',
      latitude: 30.0444,
      longitude: 31.2357,
    });
    expect(parsed.success).toBe(true);
  });

  it('lets the photo be cleared with null', () => {
    expect(UpdateAdminNannySchema.safeParse({ avatarUrl: null }).success).toBe(true);
  });

  it('refuses a latitude without a longitude (and vice versa)', () => {
    const lat = UpdateAdminNannySchema.safeParse({ latitude: 30.0444 });
    expect(lat.success).toBe(false);
    if (!lat.success) {
      expect(lat.error.issues[0]?.message).toBe(
        'Latitude and longitude must be updated together.',
      );
    }
    expect(UpdateAdminNannySchema.safeParse({ longitude: 31.2357 }).success).toBe(false);
  });

  it('refuses a malformed date of birth', () => {
    expect(UpdateAdminNannySchema.safeParse({ dateOfBirth: '15/06/1995' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter=@nanny-app/shared test -- admin-nanny-update`
Expected: FAIL — the first and third tests fail (`avatarUrl` etc. are stripped/unknown, no refine).

- [ ] **Step 3: Move the status enum into `auth.ts` and rename it**

In `packages/shared/src/auth.ts`, change the import block at the top to:

```ts
import {
  AvailabilityTypeSchema,
  IdDocumentTypeSchema,
  WeeklyScheduleSchema,
  idTypeRequiresBack,
} from './nanny';
```

and add, directly above `export const UserResponseSchema`:

```ts
/**
 * Admin approval state of an account, for BOTH roles (lives on `users`).
 * - PENDING_ID: no usable ID on file — the user must (re)upload one.
 * - PENDING_REVIEW: waiting for an admin decision.
 * - APPROVED: a parent's ID checked out; a nanny's whole application
 *   (profile + ID) was reviewed and accepted — she is visible to parents.
 * - REJECTED: an admin refused it; the ID images were deleted and a reason
 *   stored, so the user must upload a new ID to be reviewed again.
 * Gate predicate (both roles): needs an upload when PENDING_ID or REJECTED.
 */
export const ApprovalStatusSchema = z.enum([
  'PENDING_ID',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
]);
/** Enum-like const for value comparisons: `ApprovalStatus.APPROVED`, … */
export const ApprovalStatus = ApprovalStatusSchema.enum;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
```

In `UserResponseSchema`, replace the three status lines with:

```ts
  /** Admin approval state (nannies and mothers). Null for admins/role-less. */
  approvalStatus: ApprovalStatusSchema.nullable(),
  /** Kind of ID on file, if any. Null until the user uploads one. */
  idDocumentType: IdDocumentTypeSchema.nullable(),
  /** Reason an admin gave when rejecting, surfaced in the forced re-upload prompt. */
  rejectionReason: z.string().nullable(),
```

- [ ] **Step 4: Strip the old enums and the completeness rule from `nanny.ts`**

In `packages/shared/src/nanny.ts` delete lines 112–133 (`NannyApprovalStatusSchema` … `IdVerificationStatus` type) so the file goes straight from `BOOKING_START_TOO_LATE_MESSAGE` to the `IdDocumentTypeSchema` comment. Delete `isProfileComplete: z.boolean(),` from `NannyProfileResponseSchema`. Delete the whole `// ── Profile visibility / completeness` section (from that heading through `isNannyProfileComplete`), so `NannyProfileResponse` is followed directly by `// ── Public nanny listing`.

- [ ] **Step 5: Rework `admin.ts`**

Change the `./nanny` import to drop `IdVerificationStatusSchema`, and add `import { ApprovalStatusSchema } from './auth';` in alphabetical position (after `./admin`-less imports — i.e. as the first relative import).

Replace the nanny-queue header + filter (lines 578–585) with:

```ts
// ──────────────────────────────────────────────────────────────
// Nanny review queue (admin vetting of new nanny registrations)
// ──────────────────────────────────────────────────────────────

/**
 * Approval-status filter shared by the Nannies tab, the Mommies tab and the
 * parent ID-review gallery — the same four states plus ALL.
 */
export const AdminApprovalStatusFilterSchema = z.enum([
  'ALL', 'PENDING_ID', 'PENDING_REVIEW', 'APPROVED', 'REJECTED',
]);
export type AdminApprovalStatusFilter = z.infer<typeof AdminApprovalStatusFilterSchema>;
```

In `AdminNannySchema` replace `idVerificationStatus: IdVerificationStatusSchema,` with `approvalStatus: ApprovalStatusSchema,`. In `AdminNannyListQuerySchema` use `status: AdminApprovalStatusFilterSchema.catch('PENDING_REVIEW').default('PENDING_REVIEW'),`.

In `AdminNannyDetailSchema` add after `schedule`:

```ts
  /** Home pin (from the user row); null when never captured. */
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
```

Delete `AdminMotherStatusFilterSchema` / `AdminMotherStatusFilter` (lines 652–655). In `AdminMotherSchema` replace the status line + comment with:

```ts
  /** Admin approval state — for a parent, whether her ID checked out. */
  approvalStatus: ApprovalStatusSchema.nullable(),
```

and in `AdminMotherListQuerySchema` use `status: AdminApprovalStatusFilterSchema.catch('ALL').default('ALL'),`.

Replace `UpdateAdminNannySchema` (lines 724–737) with:

```ts
/**
 * Partial update for a nanny account (PATCH /admin/nannies/:id). A nanny
 * cannot edit her own profile, so the console can correct every field she
 * entered at registration — name, photo, date of birth, home address and
 * pin, bio, experience, age ranges, availability, schedule, certifications.
 * Email and phone (Firebase Auth identity) and the ID images (she re-uploads
 * after a reject) are intentionally not here.
 */
export const UpdateAdminNannySchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    avatarUrl: z.string().url().nullable().optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD').optional(),
    location: z.string().trim().max(200).optional(),
    // The home pin proximity search reads. Sent as a pair so the pin can never
    // half-move; the address text is independent (it is what parents read).
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    bio: z.string().trim().max(600).optional(),
    yearsOfExperience: z.number().int().min(0).max(60).optional(),
    ageRanges: z.array(z.string()).optional(),
    availabilityType: AvailabilityTypeSchema.optional(),
    schedule: WeeklyScheduleSchema.optional(),
    certificationIds: z.array(z.number().int().positive()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update.' })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'Latitude and longitude must be updated together.',
    path: ['latitude'],
  });
export type UpdateAdminNanny = z.infer<typeof UpdateAdminNannySchema>;
```

Replace the whole combined-ID-review section (from `// Combined ID review queue` through `AdminIdReviewListQuery`) with:

```ts
// ──────────────────────────────────────────────────────────────
// Parent ID review queue (a parent's approval is an ID check)
// ──────────────────────────────────────────────────────────────

/**
 * One card in the parent ID-review gallery. Nannies are not here: their ID is
 * reviewed on the nanny detail page as part of approving the application.
 */
export const AdminIdReviewSchema = z.object({
  /** User id — what the mother approve/reject endpoints are keyed by. */
  id: z.number().int(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  location: z.string().nullable(),
  idDocumentType: IdDocumentTypeSchema.nullable(),
  idDocumentFrontUrl: z.string().nullable(),
  idDocumentBackUrl: z.string().nullable(),
  approvalStatus: ApprovalStatusSchema.nullable(),
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminIdReview = z.infer<typeof AdminIdReviewSchema>;

/**
 * Paginated parent ID-review query (GET /admin/id-reviews). Defaults to the
 * pending queue, oldest first — this list is worked through, so the person who
 * has been waiting longest is offered first. The console shows that choice as a
 * sort control, so it reads as a decision rather than as the per-role tabs
 * mysteriously running the other way.
 */
export const AdminIdReviewListQuerySchema = AdminSortedListQuerySchema.extend({
  status: AdminApprovalStatusFilterSchema.catch('PENDING_REVIEW').default('PENDING_REVIEW'),
  sort: AdminSortOrderSchema.catch('oldest').default('oldest'),
});
export type AdminIdReviewListQuery = z.infer<typeof AdminIdReviewListQuerySchema>;
```

- [ ] **Step 6: Run the shared tests and typecheck**

Run: `pnpm --filter=@nanny-app/shared test && pnpm --filter=@nanny-app/shared typecheck`
Expected: all Vitest suites PASS; `tsc` exits 0.

Run: `git grep -n "IdVerificationStatus\|NannyApprovalStatus\|getMissingNannyProfileFields\|isNannyProfileComplete\|NANNY_VISIBILITY_REQUIRED_FIELDS\|AdminIdReviewRoleFilter\|AdminNannyStatusFilter\|AdminMotherStatusFilter\|AdminIdReviewStatusFilter" -- packages`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): approvalStatus is the one account-approval state; the completeness rule is gone

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(Downstream packages will not typecheck until Tasks 2–12 land — that is expected.)

---

### Task 2: Database — rename the status, drop the dead nanny_profiles columns

**Files:**
- Modify: `apps/backend/prisma/schema.prisma:122-139, 203-211, 257, 273-281, 298`
- Create: `apps/backend/prisma/migrations/20260919120000_rename_approval_status_and_drop_nanny_profile_kyc/migration.sql`

**Interfaces:**
- Produces: Prisma `ApprovalStatus` enum; `User.approvalStatus`, `User.reviewedAt`, `User.rejectionReason`; `NannyProfile` without `isProfileComplete`, `approvalStatus`, `reviewedAt`, `rejectionReason`, `idDocumentFrontUrl`, `idDocumentBackUrl`.

- [ ] **Step 1: Edit the schema**

Delete the `enum NannyApprovalStatus { … @@map("nanny_approval_status") }` block (lines 122–128). Replace the `IdVerificationStatus` enum with:

```prisma
/// Admin approval state, shared by nannies AND mothers (lives on `users`).
/// PENDING_ID = must (re)upload; PENDING_REVIEW = awaiting admin; APPROVED / REJECTED.
/// A parent is approved once her ID checks out; a nanny once an admin has
/// reviewed her whole application (profile + ID).
enum ApprovalStatus {
  PENDING_ID
  PENDING_REVIEW
  APPROVED
  REJECTED

  @@map("approval_status")
}
```

In `model User`, replace the ID block (comment + six fields, lines 203–211) with:

```prisma
  /// Identity documents + the admin's decision, for BOTH nannies and mothers.
  /// Nannies must be APPROVED to appear in search / use the app; mothers must
  /// have uploaded an ID (not PENDING_ID/REJECTED) before booking. Null for
  /// admins/role-less.
  approvalStatus       ApprovalStatus?       @map("approval_status")
  idDocumentType       IdDocumentType?       @map("id_document_type")
  idDocumentFrontUrl   String?               @map("id_document_front_url")
  idDocumentBackUrl    String?               @map("id_document_back_url")
  reviewedAt           DateTime?             @map("reviewed_at")
  rejectionReason      String?               @map("rejection_reason")
```

and change `@@index([idVerificationStatus])` to `@@index([approvalStatus])`.

In `model NannyProfile` delete these lines: `isProfileComplete …`, the three-line `/// Admin vetting gate …` comment, `approvalStatus …`, `reviewedAt …`, `rejectionReason …`, the `/// Identity documents captured …` comment, `idDocumentFrontUrl …`, `idDocumentBackUrl …`, and `@@index([approvalStatus])`.

- [ ] **Step 2: Write the migration by hand**

Create `apps/backend/prisma/migrations/20260919120000_rename_approval_status_and_drop_nanny_profile_kyc/migration.sql`:

```sql
-- The admin's decision on an account is its *approval* — for a parent that is
-- an ID check, for a nanny it covers her whole application (profile + ID) —
-- so the column, its enum and the two decision fields drop the `id_` prefix.
-- Renames only: no data moves.
ALTER TYPE "id_verification_status" RENAME TO "approval_status";
ALTER TABLE "users" RENAME COLUMN "id_verification_status" TO "approval_status";
ALTER TABLE "users" RENAME COLUMN "id_reviewed_at" TO "reviewed_at";
ALTER TABLE "users" RENAME COLUMN "id_rejection_reason" TO "rejection_reason";
ALTER INDEX "users_id_verification_status_idx" RENAME TO "users_approval_status_idx";

-- Release 2 of the 2026-07-17 move of KYC onto users: nothing has read these
-- nanny_profiles columns since, and the profile-completeness flag no longer
-- gates anything (approval is the only gate). Dropping the column drops
-- nanny_profiles_approval_status_idx with it.
ALTER TABLE "nanny_profiles"
  DROP COLUMN "is_profile_complete",
  DROP COLUMN "approval_status",
  DROP COLUMN "reviewed_at",
  DROP COLUMN "rejection_reason",
  DROP COLUMN "id_document_front_url",
  DROP COLUMN "id_document_back_url";
DROP TYPE "nanny_approval_status";
```

- [ ] **Step 3: Regenerate the client and check the migration matches the schema**

Run: `pnpm --filter=@nanny-app/backend db:generate`
Expected: "Generated Prisma Client".

If the test stack is up (`pnpm test:env`), also run from `apps/backend`:
`DATABASE_URL=postgresql://postgres:postgres@localhost:55432/nannyapp_test npx prisma migrate deploy && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/nannyapp_test npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url postgresql://postgres:postgres@localhost:55432/nannyapp_test`
Expected: "No difference detected." (If the stack is not up, Task 14 runs this.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/20260919120000_rename_approval_status_and_drop_nanny_profile_kyc
git commit -m "feat(db): users.approval_status; drop the nanny_profiles KYC and completeness columns

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Backend — the mechanical rename, with comments that say what is true

**Files:**
- Modify: `apps/backend/src/services/auth.service.ts`, `admin-user.service.ts`, `admin-nanny.service.ts`, `admin-id-review.service.ts`, `nanny.service.ts`, `booking.service.ts`, `camera.service.ts`, `apps/backend/src/middleware/nanny.middleware.ts`
- Modify (tests, factories, seeds): `apps/backend/src/__tests__/admin-nanny.service.test.ts`, `admin-mother.service.test.ts`, `auth-service-id.test.ts`, `booking-mother-id-gate.test.ts`, `booking-create-children.test.ts`, `admin-nanny-update.test.ts`, `auth-register-nanny-profile.test.ts`, `admin-id-review.service.test.ts`, `src/__integration__/journeys/a10-nanny-onboarding.test.ts`, `a11-mother-id-gate.test.ts`, `a14-mother-email-gate.test.ts`, `a21-cameras.test.ts`, `test/factories/user.ts`, `test/e2e/seed-mobile.ts`, `prisma/seed-demo.ts`

**Interfaces:**
- Produces: every backend reference uses `approvalStatus` / `reviewedAt` / `rejectionReason` / `ApprovalStatus` (Prisma import).

- [ ] **Step 1: Run the rename across the backend**

From the repo root (Git Bash):

```bash
cd apps/backend
FILES=$(git grep -l "idVerificationStatus\|IdVerificationStatus\|idReviewedAt\|idRejectionReason" -- src test prisma/seed-demo.ts)
sed -i \
  -e 's/idVerificationStatus/approvalStatus/g' \
  -e 's/IdVerificationStatus/ApprovalStatus/g' \
  -e 's/idReviewedAt/reviewedAt/g' \
  -e 's/idRejectionReason/rejectionReason/g' \
  $FILES
git grep -n "idVerificationStatus\|IdVerificationStatus\|idReviewedAt\|idRejectionReason" -- src test prisma/seed-demo.ts
```

Expected: the final grep prints nothing.

- [ ] **Step 2: Fix the two DTO mappers the rename made self-referential-looking**

In `auth.service.ts` `toUserResponse` the line now reads `rejectionReason: user.rejectionReason,` and `approvalStatus: user.approvalStatus,` — correct, leave. Rewrite the function's doc comment to:

```ts
/**
 * Convert a Prisma `User` row into the wire format defined by
 * `UserResponseSchema`. Strips internal columns (timestamps, soft-delete
 * markers) and serializes Date fields to ISO strings. The ID image URLs are
 * intentionally NOT exposed here — they are KYC-sensitive and only returned
 * by admin endpoints.
 */
```

In `admin-user.service.ts` the select comment `// Identity verification (mothers are reviewed the same way as nannies).` becomes `// The admin's decision on her ID, plus the document itself.`; the mapper lines `rejectionReason: row.rejectionReason,` / `reviewedAt: row.reviewedAt?.toISOString() ?? null,` / `approvalStatus: row.approvalStatus,` are correct as produced.

In `admin-nanny.service.ts` change `// Identity verification now lives on the user row.` to `// The admin's decision on her application, plus her ID document.` and `approvalStatus: row.user.approvalStatus ?? ApprovalStatus.PENDING_REVIEW,` stays. Rewrite the `approveNanny` doc comment to:

```ts
/**
 * Admin approves a nanny's application after reviewing her profile and ID:
 * PENDING_REVIEW / REJECTED → APPROVED, then notifies her (in-app + push)
 * that she can start using the app.
 */
```

- [ ] **Step 3: Rewrite the "now lives on the user row" comments**

- `nanny.service.ts` `buildListWhere`: replace the five-line comment starting `// Single \`user\` condition:` with:

```ts
    // Single `user` condition: exclude soft-deleted users, require an admin
    // APPROVED account, and add the name search when present. Kept as one
    // object so the name filter does not clobber the guards (which would leak
    // soft-deleted / unapproved nannies into the count and desync it from the
    // raw-SQL rows).
```

- `booking.service.ts` `notifyBookingBroadcast`: delete the line `// KYC gate now lives on the user row.`
- `middleware/nanny.middleware.ts` doc comment: keep as is (it already says "whose profile an admin has APPROVED").
- `camera.service.ts`: no comment to change.

- [ ] **Step 4: Remove the dead profile-level fields from the admin-nanny test fixtures**

In `apps/backend/src/__tests__/admin-nanny.service.test.ts`: delete the `import { NannyApprovalStatus } from '@nanny-app/shared';` line; in `makeRow` delete the five profile-level lines `approvalStatus: NannyApprovalStatus.PENDING_REVIEW,`, `rejectionReason: null,`, `reviewedAt: null,`, `idDocumentFrontUrl: …`, `idDocumentBackUrl: …` (the ones **above** `createdAt`, not the ones inside `user`); in `stubProfileRow` delete the same five profile-level keys. Any assertion that reads `row.approvalStatus` at the profile level must read `row.user.approvalStatus` — run the file and fix what fails.

In `test/factories/user.ts` `makeNanny`: delete `isProfileComplete: true,` and the `approvalStatus: 'APPROVED',` line plus its three comment lines; replace the user-level comment with:

```ts
  const user = await createUser('nanny', Role.NANNY, {
    // APPROVED by default: a PENDING_REVIEW nanny is invisible to search and
    // cannot be booked, so it would be a surprising default for a factory.
    // Pass `user: { approvalStatus: 'PENDING_REVIEW' }` to test the gate.
    approvalStatus: 'APPROVED',
```

In `test/e2e/seed-mobile.ts`: in `AccountSpec` delete the nanny-only `approvalStatus?: …` line and its comment, and reword the remaining one to `/** Defaults to APPROVED; A10 seeds a nanny still awaiting vetting, A11 a mother who has never uploaded an ID. */`; in the profile object delete `isProfileComplete: true,` and the `approvalStatus: spec.approvalStatus ?? …` line with its two comment lines.

In `prisma/seed-demo.ts` delete every `isProfileComplete: true,` and `approvalStatus: 'APPROVED',` inside the `nannyProfile.upsert` (both `create` and `update`), including the two comment lines above the first.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter=@nanny-app/backend typecheck`
Expected: errors only in `nanny.service.ts`, `auth.service.ts`, `booking.service.ts` about `isProfileComplete` / `getMissingNannyProfileFields` (Task 4), `admin-id-review.service.ts` about `role` (Task 5), `admin-nanny.service.ts` about `latitude`/`longitude` missing on `AdminNannyDetail` (Task 6), and the tests that pin those. Nothing about `approvalStatus`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend
git commit -m "refactor(backend): approvalStatus, reviewedAt, rejectionReason — the decision, not the ID

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Backend — approval is the only nanny gate

**Files:**
- Modify: `apps/backend/src/services/nanny.service.ts:1-20, 96-113, 180-250, 263-306`
- Modify: `apps/backend/src/services/auth.service.ts:5-18, 177-200`
- Modify: `apps/backend/src/services/booking.service.ts:535-557`
- Delete: `apps/backend/src/__tests__/nanny-profile-completeness.test.ts`
- Modify: `apps/backend/src/__tests__/nanny-profile-update.test.ts`, `auth-register-nanny-profile.test.ts:163-178`
- Test: `apps/backend/src/__tests__/nanny-approval-gate.test.ts` (new — listing `where` + `requireApprovedNanny`)

**Interfaces:**
- Consumes: `ApprovalStatus` from `@prisma/client`.
- Produces: `writeNannyProfileFields(tx, { userId, nannyProfileId, fields })` with no completeness recompute; `listNannies` / `notifyBookingBroadcast` filter on `user.approvalStatus = APPROVED` only.

- [ ] **Step 1: Write the failing gate test**

Create `apps/backend/src/__tests__/nanny-approval-gate.test.ts`:

```ts
/**
 * The only thing that hides a nanny from parents is an admin not having
 * approved her. These pin the `where` clauses of the two places that decide
 * who a parent can see — search and the booking broadcast — so a
 * profile-completeness (or any other) predicate cannot creep back in.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    nannyProfile: { count: jest.fn(), findMany: jest.fn() },
  },
}));

import type { NextFunction, Request, Response } from 'express';

import { prisma } from '@backend/db/prisma';
import { AppError } from '@backend/lib/errors';
import { requireApprovedNanny } from '@backend/middleware/nanny.middleware';
import { listNannies } from '@backend/services/nanny.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  nannyProfile: { count: jest.Mock; findMany: jest.Mock };
};

describe('listNannies — who a parent can see', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.nannyProfile.count.mockResolvedValue(0);
    mockPrisma.nannyProfile.findMany.mockResolvedValue([]);
  });

  it('filters on admin approval and soft-deletes only', async () => {
    await listNannies({ page: 1, limit: 20 });

    expect(mockPrisma.nannyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          user: { deletedAt: null, approvalStatus: 'APPROVED' },
        },
      }),
    );
    const where = mockPrisma.nannyProfile.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('isProfileComplete');
  });
});

describe('requireApprovedNanny — who may use the nanny endpoints', () => {
  const req = { firebaseUser: { uid: 'fb-nanny' } } as unknown as Request;
  const res = {} as Response;

  function nannyRow(approvalStatus: string) {
    return {
      role: 'NANNY',
      deletedAt: null,
      approvalStatus,
      nannyProfile: { deletedAt: null },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lets an APPROVED nanny through', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyRow('APPROVED'));
    const next: NextFunction = jest.fn();

    await requireApprovedNanny(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it.each(['PENDING_ID', 'PENDING_REVIEW', 'REJECTED'])(
    'refuses a %s nanny with 403',
    async (status) => {
      mockPrisma.user.findUnique.mockResolvedValue(nannyRow(status));
      const next: NextFunction = jest.fn();

      await requireApprovedNanny(req, res, next);

      const err = (next as jest.Mock).mock.calls[0][0] as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe('Your nanny profile has not been approved yet.');
    },
  );
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter=@nanny-app/backend test:unit -- nanny-approval-gate`
Expected: FAIL — `where` still carries `isProfileComplete: true` (and the import may fail on `getMissingNannyProfileFields`).

- [ ] **Step 3: Strip completeness from `nanny.service.ts`**

Remove `getMissingNannyProfileFields,` from the `@nanny-app/shared` import. In `toNannyProfileResponse` delete `isProfileComplete: profile.isProfileComplete,`. In `buildListWhere` delete `isProfileComplete: true,`; in `buildListFilterSql` delete `Prisma.sql\`np.is_profile_complete = true\`,`.

Replace `writeNannyProfileFields` (its doc comment through its closing brace) with:

```ts
/**
 * Core nanny-profile writer shared by registration and the admin edit path —
 * the two writers of a nanny profile (a nanny cannot edit her own). Must run
 * inside a caller-provided transaction, with the `NannyProfile` row already
 * existing (callers upsert/find it first so `nannyProfileId` is always
 * concrete). Writes `User` (name / avatar / date of birth / address / home
 * pin), upserts `NannyProfile` (bio / yearsOfExperience / ageRanges /
 * schedule / availabilityType), and reconciles certification links. Fields
 * the caller omits are left untouched.
 */
export async function writeNannyProfileFields(
  tx: PrismaTypes.TransactionClient,
  params: { userId: number; nannyProfileId: number; fields: NannyProfileWritable },
): Promise<void> {
  const { userId, nannyProfileId, fields } = params;
  const {
    firstName,
    lastName,
    avatarUrl,
    dateOfBirth,
    location,
    latitude,
    longitude,
    certificationIds,
    ...profileFields
  } = fields;

  const userData = {
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(avatarUrl !== undefined && { avatarUrl }),
    ...(dateOfBirth !== undefined && { dateOfBirth: new Date(dateOfBirth) }),
    ...(location !== undefined && { address: location }),
    ...(latitude !== undefined && { latitude }),
    ...(longitude !== undefined && { longitude }),
  };
  if (Object.keys(userData).length > 0) {
    await tx.user.update({ where: { id: userId }, data: userData });
  }

  await tx.nannyProfile.upsert({
    where: { userId },
    create: { userId, ...profileFields },
    update: { ...profileFields },
    select: { id: true },
  });

  // Reconcile the certification links inside the same transaction so the
  // profile write and its tags stay atomic.
  if (certificationIds !== undefined) {
    await reconcileNannyCertifications(tx, nannyProfileId, certificationIds);
  }
}
```

Extend `NannyProfileWritable` (add after `avatarUrl`):

```ts
  /** YYYY-MM-DD. */
  dateOfBirth?: string;
```

and after `location`:

```ts
  latitude?: number;
  longitude?: number;
```

Change the comment above `getNannyProfile` to `// ── Self profile (nanny reading her own profile — set at registration, edited only by admins) ──`.

- [ ] **Step 4: Strip completeness from registration and the broadcast**

`auth.service.ts`: remove `getMissingNannyProfileFields,` from the import. Replace the block from `// Home location (address + coordinates) lives solely on the user row;` through `isProfileComplete,` inside the profile create with:

```ts
      const profile = await tx.nannyProfile.create({
        data: {
          userId: user.id,
          bio: body.bio ?? null,
          yearsOfExperience: body.yearsOfExperience ?? null,
          ageRanges: body.ageRanges ?? [],
          schedule: body.schedule,
          availabilityType: body.availabilityType,
        },
      });
```

`booking.service.ts` `notifyBookingBroadcast`: delete `isProfileComplete: true,` and change the doc comment sentence `"Eligible" means an approved nanny with a complete profile who is free for the requested window` to `"Eligible" means an admin-approved nanny who is free for the requested window`.

- [ ] **Step 5: Bring the existing tests along**

Delete `apps/backend/src/__tests__/nanny-profile-completeness.test.ts`.

In `auth-register-nanny-profile.test.ts`: in the first test's `toHaveBeenCalledWith` data delete `isProfileComplete: true,`. Replace the second test (`'falls back to null/empty defaults and marks the profile incomplete …'`) with:

```ts
  it('falls back to empty catalog ids when none were chosen', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const { certificationIds: _cert, skillIds: _skill, ...rest } = NANNY_BODY;
    const body: RegisterRequest = rest;

    await registerUser(DECODED, body);

    expect(mockReconcileCertifications).toHaveBeenCalledWith(tx, 99, []);
    expect(mockReconcileSkills).toHaveBeenCalledWith(tx, 99, []);
  });
```

Also update the file's header comment: `availabilityType, isProfileComplete)` → `availabilityType)`.

Rewrite `nanny-profile-update.test.ts` in full:

```ts
/**
 * Unit tests for `writeNannyProfileFields`, the core nanny-profile writer
 * shared by registration and the admin-edit path (a nanny cannot edit her
 * own profile). Driven directly with a mocked `tx`: the user update, the
 * profile upsert and the certification reconcile are what is pinned.
 */
jest.mock('@backend/db/prisma', () => ({
  // `nanny.service.ts` imports `prisma` at module scope for its other
  // exports. `writeNannyProfileFields` itself only ever touches the
  // caller-provided `tx`, but the module-level import still has to resolve
  // to something other than the real client (which would open a connection).
  prisma: {},
}));

jest.mock('@backend/services/certification.service', () => ({
  reconcileNannyCertifications: jest.fn().mockResolvedValue(undefined),
}));

import { reconcileNannyCertifications } from '@backend/services/certification.service';
import { writeNannyProfileFields } from '@backend/services/nanny.service';

const mockReconcile = reconcileNannyCertifications as jest.Mock;

const USER_ID = 10;
const NANNY_PROFILE_ID = 1;

function makeTx() {
  return {
    user: { update: jest.fn().mockResolvedValue({ id: USER_ID }) },
    nannyProfile: { upsert: jest.fn().mockResolvedValue({ id: NANNY_PROFILE_ID }) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('writeNannyProfileFields', () => {
  it('routes user-level fields to the user row, profile fields to the upsert, and reconciles certifications', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: {
        bio: 'Loves kids, 5 years experience',
        location: 'Giza',
        certificationIds: [5],
      },
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { address: 'Giza' },
    });
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: { userId: USER_ID, bio: 'Loves kids, 5 years experience' },
      update: { bio: 'Loves kids, 5 years experience' },
      select: { id: true },
    });
    expect(mockReconcile).toHaveBeenCalledWith(tx, NANNY_PROFILE_ID, [5]);
  });

  it('writes photo, date of birth and home pin onto the user row', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: {
        avatarUrl: 'https://cdn.example/nanny.jpg',
        dateOfBirth: '1995-06-15',
        latitude: 30.0444,
        longitude: 31.2357,
      },
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        avatarUrl: 'https://cdn.example/nanny.jpg',
        dateOfBirth: new Date('1995-06-15'),
        latitude: 30.0444,
        longitude: 31.2357,
      },
    });
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: { userId: USER_ID },
      update: {},
      select: { id: true },
    });
  });

  it('clears the photo when avatarUrl is null', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: { avatarUrl: null },
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { avatarUrl: null },
    });
  });

  it('leaves the user row untouched when only profile fields are sent', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: { yearsOfExperience: 4 },
    });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: { userId: USER_ID, yearsOfExperience: 4 },
      update: { yearsOfExperience: 4 },
      select: { id: true },
    });
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('reconciles certifications even when the array is empty, clearing all tags', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: { certificationIds: [] },
    });

    // `certificationIds !== undefined` gates the reconcile, not truthiness —
    // an empty array must still reach it so all tags get cleared.
    expect(mockReconcile).toHaveBeenCalledWith(tx, NANNY_PROFILE_ID, []);
  });
});
```

- [ ] **Step 6: Add the broadcast `where` assertion to the existing radius suite**

In `apps/backend/src/__tests__/booking-broadcast-radius.test.ts`, inside `describe('notifyBookingBroadcast — radius filter', …)` add:

```ts
  it('offers the request to every approved, free nanny — approval is the only account gate', async () => {
    await runBroadcast({});

    const where = mockPrisma.nannyProfile.findMany.mock.calls[0][0].where;
    expect(where.user).toEqual({ deletedAt: null, approvalStatus: 'APPROVED' });
    expect(where).not.toHaveProperty('isProfileComplete');
  });
```

- [ ] **Step 7: Run the unit tests**

Run: `pnpm --filter=@nanny-app/backend test:unit -- nanny-approval-gate nanny-profile-update auth-register-nanny-profile booking-broadcast-radius`
Expected: PASS.

Run: `git grep -n "isProfileComplete\|is_profile_complete\|getMissingNannyProfileFields" -- apps/backend/src apps/backend/test apps/backend/prisma/schema.prisma apps/backend/prisma/seed-demo.ts`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): admin approval is the only nanny gate; the completeness rule is gone

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Backend — the ID-review queue is parents-only

**Files:**
- Modify: `apps/backend/src/services/admin-id-review.service.ts` (whole file)
- Modify: `apps/backend/src/routes/admin.routes.ts:459` (section comment)
- Test: `apps/backend/src/__tests__/admin-id-review.service.test.ts` (rewrite)

**Interfaces:**
- Produces: `listIdReviews({ status, page, limit, sort })` → `{ reviews: AdminIdReview[]; meta }`, mothers only.

- [ ] **Step 1: Rewrite the test**

Replace `apps/backend/src/__tests__/admin-id-review.service.test.ts` with:

```ts
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

import { prisma } from '@backend/db/prisma';
import { listIdReviews } from '@backend/services/admin-id-review.service';

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock; count: jest.Mock };
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    firstName: 'Nour',
    lastName: 'Ibrahim',
    avatarUrl: null,
    address: 'Cairo',
    approvalStatus: 'PENDING_REVIEW',
    idDocumentType: 'PASSPORT',
    rejectionReason: null,
    reviewedAt: null,
    idDocumentFrontUrl: 'https://example.com/front.jpg',
    idDocumentBackUrl: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('listIdReviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists parents only — a nanny is reviewed on her detail page, never here', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const { meta } = await listIdReviews({ status: 'ALL', sort: 'oldest', page: 2, limit: 25 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, role: 'MOTHER' },
        orderBy: { createdAt: 'asc' },
        skip: 25,
        take: 25,
      }),
    );
    expect(meta).toEqual({ page: 2, limit: 25, total: 1, totalPages: 1 });
  });

  it('applies the approval-status filter when not ALL', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await listIdReviews({ status: 'PENDING_REVIEW', sort: 'oldest', page: 1, limit: 20 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, role: 'MOTHER', approvalStatus: 'PENDING_REVIEW' },
      }),
    );
  });

  it('flips to newest first when the caller asks for it', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await listIdReviews({ status: 'ALL', sort: 'newest', page: 1, limit: 20 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('maps a row: id is the User id the mother endpoints are keyed by', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const { reviews } = await listIdReviews({ status: 'ALL', sort: 'oldest', page: 1, limit: 20 });

    expect(reviews[0]).toEqual({
      id: 7,
      name: 'Nour Ibrahim',
      avatarUrl: null,
      location: 'Cairo',
      idDocumentType: 'PASSPORT',
      idDocumentFrontUrl: 'https://example.com/front.jpg',
      idDocumentBackUrl: null,
      approvalStatus: 'PENDING_REVIEW',
      rejectionReason: null,
      reviewedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('drops the "-" placeholder last name from the display name', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow({ firstName: 'Mona', lastName: '-' })]);

    const { reviews } = await listIdReviews({ status: 'ALL', sort: 'oldest', page: 1, limit: 20 });

    expect(reviews[0]?.name).toBe('Mona');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-id-review`
Expected: FAIL — `where` carries the role `OR`, DTO carries `role`/`userId`, TS complains about the missing `role` arg.

- [ ] **Step 3: Rewrite the service**

Replace `apps/backend/src/services/admin-id-review.service.ts` with:

```ts
import { ApprovalStatus, type Prisma } from '@prisma/client';

import { sortDirection } from '@nanny-app/shared';
import type { AdminIdReview, AdminIdReviewListQuery, PaginationMeta } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';

const idReviewSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  address: true,
  approvalStatus: true,
  idDocumentType: true,
  rejectionReason: true,
  reviewedAt: true,
  idDocumentFrontUrl: true,
  idDocumentBackUrl: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type AdminIdReviewRow = Prisma.UserGetPayload<{ select: typeof idReviewSelect }>;

function toDto(row: AdminIdReviewRow): AdminIdReview {
  return {
    id: row.id,
    // Drop the "-" placeholder last name (see toMotherDto) from the display name.
    name: `${row.firstName} ${row.lastName === '-' ? '' : row.lastName}`.trim(),
    avatarUrl: row.avatarUrl,
    // Home location lives on the user row (single source of truth).
    location: row.address,
    idDocumentType: row.idDocumentType,
    idDocumentFrontUrl: row.idDocumentFrontUrl,
    idDocumentBackUrl: row.idDocumentBackUrl,
    approvalStatus: row.approvalStatus,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The parent ID-review gallery: every mother, filterable by approval status
 * and ordered by the caller's `sort` (defaulting to oldest-waiting first —
 * queue order). A parent's approval is exactly an ID check, so the decision
 * is made here; a nanny's approval covers her whole application and is made
 * on her detail page, so nannies are never listed.
 */
export async function listIdReviews(
  { status, page, limit, sort }: AdminIdReviewListQuery,
): Promise<{ reviews: AdminIdReview[]; meta: PaginationMeta }> {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    role: 'MOTHER',
    ...(status !== 'ALL' ? { approvalStatus: status as ApprovalStatus } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: idReviewSelect,
      orderBy: { createdAt: sortDirection(sort) },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    reviews: rows.map(toDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
```

In `apps/backend/src/routes/admin.routes.ts` change `// ── Combined ID review queue (parents + nannies, one KYC gallery) ──` to `// ── Parent ID review queue ─────────────────────────────────────`.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-id-review`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/admin-id-review.service.ts apps/backend/src/routes/admin.routes.ts apps/backend/src/__tests__/admin-id-review.service.test.ts
git commit -m "feat(backend): the ID-review queue lists parents only

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Backend — the admin can change anything on a nanny's profile

**Files:**
- Modify: `apps/backend/src/services/admin-nanny.service.ts:25-46, 129-145, 343-366`
- Test: `apps/backend/src/__tests__/admin-nanny-update.test.ts`

**Interfaces:**
- Consumes: `writeNannyProfileFields` (Task 4) accepting `avatarUrl`, `dateOfBirth`, `latitude`, `longitude`.
- Produces: `AdminNannyDetail.latitude` / `.longitude`.

- [ ] **Step 1: Write the failing tests**

In `apps/backend/src/__tests__/admin-nanny-update.test.ts` add `latitude: null, longitude: null,` to `makeRow().user` (after `address`), and add inside `describe('updateAdminNanny', …)`:

```ts
  it('passes photo, date of birth and home pin straight through to the writer', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeRow());

    await updateAdminNanny(NANNY_PROFILE_ID, {
      avatarUrl: 'https://cdn.example/nanny.jpg',
      dateOfBirth: '1995-06-15',
      latitude: 30.0444,
      longitude: 31.2357,
    });

    expect(mockWrite).toHaveBeenCalledWith(expect.anything(), {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: {
        avatarUrl: 'https://cdn.example/nanny.jpg',
        dateOfBirth: '1995-06-15',
        latitude: 30.0444,
        longitude: 31.2357,
      },
    });
  });

  it('exposes the home pin on the detail DTO as numbers', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(
      makeRow({ user: { ...makeRow().user, latitude: '30.0444000', longitude: '31.2357000' } }),
    );

    const result = await updateAdminNanny(NANNY_PROFILE_ID, { bio: 'x' });

    expect(result.latitude).toBe(30.0444);
    expect(result.longitude).toBe(31.2357);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-nanny-update`
Expected: the second new test FAILS (`latitude` undefined); typecheck of the file may also fail on `UpdateAdminNanny` — that is Task 1's schema already, so only the DTO is missing.

- [ ] **Step 3: Select and expose the pin**

In `admin-nanny.service.ts` `nannyInclude.user.select` add after `address: true,`:

```ts
      latitude: true,
      longitude: true,
```

In `toDetailDto` add after `schedule`:

```ts
    latitude: row.user.latitude !== null ? Number(row.user.latitude) : null,
    longitude: row.user.longitude !== null ? Number(row.user.longitude) : null,
```

Rewrite the `updateAdminNanny` doc comment:

```ts
/**
 * Admin edits a nanny's profile (PATCH /admin/nannies/:id) — every field she
 * entered at registration: name, photo, date of birth, home address and pin,
 * bio, experience, age ranges, availability, schedule, certifications. Reuses
 * `writeNannyProfileFields`, the same core writer registration uses, so the
 * two writers of a nanny profile cannot drift.
 */
```

- [ ] **Step 4: Run the tests and the backend typecheck**

Run: `pnpm --filter=@nanny-app/backend test:unit -- admin-nanny-update admin-nanny.service`
Expected: PASS.

Run: `pnpm --filter=@nanny-app/backend typecheck`
Expected: exit 0 (the backend is now fully consistent with `@nanny-app/shared`).

- [ ] **Step 5: Run the whole backend unit project**

Run: `pnpm --filter=@nanny-app/backend test:unit`
Expected: PASS. If `admin-mother.service.test.ts`, `auth-service-id.test.ts`, `booking-mother-id-gate.test.ts` or `booking-create-children.test.ts` fail, it is a fixture key the sed in Task 3 missed — fix the key to the new name, never the service.

- [ ] **Step 6: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): an admin can set a nanny's photo, date of birth and home pin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin console — the rename and one status helper

**Files:**
- Rename: `apps/admin/src/lib/id-status.ts` → `apps/admin/src/lib/approval-status.ts`
- Modify: `apps/admin/src/lib/api.ts:13-23, 465, 506, 545-553`
- Modify: `apps/admin/src/features/nannies/nanny-review-tab.tsx`, `apps/admin/src/pages/nanny-detail-page.tsx`, `apps/admin/src/features/users/mothers-tab.tsx`, `apps/admin/src/pages/mother-detail-page.tsx`, `apps/admin/src/features/id-reviews/id-review-card.tsx`, `apps/admin/src/features/dashboard/use-dashboard-stats.ts`
- Test: `apps/admin/src/pages/__tests__/dashboard-page.test.tsx`

**Interfaces:**
- Produces: `approvalStatusTone(status: ApprovalStatus | null)`, `approvalStatusLabel(status: string)` from `@admin/lib/approval-status`; `fetchIdReviews(status: AdminApprovalStatusFilter, { page, limit, sort })`.

- [ ] **Step 1: Rename the helper**

```bash
git mv apps/admin/src/lib/id-status.ts apps/admin/src/lib/approval-status.ts
```

Replace its content with:

```ts
import type { ApprovalStatus } from '@nanny-app/shared';

/**
 * Badge tone for an approval status. `PENDING_REVIEW` gets the gold `warning`
 * tone so the "needs a decision" state stands out in a queue; `PENDING_ID`
 * (nothing uploaded yet) stays neutral.
 */
export function approvalStatusTone(
  status: ApprovalStatus | null,
): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'PENDING_REVIEW') return 'warning';
  return 'neutral';
}

/** Human-readable label for an approval status, e.g. `PENDING_REVIEW` → "pending review". */
export function approvalStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}
```

- [ ] **Step 2: Run the rename across the admin source**

```bash
cd apps/admin
FILES=$(git grep -l "idVerificationStatus\|IdVerificationStatus\|AdminNannyStatusFilter\|AdminMotherStatusFilter\|AdminIdReviewStatusFilter\|id-status\|idStatusTone\|idStatusLabel" -- src e2e)
sed -i \
  -e 's/idVerificationStatus/approvalStatus/g' \
  -e 's/IdVerificationStatus/ApprovalStatus/g' \
  -e 's/AdminNannyStatusFilter/AdminApprovalStatusFilter/g' \
  -e 's/AdminMotherStatusFilter/AdminApprovalStatusFilter/g' \
  -e 's/AdminIdReviewStatusFilter/AdminApprovalStatusFilter/g' \
  -e "s#@admin/lib/id-status#@admin/lib/approval-status#g" \
  -e 's/idStatusTone/approvalStatusTone/g' \
  -e 's/idStatusLabel/approvalStatusLabel/g' \
  $FILES
```

`src/lib/api.ts` now imports `AdminApprovalStatusFilter` three times — collapse to one entry in the import list, and delete `AdminIdReviewRoleFilter,` from it.

- [ ] **Step 3: Use the one helper everywhere**

In each of `nanny-review-tab.tsx`, `nanny-detail-page.tsx`, `mothers-tab.tsx`, `mother-detail-page.tsx`: delete the local `statusTone` and `statusLabel` functions, add `import { approvalStatusLabel, approvalStatusTone } from '@admin/lib/approval-status';` (after the `@admin/lib/api-error` import), and replace every `statusTone(` / `statusLabel(` call with `approvalStatusTone(` / `approvalStatusLabel(`.

In `src/lib/api.ts` replace `fetchIdReviews` and its section comment with:

```ts
// ── Parent ID review queue ─────────────────────────────────────

export async function fetchIdReviews(
  status: AdminApprovalStatusFilter,
  { page, limit, sort }: SortableListQuery,
): Promise<Paged<AdminIdReview[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminIdReview[]>>('/admin/id-reviews', {
    params: { status, page, limit, sort },
  });
  return { data: res.data.data, meta: res.data.meta };
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter=@nanny-app/admin typecheck`
Expected: remaining errors are only in `id-review-tab.tsx` / `id-review-card.tsx` (`role`, `ROLE_FILTERS`, the `fetchIdReviews` arity — Task 8) and `e2e/*` (Task 10). Nothing about `approvalStatus`.

- [ ] **Step 5: Run the existing Vitest suite**

Run: `pnpm --filter=@nanny-app/admin test`
Expected: PASS (`dashboard-page.test.tsx` was renamed by the sed).

- [ ] **Step 6: Commit**

```bash
git add apps/admin
git commit -m "refactor(admin): approvalStatus everywhere, one badge helper for it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Admin console — the nanny decision lives on her page; the gallery is for parents

**Files:**
- Modify: `apps/admin/src/pages/nanny-detail-page.tsx:89-133, 231-244`
- Modify: `apps/admin/src/features/nannies/nanny-review-tab.tsx:154-157`
- Modify: `apps/admin/src/features/id-reviews/id-review-tab.tsx`, `id-review-card.tsx`
- Modify: `apps/admin/src/pages/users-page.tsx:23`
- Test: `apps/admin/src/features/id-reviews/__tests__/id-review-card.test.tsx` (new)

**Interfaces:**
- Consumes: `AdminIdReview` (Task 1), `fetchIdReviews(status, query)` (Task 7), `approveMother` / `rejectMother` from `@admin/lib/api`.

- [ ] **Step 1: Write the failing card test**

Create `apps/admin/src/features/id-reviews/__tests__/id-review-card.test.tsx`:

```tsx
/**
 * The gallery decides a *parent's* ID. What is worth pinning is that the
 * card's decision goes to the mother endpoint — there is no role branch left
 * to pick the wrong one — and that the pair of buttons only shows while a
 * decision is still open.
 */
import type { AdminIdReview, AdminUser } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { IdReviewCard } from '@admin/features/id-reviews/id-review-card';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const REVIEW: AdminIdReview = {
  id: 7,
  name: 'Nour Ibrahim',
  avatarUrl: null,
  location: 'Cairo',
  idDocumentType: 'PASSPORT',
  idDocumentFrontUrl: 'https://example.com/front.jpg',
  idDocumentBackUrl: null,
  approvalStatus: 'PENDING_REVIEW',
  rejectionReason: null,
  reviewedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

function renderCard(review: AdminIdReview) {
  return renderWithProviders(
    <PermissionsProvider>
      <ToastProvider>
        <IdReviewCard review={review} />
      </ToastProvider>
    </PermissionsProvider>,
  );
}

describe('IdReviewCard', () => {
  it('approves through the mother endpoint', async () => {
    let approvedId: string | null = null;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.post('/api/admin/mothers/:id/approve', ({ params }) => {
        approvedId = String(params['id']);
        return ok({ ...REVIEW, approvalStatus: 'APPROVED' });
      }),
    );
    renderCard(REVIEW);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve ID' }));

    await waitFor(() => expect(approvedId).toBe('7'));
    expect(await screen.findByText('ID approved')).toBeInTheDocument();
  });

  it('offers no decision on an already-approved ID', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)));
    renderCard({ ...REVIEW, approvalStatus: 'APPROVED', reviewedAt: '2026-07-02T00:00:00.000Z' });

    expect(await screen.findByText('approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter=@nanny-app/admin test -- id-review-card`
Expected: FAIL — TS/runtime complains that `REVIEW` lacks `role`/`userId` and the card reads `review.role`.

- [ ] **Step 3: Make the card parents-only**

In `id-review-card.tsx`:
- Change the `@admin/lib/api` import to `import { approveMother, rejectMother } from '@admin/lib/api';`.
- Delete the `ROLE_LABEL` const.
- Replace the doc comment with:

```ts
/**
 * One parent's ID in the gallery: the person, their ID photo(s), and the
 * current approval status — with Approve/Reject inline while the ID is
 * awaiting review. A parent's approval is exactly this ID check, so the
 * decision is made here; nannies are decided on their detail page.
 */
```

- Replace `invalidate` with:

```ts
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-id-reviews'] });
    // Keep the Mommies tab in sync too, so a decision here shows up there.
    void queryClient.invalidateQueries({ queryKey: ['admin-mothers'] });
  };
```

- `approveMutation.mutationFn` becomes `() => approveMother(id)`; `rejectMutation.mutationFn` becomes `(reason?: string) => rejectMother(id, reason)`.
- `canReview` reads `review.approvalStatus === 'PENDING_REVIEW'` (the sed already did this).
- The sub line `{ROLE_LABEL[review.role]} · {idTypeLabel}` becomes `{idTypeLabel}`.
- The badge block reads `review.approvalStatus && (<Badge tone={approvalStatusTone(review.approvalStatus)}>{approvalStatusLabel(review.approvalStatus)}</Badge>)` (already renamed by the sed).

In `id-review-tab.tsx`:
- Drop `AdminIdReviewRoleFilter` from the import, delete `ROLE_FILTERS`, the `role` state, the Role `<FilterSelect>`, and pass `fetchIdReviews(status, { page, limit, sort })` with query key `['admin-id-reviews', status, sort, page, limit]`.
- `key={\`${review.role}-${review.id}\`}` → `key={review.id}`.
- Replace the doc comment's first paragraph with: `Parent ID-review gallery: every ID a parent has uploaded as a card, filterable by status, with Approve/Reject on each pending card so an admin can clear the queue without opening each parent's detail page. Nannies are not here — their ID is reviewed on the Nannies tab as part of approving the application.` (keep the "Opens oldest-first" paragraph).
- Lead copy `<p className="panel-lead">` becomes: `Every ID a parent has uploaded, in one place. Scan the photos, then approve or reject without leaving the page. Nannies are reviewed from the Nannies tab, where their profile and ID are decided together.`

- [ ] **Step 4: Nanny wording on the detail page and the tab**

In `nanny-detail-page.tsx`:
- `toast.success('Nanny approved', updated.name)` stays; `onError` copy `Couldn’t approve nanny` stays.
- Reject `onSuccess` toast → `toast.success('Application rejected', nanny?.name)`; `onError` → `'Couldn’t reject application'`.
- Approve button text `Approve` → `Approve nanny`; Reject button text `Reject` → `Reject application`.
- `PromptDialog` `title="Reject application"` stays; `confirmLabel="Reject application"`.
- The reject button condition `nanny.approvalStatus === 'PENDING_REVIEW'` stays.

In `nanny-review-tab.tsx` the `panel-lead` becomes: `New nanny registrations wait here until reviewed. Open a nanny to check her profile and ID together, edit anything that needs correcting, then approve or reject the application.`

In `users-page.tsx` the `PageHeader` subtitle becomes: `Everyone on the platform — browse parents, verify their IDs, and review new nanny applications.`

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter=@nanny-app/admin test -- id-review-card && pnpm --filter=@nanny-app/admin typecheck`
Expected: PASS; typecheck errors only under `e2e/` (Task 10).

Run: `git grep -n "ROLE_LABEL\|AdminIdReviewRoleFilter\|review\.role\|Approve ID\|Reject ID" -- apps/admin/src`
Expected: hits only in `id-review-card.tsx` for the mother dialog labels (`confirmLabel="Approve ID"` / `"Reject ID"`) and `mother-detail-page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): a nanny is approved on her page; the ID gallery is for parents

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Admin console — the editor can change photo, date of birth and home pin

**Files:**
- Modify: `apps/admin/src/features/nannies/nanny-profile-editor.tsx`
- Modify: `apps/admin/src/pages/nanny-detail-page.tsx:251-297` (`profileItems`)
- Test: `apps/admin/src/features/nannies/__tests__/nanny-profile-editor.test.tsx` (new)

**Interfaces:**
- Consumes: `UpdateAdminNanny` with `avatarUrl` / `dateOfBirth` / `latitude` / `longitude` (Task 1); `AdminNannyDetail.latitude` / `.longitude` (Task 1/6); `uploadImageToFirebase(file, folder)` from `@admin/lib/storage`.

- [ ] **Step 1: Write the failing editor test**

Create `apps/admin/src/features/nannies/__tests__/nanny-profile-editor.test.tsx`:

```tsx
/**
 * The admin is the only editor of a nanny's profile, so the form has to be
 * able to reach every field. Pinned here: the three fields the nanny cannot
 * touch from the app — photo, date of birth, home pin — are sent, and a pin
 * cannot half-move.
 */
import type { AdminNannyDetail, UpdateAdminNanny } from '@nanny-app/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { NannyProfileEditor } from '@admin/features/nannies/nanny-profile-editor';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

vi.mock('@admin/lib/storage', () => ({
  uploadImageToFirebase: vi.fn().mockResolvedValue('https://cdn.example/uploaded.jpg'),
}));

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const NANNY: AdminNannyDetail = {
  id: 19,
  userId: 10,
  name: 'Amira Hassan',
  firstName: 'Amira',
  lastName: 'Hassan',
  email: 'amira@example.com',
  phone: '+201000000000',
  dateOfBirth: '1995-06-15',
  avatarUrl: null,
  bio: 'Loves kids',
  location: 'Cairo',
  latitude: 30.0444,
  longitude: 31.2357,
  yearsOfExperience: 4,
  certifications: [],
  skills: [],
  isEmailVerified: true,
  isPhoneVerified: false,
  approvalStatus: 'APPROVED',
  idDocumentType: null,
  rejectionReason: null,
  reviewedAt: null,
  idDocumentFrontUrl: null,
  idDocumentBackUrl: null,
  ageRanges: [],
  availabilityType: 'FULL_TIME',
  schedule: null,
  amountGained: 0,
  completedBookings: 0,
  createdAt: '2026-07-01T00:00:00.000Z',
};

function renderEditor() {
  return renderWithProviders(
    <ToastProvider>
      <NannyProfileEditor nanny={NANNY} certifications={[]} onDone={() => {}} />
    </ToastProvider>,
  );
}

describe('NannyProfileEditor', () => {
  it('sends photo, date of birth and home pin', async () => {
    let body: UpdateAdminNanny | null = null;
    server.use(
      http.patch('/api/admin/nannies/:id', async ({ request }) => {
        body = (await request.json()) as UpdateAdminNanny;
        return ok(NANNY);
      }),
    );
    renderEditor();

    const file = new File(['x'], 'nanny.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Photo'), file);
    await screen.findByAltText('Amira Hassan');

    // jsdom's date/number inputs don't take keystrokes the way a person types
    // them; setting the value directly is what the browser would end up with.
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1996-01-20' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '30.05' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '31.24' } });

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      avatarUrl: 'https://cdn.example/uploaded.jpg',
      dateOfBirth: '1996-01-20',
      latitude: 30.05,
      longitude: 31.24,
    });
  });

  it('refuses a latitude without a longitude', async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(
      await screen.findByText('Latitude and longitude must be updated together.'),
    ).toBeInTheDocument();
  });

  it('clears the photo with null', async () => {
    let body: UpdateAdminNanny | null = null;
    server.use(
      http.patch('/api/admin/nannies/:id', async ({ request }) => {
        body = (await request.json()) as UpdateAdminNanny;
        return ok(NANNY);
      }),
    );
    renderWithProviders(
      <ToastProvider>
        <NannyProfileEditor
          nanny={{ ...NANNY, avatarUrl: 'https://cdn.example/old.jpg' }}
          certifications={[]}
          onDone={() => {}}
        />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ avatarUrl: null });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter=@nanny-app/admin test -- nanny-profile-editor`
Expected: FAIL — no `Photo` / `Date of birth` / `Latitude` fields.

- [ ] **Step 3: Extend the editor**

In `nanny-profile-editor.tsx`:

Add imports: `import { useState, type ChangeEvent } from 'react';` (replacing the plain `useState` import) and `import { uploadImageToFirebase } from '@admin/lib/storage';` after the `@admin/lib/api-error` import.

Add state after `lastName`:

```ts
  const [avatarUrl, setAvatarUrl] = useState<string | null>(nanny.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(nanny.dateOfBirth ?? '');
  const [latitude, setLatitude] = useState(
    nanny.latitude !== null ? String(nanny.latitude) : '',
  );
  const [longitude, setLongitude] = useState(
    nanny.longitude !== null ? String(nanny.longitude) : '',
  );
```

Add a handler after `setDayTime`:

```ts
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      setAvatarUrl(await uploadImageToFirebase(file, 'avatars'));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }
```

Replace `buildPayload` with:

```ts
  function buildPayload(): UpdateAdminNanny {
    const years = yearsOfExperience.trim();
    const dob = dateOfBirth.trim();
    const lat = latitude.trim();
    const lng = longitude.trim();
    return {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      avatarUrl,
      // Optional-not-nullable server-side: an empty field leaves the current value untouched.
      ...(dob !== '' ? { dateOfBirth: dob } : {}),
      location: location.trim(),
      ...(lat !== '' ? { latitude: Number(lat) } : {}),
      ...(lng !== '' ? { longitude: Number(lng) } : {}),
      bio: bio.trim(),
      ...(years !== '' ? { yearsOfExperience: Number(years) } : {}),
      ageRanges: [...ageRanges],
      availabilityType,
      schedule,
      certificationIds: [...certificationIds],
    };
  }
```

In the JSX, inside the first `form-grid` after the Last name field add:

```tsx
        <Field label="Photo" hint="Shown to parents on her profile.">
          <input type="file" accept="image/*" onChange={(e) => void handlePhoto(e)} disabled={uploading} />
        </Field>
        <Field label="Date of birth">
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </Field>
```

and directly after the `form-grid` div (before `<Field label="Bio">`):

```tsx
      {avatarUrl && (
        <div className="row-actions">
          <img className="id-review-avatar" src={avatarUrl} alt={nanny.name} />
          <Button size="sm" variant="ghost" onClick={() => setAvatarUrl(null)}>
            Remove photo
          </Button>
        </div>
      )}
      <div className="form-grid">
        <Field label="Latitude" hint="Home pin — keep it in step with the address so distance search stays right.">
          <input type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
        </Field>
        <Field label="Longitude">
          <input type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
        </Field>
      </div>
```

Disable Save while uploading: `disabled={saveMutation.isPending || uploading}`.

- [ ] **Step 4: Show the photo and pin in the read view**

In `nanny-detail-page.tsx` `profileItems`, add after the `Location` item:

```ts
    {
      label: 'Home pin',
      value:
        nanny.latitude !== null && nanny.longitude !== null
          ? `${nanny.latitude}, ${nanny.longitude}`
          : DASH,
    },
```

and as the first item (before `Status`):

```ts
    {
      label: 'Photo',
      value: nanny.avatarUrl ? (
        <img className="id-review-avatar" src={nanny.avatarUrl} alt="" />
      ) : (
        DASH
      ),
    },
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter=@nanny-app/admin test && pnpm --filter=@nanny-app/admin typecheck`
Expected: Vitest PASS; typecheck errors only under `e2e/`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): the nanny editor reaches her photo, date of birth and home pin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Admin E2E — B5 decides a nanny on her page and never finds her in the gallery

**Files:**
- Modify: `apps/admin/e2e/helpers/backend.ts:500-515` (`KycSubject`, `getMotherKyc`; add `getNannyApproval`)
- Modify: `apps/admin/e2e/b05-users-and-id-review.spec.ts`

**Interfaces:**
- Produces: `getNannyApproval(adminToken, nannyProfileId)` → `{ approvalStatus, rejectionReason }`.

- [ ] **Step 1: Helpers**

In `e2e/helpers/backend.ts` the sed in Task 7 already renamed `KycSubject.approvalStatus`. Rename the type to `ApprovalSubject` (all uses) and add after `getMotherKyc`:

```ts
/** A nanny's approval state, straight from the API — keyed by NannyProfile id. */
export async function getNannyApproval(
  adminToken: string,
  nannyProfileId: number,
): Promise<ApprovalSubject> {
  return (await call('GET', `/admin/nannies/${nannyProfileId}`, adminToken)) as ApprovalSubject;
}
```

`seedPendingNanny` returns the **user** id, but the nanny endpoints are keyed by NannyProfile id. The spec gets that id from the page: clicking her row navigates to `/users/nannies/<nannyProfileId>`, so `Number(page.url().split('/').pop())` after the click is the id to pass to `getNannyApproval`.

- [ ] **Step 2: Rewrite the two nanny cases and the header comment**

Replace the file header comment's first paragraph with:

```ts
/**
 * B5 — the Users console: the parent ID-review queue and the nanny decision.
 *
 * A parent cannot book until someone here has looked at a photograph of her ID
 * and said yes; a nanny cannot be offered work until someone has opened her
 * application — profile and ID together — and approved it. What these specs
 * protect is narrow: that the queue *shows* the parent waiting, that a decision
 * made in the gallery lands on the account, that the queue then stops offering
 * her, and that a nanny is decided on her own page and nowhere else.
 *
 * What the decision goes on to *unlock* — booking for a parent, entering the
 * broadcast pool for a nanny — belongs to A10 and A11 and is asserted over HTTP
 * there. Repeating it through a browser would only make it slower to run.
 */
```

Update the import to `getMotherKyc, getNannyApproval, seedMother, seedPendingNanny, superuserToken`.

Replace `test('the role filter separates parents from nannies in one queue', …)` with:

```ts
test('the gallery is for parents — a waiting nanny is not offered there', async ({ page }) => {
  const mother = await seedMother();
  const nanny = await seedPendingNanny();

  await openIdQueue(page);

  await expect(cardFor(page, mother.surname)).toBeVisible();
  await expect(cardFor(page, nanny.surname)).toHaveCount(0);
  // There is no role control to switch to nannies with.
  await expect(page.locator('.filter-select', { hasText: 'Role' })).toHaveCount(0);
});
```

Replace `test('the Nannies tab lists an unvetted registration', …)` with:

```ts
test('a nanny is approved from her own page, and the Nannies queue lets her go', async ({ page }) => {
  const admin = await superuserToken();
  const nanny = await seedPendingNanny();

  await openTab(page, 'Nannies');
  await chooseOption(page, 'Status', 'Pending review');
  await rowFor(page, nanny.surname).click();

  // Her ID is part of what is being decided, so it is reachable from here.
  await expect(page.getByRole('button', { name: 'View ID' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve nanny' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Nanny approved' })).toBeVisible();

  const nannyProfileId = Number(page.url().split('/').pop());
  expect((await getNannyApproval(admin, nannyProfileId)).approvalStatus).toBe('APPROVED');

  await openTab(page, 'Nannies');
  await chooseOption(page, 'Status', 'Pending review');
  await expect(rowFor(page, nanny.surname)).toHaveCount(0);
  await chooseOption(page, 'Status', 'Approved');
  await expect(rowFor(page, nanny.surname)).toBeVisible();
});

test('rejecting a nanny records the reason she will be shown', async ({ page }) => {
  const admin = await superuserToken();
  const nanny = await seedPendingNanny();

  await openTab(page, 'Nannies');
  await chooseOption(page, 'Status', 'Pending review');
  await rowFor(page, nanny.surname).click();

  await page.getByRole('button', { name: 'Reject application' }).click();
  await page.getByLabel(/^Reason/).fill('Certificate could not be verified.');
  await page.getByRole('button', { name: 'Reject application' }).last().click();
  await expect(page.getByRole('status').filter({ hasText: 'Application rejected' })).toBeVisible();

  const nannyProfileId = Number(page.url().split('/').pop());
  const approval = await getNannyApproval(admin, nannyProfileId);
  expect(approval.approvalStatus).toBe('REJECTED');
  expect(approval.rejectionReason).toBe('Certificate could not be verified.');
});
```

Every remaining `.approvalStatus` read on `getMotherKyc(...)` results was renamed by Task 7's sed.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter=@nanny-app/admin typecheck`
Expected: exit 0 (both `tsconfig.app.json` and `tsconfig.e2e.json`).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/e2e
git commit -m "test(admin): B5 decides a nanny on her page and never finds her in the gallery

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Mobile — no banner, `approvalStatus` everywhere

**Files:**
- Delete: `apps/mobile/src/components/ProfileVisibilityBanner.tsx`
- Modify: `apps/mobile/src/screens/nanny/NannyDashboardScreen.tsx:21, 70`, `apps/mobile/src/screens/nanny/NannyProfileEditScreen.tsx:17, 152`
- Modify: `apps/mobile/app/index.tsx`, `apps/mobile/src/hooks/useIdGate.ts`, `apps/mobile/src/screens/auth/PendingReviewScreen.tsx`, `apps/mobile/src/screens/auth/UploadIdScreen.tsx`, `apps/mobile/src/screens/parent/MotherProfileWalletScreen.tsx`
- Modify: `apps/mobile/src/screens/parent/__tests__/AccountScreen.test.tsx`, `apps/mobile/e2e/accounts.mjs`, `apps/mobile/e2e/scripts/advance.js`

**Interfaces:**
- Consumes: `ApprovalStatus` from `@shared/auth`; `UserResponse.approvalStatus` / `.rejectionReason`.

- [ ] **Step 1: Delete the banner and its usages**

```bash
git rm apps/mobile/src/components/ProfileVisibilityBanner.tsx
```

In `NannyDashboardScreen.tsx` delete the import line `import ProfileVisibilityBanner from '@mobile/components/ProfileVisibilityBanner';` and the JSX line `<ProfileVisibilityBanner note="Your profile is managed by NannyNow. Contact support to update it." />`. Same two deletions in `NannyProfileEditScreen.tsx`.

- [ ] **Step 2: Run the rename across the mobile app**

```bash
cd apps/mobile
FILES=$(git grep -l "idVerificationStatus\|IdVerificationStatus\|idRejectionReason" -- app src e2e)
sed -i \
  -e 's/idVerificationStatus/approvalStatus/g' \
  -e 's/IdVerificationStatus/ApprovalStatus/g' \
  -e 's/idRejectionReason/rejectionReason/g' \
  $FILES
```

Then fix the imports the sed left pointing at the wrong module:
- `app/index.tsx`: replace `import { Role } from '@shared/auth';` + `import { ApprovalStatus } from '@shared/nanny';` with `import { ApprovalStatus, Role } from '@shared/auth';`.
- `src/hooks/useIdGate.ts`, `src/screens/auth/PendingReviewScreen.tsx`: `import { ApprovalStatus } from '@shared/nanny';` → `import { ApprovalStatus } from '@shared/auth';`.
- `src/screens/auth/UploadIdScreen.tsx`: `import { IdDocumentType, ApprovalStatus } from '@shared/nanny';` → `import { ApprovalStatus } from '@shared/auth';` + `import { IdDocumentType } from '@shared/nanny';`.

- [ ] **Step 3: Comments that say what is true**

`app/index.tsx`: replace the three-line comment above the `switch` with:

```ts
      // Nannies are approved by an admin before they can use the app. If their
      // ID is missing (PENDING_ID) or the application was rejected (REJECTED),
      // force a re-upload; once uploaded (PENDING_REVIEW) they wait; APPROVED
      // lets them in.
```

`e2e/accounts.mjs` `pendingNanny`: delete the line `approvalStatus: 'PENDING_REVIEW',` that the sed duplicated (the object now has the key twice — keep one), and reword its comment to `` `approvalStatus` is what the root router gates a nanny on — PENDING_REVIEW holds her on the waiting screen, APPROVED lets her in. ``.

- [ ] **Step 4: Typecheck and test**

Run: `pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test -- AccountScreen`
Expected: exit 0; PASS.

Run: `git grep -n "ProfileVisibilityBanner\|isProfileComplete\|idVerificationStatus\|IdVerificationStatus\|idRejectionReason" -- apps/mobile`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): drop the completeness banner; a nanny's status is her approval

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Registration — a nanny must give every profile field

**Files:**
- Modify: `packages/shared/src/auth.ts:140-148` (`RegisterRequestSchema` refines)
- Test: `packages/shared/src/__tests__/register-nanny-required.test.ts` (new)
- Modify: `apps/mobile/src/screens/auth/RegistrationNannyLocationScreen.tsx:46-54`
- Modify: `apps/mobile/src/screens/auth/RegistrationNannyDetailsScreen.tsx:171-193, 293-295`
- Modify: `apps/mobile/e2e/flows/a10-nanny-onboarding.yaml:94-128`
- Modify: `apps/backend/src/__integration__/journeys/a10-nanny-onboarding.test.ts:49-57`
- Modify: `apps/admin/e2e/helpers/backend.ts:264-273, 294-303`

**Interfaces:**
- Produces: `RegisterRequestSchema` refuses a nanny body whose `address` is empty, whose `ageRanges` is empty, or whose `schedule` has no `available: true` day — with the messages in the test below.

- [ ] **Step 1: Write the failing schema test**

Create `packages/shared/src/__tests__/register-nanny-required.test.ts`:

```ts
/**
 * Registration is the only time a nanny enters her profile, so the wizard
 * must not let her finish with a hole an admin would have to fill. These pin
 * the server-side half of that rule; the app enforces the same three on its
 * own screens.
 */
import { describe, expect, it } from 'vitest';

import { RegisterRequestSchema } from '../auth';

const NANNY = {
  firstName: 'Amira',
  lastName: 'Hassan',
  email: 'amira@example.com',
  emailVerificationToken: 'tok',
  phone: '+201000000000',
  dateOfBirth: '1995-06-15',
  role: 'NANNY',
  termsAcceptedVersion: '1.0',
  address: '2 Test Street, Cairo',
  latitude: 30.0444,
  longitude: 31.2357,
  idDocumentType: 'PASSPORT',
  idDocumentFrontUrl: 'https://s/o/front.jpg',
  avatarUrl: 'https://s/o/avatar.jpg',
  bio: 'Loves kids',
  yearsOfExperience: 5,
  ageRanges: ['0-1'],
  availabilityType: 'FULL_TIME',
  schedule: { '1': { available: true, startTime: '08:00', endTime: '18:00' } },
};

function firstMessage(body: Record<string, unknown>): string | null {
  const parsed = RegisterRequestSchema.safeParse(body);
  return parsed.success ? null : parsed.error.issues[0]?.message ?? 'unknown';
}

describe('RegisterRequestSchema — what a nanny must provide', () => {
  it('accepts a complete nanny', () => {
    expect(firstMessage(NANNY)).toBeNull();
  });

  it('needs a street address', () => {
    expect(firstMessage({ ...NANNY, address: '' })).toBe('Please enter your street address.');
    expect(firstMessage({ ...NANNY, address: undefined })).toBe('Please enter your street address.');
  });

  it('needs at least one age range', () => {
    expect(firstMessage({ ...NANNY, ageRanges: [] })).toBe(
      'Please pick at least one age range you care for.',
    );
  });

  it('needs at least one working day', () => {
    expect(firstMessage({ ...NANNY, schedule: undefined })).toBe(
      'Please mark at least one day you can work.',
    );
    expect(
      firstMessage({
        ...NANNY,
        schedule: { '1': { available: false, startTime: '08:00', endTime: '18:00' } },
      }),
    ).toBe('Please mark at least one day you can work.');
  });

  it('asks none of this of a mother', () => {
    const { idDocumentType, idDocumentFrontUrl, avatarUrl, bio, yearsOfExperience, ageRanges, availabilityType, schedule, address, ...mother } = NANNY;
    expect(firstMessage({ ...mother, role: 'MOTHER' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter=@nanny-app/shared test -- register-nanny-required`
Expected: FAIL — the three "needs …" tests get `null` (the body is accepted).

- [ ] **Step 3: Add the refines**

In `packages/shared/src/auth.ts`, directly after the existing second `.refine(` (the one whose message is `'Nannies must provide a photo, bio, years of experience, and availability.'`) and before `;`, add:

```ts
  .refine((v) => v.role !== 'NANNY' || !!v.address, {
    message: 'Please enter your street address.',
    path: ['address'],
  })
  .refine((v) => v.role !== 'NANNY' || (v.ageRanges?.length ?? 0) > 0, {
    message: 'Please pick at least one age range you care for.',
    path: ['ageRanges'],
  })
  .refine(
    (v) =>
      v.role !== 'NANNY' ||
      Object.values(v.schedule ?? {}).some((day) => day.available),
    {
      message: 'Please mark at least one day you can work.',
      path: ['schedule'],
    },
  )
```

Update the comment above the nanny profile fields (line ~118) to: `// Nanny profile fields captured at registration. Mothers omit these; the refines below make everything but certifications and skills mandatory for nannies — registration is the only time she enters her profile.`

- [ ] **Step 4: Run the shared tests**

Run: `pnpm --filter=@nanny-app/shared test`
Expected: PASS.

- [ ] **Step 5: Enforce the same three on the wizard screens**

`RegistrationNannyLocationScreen.tsx` — replace `handleContinue` with:

```ts
  function handleContinue() {
    if (draft.latitude === null || draft.longitude === null) {
      setLocationError('Please set your home location on the map.');
      return;
    }
    if (!draft.address.trim()) {
      setLocationError('Please enter your street address.');
      return;
    }
    setLocationError(null);
    // Nannies upload their ID next; that screen continues to the final step.
    router.push({ pathname: '/(auth)/register-nanny-id', params: { role } });
  }
```

`RegistrationNannyDetailsScreen.tsx` — replace the validation block (from `const yearsTrimmed` through the end of `handleContinue`) with:

```ts
  const yearsTrimmed = draft.yearsOfExperience.trim();
  const yearsNum = Number(yearsTrimmed);
  const isYearsValid = yearsTrimmed !== '' && Number.isFinite(yearsNum) && yearsNum >= 0;
  const hasWorkingDay = DAY_ORDER.some((d) => schedule[d]?.available);
  const canContinue =
    draft.bio.trim().length > 0 &&
    isYearsValid &&
    draft.availabilityType !== null &&
    draft.ageRanges.length > 0 &&
    hasWorkingDay;

  function handleContinue() {
    if (!draft.bio.trim()) {
      setFormError('Please tell parents a bit about yourself.');
      return;
    }
    if (!isYearsValid) {
      setFormError('Please enter a valid number of years of experience.');
      return;
    }
    if (!draft.availabilityType) {
      setFormError('Please select your availability.');
      return;
    }
    if (draft.ageRanges.length === 0) {
      setFormError('Please pick at least one age range you care for.');
      return;
    }
    if (!hasWorkingDay) {
      setFormError('Please mark at least one day you can work.');
      return;
    }
    setFormError(null);
    router.push({ pathname: '/(auth)/register-step-3', params: { role } });
  }
```

Change the JSX comment `{/* Age ranges (optional) */}` to `{/* Age ranges */}` and the label text `Age ranges you care for (optional)` to `Age ranges you care for`.

- [ ] **Step 6: Bring the three registration drivers along**

`apps/mobile/e2e/flows/a10-nanny-onboarding.yaml` — in Step 4 replace the two lines after the map comment with:

```yaml
# The lab has no Maps key, so the pin's reverse-geocode never fills the
# address — she types it, as the wizard now requires.
- tapOn: 'Street address'
- inputText: '2 Test Street, Cairo'
- hideKeyboard
# The map is centred on the device's Cairo geo fix; tapping it sets the pin.
- tapOn:
    point: '50%,44%'
- tapOn: 'Continue'
```

and in Step 6, after `- tapOn: 'Full-time'`, add `- tapOn: '1-3'` (an age range is now required; the working hours default to Mon–Fri).

`apps/backend/src/__integration__/journeys/a10-nanny-onboarding.test.ts` — in the register body after `ageRanges: ['0-1', '2-5'],` add:

```ts
      schedule: { '1': { available: true, startTime: '08:00', endTime: '18:00' } },
```

`apps/admin/e2e/helpers/backend.ts` — in both `seedPendingNanny` and `seedApprovedNanny`, after `ageRanges: ['0-1', '2-5'],` add the same `schedule:` line.

- [ ] **Step 7: Typecheck the mobile app and run the mobile unit tests**

Run: `pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test`
Expected: exit 0; PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared apps/mobile apps/backend/src/__integration__/journeys/a10-nanny-onboarding.test.ts apps/admin/e2e/helpers/backend.ts
git commit -m "feat(registration): a nanny must give her address, an age range and a working day

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Docs — the two living documents that name the field

**Files:**
- Modify: `Docs/testing/e2e-flows.md:181, 270-271`
- Modify: `.claude/skills/mobile-e2e-lab/references/authoring-flows.md:75`

- [ ] **Step 1: Edit**

`Docs/testing/e2e-flows.md` line 181: `` `idVerificationStatus` is `PENDING_ID` or `REJECTED` `` → `` `approvalStatus` is `PENDING_ID` or `REJECTED` ``. Lines 270–271 become:

```md
### B5. Users console, parent ID review and the nanny decision · `UI:admin` — **covered** by `b05-users-and-id-review.spec.ts`
The parent ID-review gallery (parents only), approve/reject there, the pending queue draining as
items are actioned; a nanny approved and rejected from her own detail page, where her profile and
ID are decided together, and the Nannies queue following her status.
```

`.claude/skills/mobile-e2e-lab/references/authoring-flows.md` line 75: `` - Sets `idVerificationStatus`/`approvalStatus` from the spec, so gate flows (A10/A11) get an account `` → `` - Sets `approvalStatus` from the spec, so gate flows (A10/A11) get an account ``.

- [ ] **Step 2: The final sweep**

Run from the repo root:

```bash
git grep -n "idVerificationStatus\|IdVerificationStatus\|id_verification_status\|idReviewedAt\|idRejectionReason\|isProfileComplete\|is_profile_complete\|getMissingNannyProfileFields\|NannyApprovalStatus\|nanny_approval_status\|ProfileVisibilityBanner\|AdminIdReviewRoleFilter" -- . ':!Docs/superpowers' ':!apps/backend/prisma/migrations'
```

Expected: no output. Anything printed is dead code — remove it before committing.

- [ ] **Step 3: Commit**

```bash
git add Docs/testing/e2e-flows.md .claude/skills/mobile-e2e-lab/references/authoring-flows.md
git commit -m "docs: the field is approvalStatus; B5 covers the nanny decision on her page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Verify against the real stack

**Files:** none (verification only).

- [ ] **Step 1: Whole-repo typecheck and unit tiers**

Run: `pnpm typecheck && pnpm test:unit`
Expected: every package exits 0.

- [ ] **Step 2: Migration + integration journeys**

Start the stack (see memory `test-stack` — Docker Desktop on D: starts cold): `pnpm test:env`. Then:

Run: `pnpm --filter=@nanny-app/backend test:integration`
Expected: PASS — `globalSetup` runs `prisma migrate deploy` (applies the Task 2 migration), a10/a11/a14/a21 read `approvalStatus`.

Run (from `apps/backend`): `DATABASE_URL=postgresql://postgres:postgres@localhost:55432/nannyapp_test npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url postgresql://postgres:postgres@localhost:55432/nannyapp_test`
Expected: `No difference detected.`

- [ ] **Step 3: Admin E2E B5**

With the stack up: `pnpm --filter=@nanny-app/backend start:test` in one terminal, then `pnpm --filter=@nanny-app/admin test:e2e -- b05`.
Expected: all B5 specs PASS on Chromium and WebKit. Note memory `shared-test-stack-collisions` — make sure no other session's backend is on :3001.

- [ ] **Step 4: Mobile A10 (only if the device lab is already up)**

Use the `mobile-e2e-lab` skill; run the A10 flow alone. Expected: PASS — she types an address, picks an age range, registers and lands on the pending-review gate. If the lab is not up, list this as not run.

- [ ] **Step 5: Report**

State exactly which tiers ran and their results. If the stack could not be started, say so and list Steps 2–4 as not run — do not report them as passing.
