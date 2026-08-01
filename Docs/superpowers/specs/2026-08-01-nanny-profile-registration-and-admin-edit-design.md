# Nanny Profile — Registration-Only Entry + Admin Editing — Design

Date: 2026-08-01
Status: Approved

## Goal

Change where a nanny's profile data comes from. Today a nanny registers into an
**empty** `NannyProfile` and completes it later on `NannyProfileEditScreen`
(free to edit at any time). We want:

- **Registration is the only time a nanny enters her profile** — photo, bio,
  years of experience, availability, working hours, age ranges, certifications,
  and skills are captured during signup.
- **After registration the nanny profile is read-only in the app.** The nanny
  can view it but cannot change anything (aside from signing out).
- **Admins verify and edit everything** from the admin console.

## Decisions

- **Single coordinated feature.** The registration expansion must ship together
  with the self-edit removal, so a nanny is never left unable to set her profile.
- **Persist at signup via the register endpoint.** Extend `POST /auth/register`
  to populate the `NannyProfile` in the same transaction, rather than making a
  second `PUT /nanny/profile` call after signup. This lets us remove the
  self-edit endpoint entirely.
- **Required at registration:** photo, bio, years of experience, availability
  type. **Optional:** age ranges, working hours (defaults applied),
  certifications, skills. Client enforces required-ness; a `superRefine` on the
  shared schema enforces it server-side for `role === 'nanny'`.
- **Remove `PUT /nanny/profile`** and the mobile `useUpdateNannyProfile` hook —
  registration becomes the only nanny-side write, leaving no consumer.
- **Admin photo editing is out of scope** this iteration (no admin avatar
  upload). The nanny sets her photo at registration; admins edit every other
  field. Skills keep their existing dedicated admin editor.
- **Admin editor is inline** on the nanny detail page, mirroring the existing
  "Skills" card toggle (read view ↔ editor).

## Behaviour model

```
Nanny registration (one time)
  Step 1  personal info + PHOTO (photo now required + uploaded)
  Step 2  password
  Step 3  home location
  Step 4  ID document
  Step 5  professional details  ← NEW (bio, experience, availability,
          age ranges, working hours, certifications, skills)
  Final   OTP (bypassed) + terms  → POST /auth/register (populates NannyProfile)
  → pending-review (admin KYC)

After registration
  Nanny app: profile screen is READ-ONLY.
  Admin: verifies KYC (existing) AND edits any profile field (new).
```

## 1. Shared schemas — `packages/shared/src`

### 1.1 `RegisterRequestSchema` (`auth.ts`)
Add nanny-only optional fields (mothers omit them):
`avatarUrl`, `bio`, `yearsOfExperience`, `ageRanges` (string[]), `availabilityType`
(reuse `AvailabilityType`), `schedule` (`WeeklySchedule`), `certificationIds`
(number[]), `skillIds` (number[]).

Add a `superRefine`: when `role === 'nanny'`, require `avatarUrl`, `bio`,
`yearsOfExperience`, and `availabilityType` (matches the client's required set).

### 1.2 `UpdateAdminNannySchema` (`admin.ts`)
Mirror `UpdateAdminMotherSchema`. Fields (all optional, ≥1 required via refine):
`firstName`, `lastName`, `location`, `bio`, `yearsOfExperience`, `ageRanges`,
`availabilityType`, `schedule`, `certificationIds`. **Excludes** `avatarUrl`
(photo deferred) and `skillIds` (skills have a separate admin editor).

Export inferred types from `packages/shared/src/index.ts`.

## 2. Backend — `apps/backend/src`

### 2.1 Core profile writer (`services/nanny.service.ts`)
Refactor the transaction inside `updateNannyProfile` (currently keyed by the
caller's firebase uid via `requireNannyUser`) into a core helper that takes a
resolved nanny `User` (with `nannyProfile`) + the field set, and writes:
- `User`: `firstName`, `lastName`, `avatarUrl`, `address` (from `location`)
- `NannyProfile`: `bio`, `yearsOfExperience`, `ageRanges`, `schedule`,
  `availabilityType`, recomputed `isProfileComplete`
- certifications via `reconcileNannyCertifications(tx, nannyProfileId, ids)`

Both the register path and the admin path call this core.

### 2.2 `registerUser` (`services/auth.service.ts`)
For `role === 'nanny'`, create the `NannyProfile` populated from the register
body (bio, yearsOfExperience, ageRanges, availabilityType, schedule) instead of
`{ userId }` only; set `User.avatarUrl`; reconcile certifications and skills
(reuse the `NannySkill` reconcile logic from `setNannySkills`). All in the
existing signup transaction.

### 2.3 Remove nanny self-edit
Delete `PUT /nanny/profile` (`routes/nanny.routes.ts`) and drop the now-unused
self path in `updateNannyProfile` (keep the extracted core). `GET /nanny/profile`
stays (the read-only screen still needs it).

### 2.4 Admin edit endpoint
Add `PATCH /admin/nannies/:id` on the (already `requireAdmin`-gated) admin router.
New `updateAdminNanny(nannyProfileId, input)` in `admin-nanny.service.ts`:
resolve the nanny `User` by NannyProfile id → call the core writer → return the
updated `AdminNannyDetail`. Skills stay on the existing `PUT /admin/nannies/:id/skills`.

## 3. Mobile registration — `apps/mobile`

### 3.1 Photo (fix the discard)
Step 1 already captures `draft.photoUri`; make it **required** to advance. In
`RegistrationStep3Screen.handleCompleteSetup`, upload it via
`uploadImageToFirebase(uri, 'avatars')` (same pattern as the ID upload, which
runs right there) and include `avatarUrl` in the register body.

### 3.2 New step — "Professional details"
New screen + route `register-nanny-details`, inserted after `register-nanny-id`
and before `register-step-3`. Collects into the registration draft store:
- **bio** (required), **yearsOfExperience** (required), **availabilityType**
  (required)
- **ageRanges** (optional chips), **working hours / schedule** (optional; reuse
  the `TimeSelectSheet` + day-row pattern from `NannyProfileEditScreen`; default
  schedule applied), **certifications** (optional; `useCertificationCatalog`),
  **skills** (optional; `useSkillCatalog`)

Update the "STEP x OF 4" counters across the nanny flow to "OF 5".

### 3.3 Send at signup
Extend the `POST /auth/register` body (`useRegisterProfile`) with the new fields
for nannies.

### 3.4 Read-only profile screen (`NannyProfileEditScreen.tsx`)
Render only the existing read-only branch. Remove: the edit-pencil header toggle,
`?edit=1` handling, the "Complete profile" CTA (replace with an informational
note — profile is managed by NannyNow), the entire edit-mode JSX, the Save
button, and `useUpdateNannyProfile`. Keep the profile view + Sign out. Rename the
screen file/route if warranted (it is no longer an "edit" screen) — optional,
low priority.

## 4. Admin — `apps/admin`

### 4.1 API (`lib/api.ts`)
`updateNanny(id: number, input: UpdateAdminNannyInput): PATCH /admin/nannies/:id`,
mirroring `updateMother`.

### 4.2 `NannyProfileEditor` (`features/nannies/`)
Inline editor rendered on `nanny-detail-page.tsx`'s **Profile** card, toggled the
same way the Skills card toggles today. Sections (reuse `Card`/`Field`/`Select`
+ `.form-grid`): Basic info (first/last name, location, bio, years of
experience), Age ranges (chips), Availability (`Select`), Certifications
(multi-select), Working hours (day rows with available toggle + start/end
inputs). Save via `updateNanny` → `setQueryData(['nanny', id])` +
`invalidateQueries(['admin-nannies'])` + toast, mirroring `mother-edit-form.tsx`
and `nanny-skills-editor.tsx`. Photo shown read-only (not editable).

## Out of scope

- Admin editing the nanny's **photo** (no admin avatar upload this iteration).
- Any nanny self-edit of the profile after registration.
- Changing the skills model beyond letting a nanny pick skills at registration
  (skills remain admin-managed thereafter, via the existing editor).
- Migrating existing empty nanny profiles (pre-existing nannies are edited by
  admins — the intended post-launch path anyway).

## Verification

Per repo memory ([[local-dev-constraints]], [[mobile-web-preview-verify]]): no
Docker/DB locally.
- `pnpm typecheck` across shared + backend + mobile + admin.
- `pnpm test --filter=@nanny-app/backend` — add tests for `registerUser`
  populating a nanny profile (+ certs/skills) and for `updateAdminNanny`.
- Mobile: web preview of the new "Professional details" step and the read-only
  profile screen (build → serve → Playwright at 390×844).
- Admin: dev server, exercise the inline profile editor on the nanny detail page.
