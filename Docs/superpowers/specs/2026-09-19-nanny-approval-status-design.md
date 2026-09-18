# Nanny Approval — One Status, One Decision — Design

Date: 2026-09-19
Status: Approved

## Goal

A nanny no longer controls her profile (registration is the only time she enters
it; admins edit everything after). So her visibility to parents must depend on
one thing only: **has an admin approved her**. Today it also depends on a
"profile completeness" rule she cannot act on, and the approval itself is named
and surfaced as if it were only an ID check. This change:

- **Removes the profile-completeness gate** — the mobile "NOT VISIBLE TO
  PARENTS / Complete your profile" banner, the `isProfileComplete` column, the
  shared completeness helpers and every recompute.
- **Renames the status to what it is.** `users.idVerificationStatus` becomes
  `users.approvalStatus`: for a parent, approved once her ID checks out; for a
  nanny, approved once an admin has reviewed her whole application — profile
  *and* ID — in one decision.
- **Folds the nanny's ID review into the nanny approval cycle** in the admin
  console: a nanny is reviewed and decided on her detail page only; the ID
  Review gallery becomes a parents-only KYC queue.
- **Lets an admin change anything on a nanny's profile**, including her photo,
  date of birth and home pin, since she cannot.
- Leaves **no dead code, columns or wording** behind, and brings every existing
  test along.

## Decisions

- **One status column, role-neutral name.** `approvalStatus` with values
  `PENDING_ID | PENDING_REVIEW | APPROVED | REJECTED` on `users`, shared by both
  roles. Rejected alternatives: reviving `nanny_profiles.approval_status` as a
  second nanny-only gate (two columns that must move in lockstep — a drift bug
  waiting to happen); renaming only in DTOs (backend keeps the misleading name).
- **ID-document fields keep their `idDocument*` names** (`idDocumentType`,
  `idDocumentFrontUrl`, `idDocumentBackUrl`) — they are about the ID. Only the
  three fields that describe the *decision* lose the `id` prefix:
  `approvalStatus`, `reviewedAt`, `rejectionReason`.
- **Dead `nanny_profiles` columns are dropped now.** The migration that moved
  KYC onto `users` (`20260717120000_add_user_id_verification`) declared itself
  "Release 1 of a two-release change — the old nanny_profiles.* ID/approval
  columns are dropped in a later migration once no code reads them anymore".
  Nothing reads them; this is Release 2. `is_profile_complete` goes in the
  same migration — no environment is deployed, so the two-release split buys
  nothing there.
- **The nanny decision lives on her detail page.** ID photos stay on that page
  (the existing "View ID" modal) and are part of what the admin reviews before
  clicking Approve. The gallery is for parents, whose approval *is* an ID check.
- **Mother copy keeps saying "ID"** ("Approve ID", "verify your ID") because for
  her that is literally what is reviewed. Nanny copy says "nanny" /
  "application". The *field* is the shared, neutral `approvalStatus`.
- **Admin editing stays inside `writeNannyProfileFields`.** New editable fields
  (photo, date of birth, coordinates) go through the same writer so registration
  and the admin path cannot diverge. Email, phone (Firebase Auth identity) and
  the ID images (the nanny re-uploads after a reject) stay non-editable, as for
  mothers.

## Behaviour model

```
Nanny registration
  … → POST /auth/register  (users.approval_status = PENDING_REVIEW, ID uploaded)
  → mobile: pending-review screen

Admin  Users → Nannies → <nanny>
  reviews profile fields + ID photos ("View ID")
  [Approve nanny]  → approval_status = APPROVED, reviewed_at = now, rejection_reason = null
                   → nanny notified "Your profile is approved!"
  [Reject application] → approval_status = REJECTED, ID images cleared, reason stored
                   → nanny notified, mobile routes her to re-upload her ID
  nanny re-uploads (POST /auth/id) → PENDING_REVIEW again

Visibility (search, booking broadcast, nanny endpoints, cameras)
  = user.approval_status = APPROVED  (and the usual soft-delete guards)
  — nothing else.

Parent
  registers PENDING_ID → uploads before first booking → PENDING_REVIEW
  Admin  Users → ID Review (parents only) or Users → Mommies → <mother>
  [Approve ID] / [Reject ID] — unchanged behaviour, renamed field.
```

## 1. Database — `apps/backend/prisma`

### 1.1 Schema
- `enum IdVerificationStatus` → `enum ApprovalStatus` (`@@map("approval_status")`),
  same four values. `enum NannyApprovalStatus` deleted.
- `User`: `idVerificationStatus` → `approvalStatus ApprovalStatus? @map("approval_status")`;
  `idReviewedAt` → `reviewedAt @map("reviewed_at")`; `idRejectionReason` →
  `rejectionReason @map("rejection_reason")`. Index `@@index([approvalStatus])`.
  Doc comment rewritten: approval state for both roles — a parent is approved
  once her ID is verified; a nanny once an admin has reviewed her application.
- `NannyProfile`: delete `isProfileComplete`, `approvalStatus`, `reviewedAt`,
  `rejectionReason`, `idDocumentFrontUrl`, `idDocumentBackUrl` and the
  `@@index([approvalStatus])`.

### 1.2 Migration `rename_approval_status_and_drop_nanny_profile_kyc`
Hand-written SQL, in this order, with a header comment stating it is Release 2
of the 2026-07-17 move:
1. `ALTER TYPE "id_verification_status" RENAME TO "approval_status";`
2. `ALTER TABLE "users" RENAME COLUMN "id_verification_status" TO "approval_status";`
   likewise `id_reviewed_at → reviewed_at`, `id_rejection_reason → rejection_reason`.
3. `ALTER INDEX "users_id_verification_status_idx" RENAME TO "users_approval_status_idx";`
4. `ALTER TABLE "nanny_profiles" DROP COLUMN` × 6 (the columns in 1.1; Postgres
   drops `nanny_profiles_approval_status_idx` with its column).
5. `DROP TYPE "nanny_approval_status";`

`prisma migrate diff` against the resulting schema must be empty.

## 2. Shared package — `packages/shared/src`

- `nanny.ts`: `IdVerificationStatusSchema` / `IdVerificationStatus` →
  `ApprovalStatusSchema` / `ApprovalStatus`, moved to `auth.ts` beside
  `UserResponseSchema` (it is a `users` column surfaced by `/auth/me`; `admin.ts`
  imports it from there). `NannyApprovalStatusSchema` / `NannyApprovalStatus`
  deleted. The doc comment explains the per-role meaning and the gate predicate
  (needs an upload when `PENDING_ID` or `REJECTED`).
- `nanny.ts`: delete `NANNY_VISIBILITY_REQUIRED_FIELDS`, `NannyVisibilityFieldKey`,
  `NannyVisibilityField`, `NannyProfileCompletenessInput`,
  `getMissingNannyProfileFields`, `isNannyProfileComplete`, and
  `NannyProfileResponseSchema.isProfileComplete`.
- `auth.ts` `UserResponseSchema`: `idVerificationStatus` → `approvalStatus`,
  `idRejectionReason` → `rejectionReason`.
- `admin.ts`:
  - One `AdminApprovalStatusFilterSchema` (`ALL | PENDING_ID | PENDING_REVIEW |
    APPROVED | REJECTED`) replaces the three identical
    `AdminNannyStatusFilterSchema` / `AdminMotherStatusFilterSchema` /
    `AdminIdReviewStatusFilterSchema`; the `AdminNannyStatusFilter` etc. type
    aliases go with them.
  - `AdminNannySchema`, `AdminMotherSchema`, `AdminIdReviewSchema`:
    `idVerificationStatus` → `approvalStatus`.
  - `AdminIdReviewSchema` is parents-only: drop `role` and `userId` (`id` is
    the User id — the only id a mother needs). `AdminIdReviewRoleFilterSchema`
    and the `role` query param are deleted. Section comment: "Parent ID review
    queue".
  - `UpdateAdminNannySchema` gains `avatarUrl: z.string().url().nullable().optional()`,
    `dateOfBirth: YYYY-MM-DD string .optional()`, and `latitude` / `longitude`
    (same bounds as `RegisterRequestSchema`) with a refine requiring both or
    neither — mirroring `UpdateProfileRequestSchema`'s "address + coordinates
    together" rule.
  - `AdminNannyDetailSchema` gains `latitude` / `longitude` (nullable numbers) so
    the editor can seed the pin.

## 3. Backend — `apps/backend/src`

### 3.1 Rename (mechanical, every reference)
`idVerificationStatus` → `approvalStatus`, `idReviewedAt` → `reviewedAt`,
`idRejectionReason` → `rejectionReason`, `IdVerificationStatus` →
`ApprovalStatus` in: `auth.service.ts` (`toUserResponse`, `registerUser`,
`submitId`), `admin-user.service.ts`, `admin-nanny.service.ts`,
`admin-id-review.service.ts`, `nanny.service.ts`, `booking.service.ts`
(broadcast + mother gate), `camera.service.ts`, `middleware/nanny.middleware.ts`.
Comments that say "KYC gate now lives on the user row" are rewritten to say
what is true now ("approved by an admin"), not what changed.

### 3.2 Completeness removed
- `nanny.service.ts`: `buildListWhere` / `buildListFilterSql` drop the
  `isProfileComplete` / `np.is_profile_complete` predicate; `writeNannyProfileFields`
  no longer re-reads bio/location/years or computes anything — it writes the
  user fields, upserts the profile fields, reconciles certifications. Its doc
  comment and `toNannyProfileResponse` lose the completeness talk.
- `auth.service.ts` `registerUser`: no `isProfileComplete` on the profile create.
- `booking.service.ts` `notifyBookingBroadcast`: drop `isProfileComplete: true`;
  its doc comment says "an approved nanny who is free …".

### 3.3 Parents-only ID queue
`admin-id-review.service.ts`: `where` is `{ deletedAt: null, role: 'MOTHER', …status }`;
`roleClause`, the `nannyProfile` select and the `actionId` branch go. DTO `id`
is the user id. `routes/admin.routes.ts` `GET /id-reviews` validates the query
without `role`.

### 3.4 Admin edits anything
- `NannyProfileWritable` gains `dateOfBirth?: string`, `latitude?: number`,
  `longitude?: number`; `writeNannyProfileFields` writes them onto `User`
  (`dateOfBirth` as a `Date`, coordinates as decimals) in the same update as
  name/avatar/address. `avatarUrl` is already accepted.
- `admin-nanny.service.ts` `nannyInclude.user` selects `latitude` / `longitude`;
  `toDetailDto` exposes them as numbers.

### 3.5 Tests
- **Rename** across `admin-nanny.service.test.ts`, `admin-mother.service.test.ts`,
  `admin-id-review.service.test.ts`, `auth-service-id.test.ts`,
  `booking-mother-id-gate.test.ts`, `booking-create-children.test.ts`,
  `admin-nanny-update.test.ts`, `auth-register-nanny-profile.test.ts`, the
  integration journeys `a10`, `a11`, `a14`, `a21`, `test/factories/user.ts`,
  `test/e2e/seed-mobile.ts`, `prisma/seed-demo.ts`.
- **Delete** `nanny-profile-completeness.test.ts`; strip the
  `isProfileComplete` expectations from `nanny-profile-update.test.ts` and
  `auth-register-nanny-profile.test.ts` (the "marks the profile incomplete"
  case is gone — registration cannot produce an incomplete profile any more).
- **`admin-id-review.service.test.ts`**: the queue never returns a nanny even
  when one is `PENDING_REVIEW`; no `role` filter.
- **`admin-nanny-update.test.ts`**: admin can set `avatarUrl`, `dateOfBirth`,
  `latitude`+`longitude`; coordinates one-without-the-other is a 400 (schema
  test in `packages/shared`).
- **Gate tests** (unit; in the existing listing / broadcast / middleware test
  files where they exist, new files otherwise): nanny listing and broadcast
  include an approved nanny with no address; `requireApprovedNanny` refuses
  anything but `APPROVED`.
- `admin-permissions.test.ts` keeps passing (no route added or removed).

## 4. Admin console — `apps/admin/src`

### 4.1 Rename
`idVerificationStatus` → `approvalStatus` in `nanny-review-tab.tsx`,
`nanny-detail-page.tsx`, `mothers-tab.tsx`, `mother-detail-page.tsx`,
`id-review-card.tsx`, `use-dashboard-stats.ts`, `lib/api.ts`. `lib/id-status.ts`
→ `lib/approval-status.ts` exporting `approvalStatusTone` /
`approvalStatusLabel`; the per-file `statusTone` / `statusLabel` copies in the
nanny and mother pages are deleted in favour of it. All three list tabs use
the one `AdminApprovalStatusFilter` type.

### 4.2 Nanny approval cycle on the detail page
- Header buttons: **Approve nanny** / **Reject application**; toasts "Nanny
  approved" / "Application rejected"; reject dialog title "Reject application",
  placeholder "e.g. Couldn't verify ID documents" stays (an ID problem is a
  valid reason).
- Nannies tab lead copy: "New nanny registrations wait here until reviewed.
  Open a nanny to check her profile and ID together, edit anything that needs
  correcting, then approve or reject the application."
- Profile card "Status" row is the approval status; "Reviewed at" stays.

### 4.3 ID Review tab is parents-only
- `id-review-tab.tsx`: no Role filter; lead copy "Every ID a parent has uploaded,
  in one place. Scan the photos, then approve or reject without leaving the
  page. Nannies are reviewed from the Nannies tab, where their profile and ID
  are decided together."
- `id-review-card.tsx`: `ROLE_LABEL`, the role branch and the `admin-nannies`
  invalidation go; it calls `approveMother` / `rejectMother` only; the sub line
  is just the ID type.
- `users-page.tsx` subtitle: "Everyone on the platform — browse parents, verify
  their IDs, and review new nanny applications."

### 4.4 Admin edits anything
`nanny-profile-editor.tsx` gains: a photo field (file input → `uploadImage` from
`lib/storage.ts`, preview, "Remove photo" → `avatarUrl: null`), a date-of-birth
`<input type="date">`, and latitude / longitude number inputs grouped under the
Location field with hint "Home pin — keep it in step with the address so
distance search stays right." Both-or-neither is enforced client-side with the
shared schema's message. `NannyDetailPage`'s profile list shows the photo (or
initials) and the pin.

### 4.5 Tests
- `src/test/handlers.ts` and every fixture: rename the field; `/admin/id-reviews`
  fixtures are mothers with a plain `id`.
- `pages/__tests__/dashboard-page.test.tsx`: rename.
- New component tests: `id-review-card` approves via the mother endpoint;
  `nanny-profile-editor` submits `avatarUrl` / `dateOfBirth` / coordinates and
  blocks a lone latitude.
- E2E `b05-users-and-id-review.spec.ts`: the pending-nanny case moves from the
  gallery to the detail page (seed → open row → "Approve nanny" → status badge
  "approved" → gone from Pending filter); the gallery case asserts the nanny is
  **not** listed. `e2e/helpers/backend.ts` renames its field.

## 5. Mobile — `apps/mobile`

- Delete `src/components/ProfileVisibilityBanner.tsx` and its two usages in
  `NannyDashboardScreen.tsx` / `NannyProfileEditScreen.tsx` (and any now-unused
  imports). `useNannyProfile` types follow the shared schema automatically.
- Rename `idVerificationStatus` → `approvalStatus`, `idRejectionReason` →
  `rejectionReason`, `IdVerificationStatus` → `ApprovalStatus` (import from
  `@shared/auth`) in `app/index.tsx`, `hooks/useIdGate.ts`,
  `screens/auth/PendingReviewScreen.tsx`, `screens/auth/UploadIdScreen.tsx`,
  `screens/parent/MotherProfileWalletScreen.tsx`. `useIdGate` keeps its name —
  it gates on "needs to upload an ID", which is still exactly what it checks.
  The router comment reads "Nannies are approved by an admin before they can
  use the app …".
- Copy unchanged: nanny sees "Your profile is under review" / "approved"; mother
  sees ID wording.
- Tests: `AccountScreen.test.tsx` fixture rename; `e2e/accounts.mjs` and
  `e2e/scripts/advance.js` rename (the seeder in `test/e2e/seed-mobile.ts` drops
  its `approvalStatus`-on-profile and `isProfileComplete` spec keys and takes
  the user-level `approvalStatus` instead).

## 6. Docs

- `Docs/testing/e2e-flows.md` B5 and
  `.claude/skills/mobile-e2e-lab/references/authoring-flows.md`: new field name;
  B5 describes the parents-only gallery + nanny detail-page approval.
- `apps/backend/CLAUDE.md` / `apps/admin/CLAUDE.md`: no rule changes needed;
  only if a sentence names the old field.
- Older specs/plans under `Docs/superpowers` are dated records and are left as
  written.

## Out of scope

- Renaming `idDocument*` fields or moving `IdDocumentTypeSchema` out of `nanny.ts`.
- A map / places picker in the admin console (raw coordinates are enough for
  the rare correction).
- Admin editing of email, phone or the ID images.
- Any change to how mothers are gated or notified.
