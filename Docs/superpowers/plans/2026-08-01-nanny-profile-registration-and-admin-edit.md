# Nanny Profile — Registration-Only Entry + Admin Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the nanny's full profile during registration, make the nanny app profile read-only afterward, and let admins edit every profile field.

**Architecture:** Extend `POST /auth/register` to populate the `NannyProfile` in the signup transaction; remove `PUT /nanny/profile`; add `PATCH /admin/nannies/:id` backed by a shared core writer refactored out of the old self-edit service. Mobile gains a "Professional details" registration step and a read-only profile screen; admin gains an inline profile editor on the nanny detail page.

**Tech Stack:** Zod (shared), Express + Prisma + Jest (backend), Expo/React Native + React Query + Zustand (mobile), React + Vite + React Query (admin).

Spec: `Docs/superpowers/specs/2026-08-01-nanny-profile-registration-and-admin-edit-design.md`.

## Global Constraints

- TypeScript strict everywhere; no `any`; `type` imports; types inferred from `@nanny-app/shared` Zod schemas — never duplicated.
- Files kebab-case; components PascalCase; env via typed config only.
- Mobile: no hardcoded hex/font/shadow — use `@mobile/theme` tokens; screen styles live in `screens/*/styles/*.styles.ts`; wrap screens per the layout scaffold.
- Admin: CSS-variable tokens only in `global.css`; reuse `@admin/components/ui`; errors via `apiErrorMessage(err)`.
- Local dev has **no Docker/DB** and **no mobile jest harness**. Verify backend via `pnpm --filter @nanny-app/backend test` (mocked Prisma) and everything via `pnpm --filter <pkg> typecheck`. Mobile UI via the web preview workflow (`Docs/superpowers/plans` memory `mobile-web-preview-verify`).
- Money/identity fields required at registration for nannies: **photo, bio, yearsOfExperience, availabilityType**. Age ranges, working hours, certifications, skills are optional.

---

### Task 1: Shared schemas — register + admin-edit

**Files:**
- Modify: `packages/shared/src/auth.ts` (`RegisterRequestSchema`)
- Modify: `packages/shared/src/admin.ts` (add `UpdateAdminNannySchema`)
- Modify: `packages/shared/src/index.ts` (exports, if not barrel-star)
- Test: `packages/shared/src/__tests__/` if the package has tests; otherwise verify via typecheck + a scratch parse.

**Interfaces:**
- Produces: `RegisterRequest` gains optional `avatarUrl, bio, yearsOfExperience, ageRanges, availabilityType, schedule, certificationIds, skillIds`; `UpdateAdminNannySchema` / `UpdateAdminNanny` with fields `firstName?, lastName?, location?, bio?, yearsOfExperience?, ageRanges?, availabilityType?, schedule?, certificationIds?`.

- [ ] **Step 1: Add nanny fields to `RegisterRequestSchema`.** In `auth.ts`, import the field schemas already used by `UpdateNannyProfileRequestSchema` (`packages/shared/src/nanny.ts:288-303`) — `AvailabilityTypeSchema` and `WeeklyScheduleSchema` (confirm exact export names in `nanny.ts`). Add to the `.object({...})` (all optional):

```ts
    avatarUrl: z.string().url().optional(),
    bio: z.string().trim().max(600).optional(),
    yearsOfExperience: z.number().int().min(0).max(60).optional(),
    ageRanges: z.array(z.string()).optional(),
    availabilityType: AvailabilityTypeSchema.optional(),
    schedule: WeeklyScheduleSchema.optional(),
    certificationIds: z.array(z.number().int().positive()).optional(),
    skillIds: z.array(z.number().int().positive()).optional(),
```

- [ ] **Step 2: Require the essentials for nannies.** Add a second `.refine` (after the existing ID refine) enforcing the required set for nannies:

```ts
  .refine(
    (v) =>
      v.role !== 'NANNY' ||
      (!!v.avatarUrl && !!v.bio && v.yearsOfExperience !== undefined && !!v.availabilityType),
    {
      message: 'Nannies must provide a photo, bio, years of experience, and availability.',
      path: ['bio'],
    },
  )
```

- [ ] **Step 3: Add `UpdateAdminNannySchema`.** In `admin.ts`, next to `UpdateAdminMotherSchema` (`admin.ts:654-664`), mirror its shape (reuse the nanny field schemas):

```ts
export const UpdateAdminNannySchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    location: z.string().trim().max(200).optional(),
    bio: z.string().trim().max(600).optional(),
    yearsOfExperience: z.number().int().min(0).max(60).optional(),
    ageRanges: z.array(z.string()).optional(),
    availabilityType: AvailabilityTypeSchema.optional(),
    schedule: WeeklyScheduleSchema.optional(),
    certificationIds: z.array(z.number().int().positive()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update.' });
export type UpdateAdminNanny = z.infer<typeof UpdateAdminNannySchema>;
```

Import `AvailabilityTypeSchema`/`WeeklyScheduleSchema` in `admin.ts` if not already present.

- [ ] **Step 4: Export.** Ensure `UpdateAdminNannySchema`/`UpdateAdminNanny` are exported from `packages/shared/src/index.ts` (match how `UpdateAdminMotherSchema` is exported).

- [ ] **Step 5: Verify.** Run: `pnpm --filter @nanny-app/shared typecheck` (or `pnpm --filter @nanny-app/shared build`). Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/shared/src/auth.ts packages/shared/src/admin.ts packages/shared/src/index.ts
git commit -m "feat(shared): nanny profile fields on register + admin-edit schema"
```

---

### Task 2: Backend — extract core nanny-profile writer

**Files:**
- Modify: `apps/backend/src/services/nanny.service.ts` (`updateNannyProfile`, ~lines 174-241)
- Test: `apps/backend/src/__tests__/nanny-profile-update.test.ts` (create if none exists; otherwise extend the existing nanny service test)

**Interfaces:**
- Produces: `writeNannyProfileFields(tx: Prisma.TransactionClient, params: { userId: number; nannyProfileId: number; fields: NannyProfileWritable }): Promise<void>` where `NannyProfileWritable = { firstName?, lastName?, avatarUrl?, location?, bio?, yearsOfExperience?, ageRanges?, availabilityType?, schedule?, certificationIds? }`. Writes `User` (firstName/lastName/avatarUrl/address), `NannyProfile` (bio/yearsOfExperience/ageRanges/schedule/availabilityType + recomputed `isProfileComplete`), and reconciles certifications.
- Consumes: existing `reconcileNannyCertifications(tx, nannyProfileId, ids)` (certification.service.ts) and `getMissingNannyProfileFields`.

- [ ] **Step 1: Write the failing test.** Assert that calling `updateNannyProfile` for a nanny still updates bio + location + certifications (behavior preserved through the refactor). Mock Prisma per the repo's existing nanny service test pattern. Run and confirm it passes against current code first (characterization), then keep it green through the refactor.

- [ ] **Step 2: Extract the writer.** Move the transaction body of `updateNannyProfile` (the `tx.user.update` + `tx.nannyProfile.upsert` + `reconcileNannyCertifications` + `isProfileComplete` recompute) into `writeNannyProfileFields(tx, { userId, nannyProfileId, fields })`. `updateNannyProfile` now: resolve nanny via `requireNannyUser(decoded.uid)`, open a `prisma.$transaction`, ensure the profile row (upsert/find), then call `writeNannyProfileFields`, then return the DTO via the existing read.

- [ ] **Step 3: Verify.** Run: `pnpm --filter @nanny-app/backend test -- nanny` . Expected: PASS (behavior unchanged).

- [ ] **Step 4: Commit.**

```bash
git add apps/backend/src/services/nanny.service.ts apps/backend/src/__tests__/nanny-profile-update.test.ts
git commit -m "refactor(backend): extract writeNannyProfileFields core writer"
```

---

### Task 3: Backend — registerUser populates the nanny profile

**Files:**
- Modify: `apps/backend/src/services/auth.service.ts` (`registerUser`, nanny branch ~lines 94-139)
- Test: `apps/backend/src/__tests__/auth-register-nanny-profile.test.ts` (create)

**Interfaces:**
- Consumes: `RegisterRequest` (Task 1), `reconcileNannyCertifications`, and the `NannySkill` reconcile logic used by `setNannySkills` (`admin-nanny.service.ts:245-301`) — extract a small `reconcileNannySkills(tx, nannyProfileId, skillIds)` helper if `setNannySkills`' body isn't already reusable.

- [ ] **Step 1: Write the failing test.** Given a nanny `RegisterRequest` with `avatarUrl, bio, yearsOfExperience, ageRanges, availabilityType, schedule, certificationIds:[1], skillIds:[2]`, assert `registerUser` creates the `User` with `avatarUrl` set and the `NannyProfile` with those fields, and reconciles cert id 1 + skill id 2. Mock Prisma `$transaction`/model calls per repo pattern. Run: `pnpm --filter @nanny-app/backend test -- auth-register-nanny-profile`. Expected: FAIL.

- [ ] **Step 2: Set avatar on the user.** In the `tx.user.create` data, add `avatarUrl: isNanny ? (body.avatarUrl ?? null) : null`.

- [ ] **Step 3: Populate the profile.** Replace the empty `tx.nannyProfile.create({ data: { userId: user.id } })` with a create that includes `bio`, `yearsOfExperience`, `ageRanges`, `schedule`, `availabilityType` from `body` (fall back to sensible defaults/nulls), plus computed `isProfileComplete`. Then within the same `tx`, call `reconcileNannyCertifications(tx, profile.id, body.certificationIds ?? [])` and `reconcileNannySkills(tx, profile.id, body.skillIds ?? [])`.

- [ ] **Step 4: Verify.** Run: `pnpm --filter @nanny-app/backend test -- auth-register-nanny-profile`. Expected: PASS. Then run the full backend suite: `pnpm --filter @nanny-app/backend test`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/backend/src/services/auth.service.ts apps/backend/src/services/admin-nanny.service.ts apps/backend/src/__tests__/auth-register-nanny-profile.test.ts
git commit -m "feat(backend): populate nanny profile from registration payload"
```

---

### Task 4: Backend — remove the nanny self-edit endpoint

**Files:**
- Modify: `apps/backend/src/routes/nanny.routes.ts` (remove the `PUT /profile` block, ~lines 54-65)
- Modify: `apps/backend/src/services/nanny.service.ts` (remove the now-unused `updateNannyProfile` export + its `requireNannyUser` self-resolve wrapper; keep `writeNannyProfileFields` and `GET`-path reads)

**Interfaces:**
- Produces: no `PUT /nanny/profile`. `GET /nanny/profile` unchanged.

- [ ] **Step 1: Remove the route.** Delete the `nannyRouter.put('/profile', ...)` block and drop `updateNannyProfile` + `UpdateNannyProfileRequestSchema`/`validateBody` from the imports if they become unused.

- [ ] **Step 2: Remove the self service.** Delete the `updateNannyProfile` function (the self path) from `nanny.service.ts`. Keep `writeNannyProfileFields`. If `UpdateNannyProfileRequestSchema` is now unused anywhere, leave the schema in shared (harmless) but remove dead imports.

- [ ] **Step 3: Verify.** Run: `pnpm --filter @nanny-app/backend typecheck` and `pnpm --filter @nanny-app/backend test`. Expected: PASS (no references to the removed export).

- [ ] **Step 4: Commit.**

```bash
git add apps/backend/src/routes/nanny.routes.ts apps/backend/src/services/nanny.service.ts
git commit -m "feat(backend): remove nanny self-edit endpoint (PUT /nanny/profile)"
```

---

### Task 5: Backend — admin edits a nanny profile

**Files:**
- Modify: `apps/backend/src/services/admin-nanny.service.ts` (add `updateAdminNanny`)
- Modify: `apps/backend/src/routes/admin.routes.ts` (add `PATCH /nannies/:id`)
- Test: `apps/backend/src/__tests__/admin-nanny-update.test.ts` (create)

**Interfaces:**
- Produces: `updateAdminNanny(nannyProfileId: number, input: UpdateAdminNanny): Promise<AdminNannyDetail>`; route `PATCH /admin/nannies/:id`.
- Consumes: `writeNannyProfileFields` (Task 2), `getAdminNanny` (for the return DTO).

- [ ] **Step 1: Write the failing test.** `updateAdminNanny(profileId, { bio:'x', certificationIds:[3] })` resolves the nanny `User` by profile id, calls `writeNannyProfileFields`, and returns the updated `AdminNannyDetail`. Throws `notFound` for an unknown id. Run: `pnpm --filter @nanny-app/backend test -- admin-nanny-update`. Expected: FAIL.

- [ ] **Step 2: Implement the service.** Resolve `nannyProfile` by id (include `user`); throw `errors.notFound('Nanny not found')` if missing/soft-deleted. In a `prisma.$transaction`, call `writeNannyProfileFields(tx, { userId, nannyProfileId, fields: input })`. Return `getAdminNanny(id)`.

- [ ] **Step 3: Add the route.** Under the admin router (already `requireAuth, requireAdmin`), add:

```ts
adminRouter.patch(
  '/nannies/:id',
  validateBody(UpdateAdminNannySchema),
  async (req, res, next) => {
    try {
      res.json(ok(await updateAdminNanny(routeIdParam(req.params.id), req.body)));
    } catch (err) { next(err); }
  },
);
```

Import `UpdateAdminNannySchema` and `updateAdminNanny`.

- [ ] **Step 4: Verify.** Run: `pnpm --filter @nanny-app/backend test -- admin-nanny-update` then the full backend suite. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/backend/src/services/admin-nanny.service.ts apps/backend/src/routes/admin.routes.ts apps/backend/src/__tests__/admin-nanny-update.test.ts
git commit -m "feat(backend): admin can edit a nanny profile (PATCH /admin/nannies/:id)"
```

---

### Task 6: Mobile — capture the full profile during registration

**Files:**
- Modify: `apps/mobile/src/store/registrationDraftStore.ts` (add profile fields)
- Modify: `apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx` (require photo to advance)
- Create: `apps/mobile/src/screens/auth/RegistrationNannyDetailsScreen.tsx` + `styles/registration-nanny-details-screen.styles.ts`
- Create: `apps/mobile/app/(auth)/register-nanny-details.tsx` (one-line re-export)
- Modify: `apps/mobile/src/screens/auth/RegistrationNannyIdScreen.tsx` (route next → `register-nanny-details`)
- Modify: `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx` (upload photo → `avatars`; include nanny fields in the register body)
- Modify: step counters (`STEP x OF 4` → `OF 5`) across the nanny-path screens.

**Interfaces:**
- Consumes: `RegisterRequest` (Task 1); `useCertificationCatalog` (`useNannies.ts:55`), `useSkillCatalog` (`useNannies.ts:47`); `uploadImageToFirebase` (`lib/storage.ts`); `TimeSelectSheet`; `AvailabilityType`.

- [ ] **Step 1: Extend the draft store.** Add optional fields: `bio?: string; yearsOfExperience?: string; ageRanges?: string[]; availabilityType?: AvailabilityType; schedule?: WeeklySchedule; certificationIds?: number[]; skillIds?: number[];` (`photoUri` already exists). Update `resetDraft` defaults.

- [ ] **Step 2: Require the photo.** In `RegistrationStep1Screen`, disable "Continue" until `photoUri` is set (mirror how other required fields gate the button); add an inline hint when missing.

- [ ] **Step 3: Build the "Professional details" screen.** New screen collecting: bio (`TextInput` multiline, required), years of experience (numeric `TextInput`, required), availability (`AVAILABILITY_OPTIONS` chips → `availabilityType`, required), age ranges (chips, optional), certifications (chips from `useCertificationCatalog`, optional), skills (chips from `useSkillCatalog`, optional), working hours (reuse the day-row + `TimeSelectSheet` pattern from `NannyProfileEditScreen.tsx:392-433`, optional, seeded from `DEFAULT_SCHEDULE`). Persist to the draft on change. "Continue" gated on the 3 required fields → `router.push('/(auth)/register-step-3', { role })`. Follow the mobile layout scaffold + theme tokens; styles in the sibling `.styles.ts`.

- [ ] **Step 4: Insert into the flow.** In `RegistrationNannyIdScreen`, change the next route from `register-step-3` to `register-nanny-details`. Create the route re-export file.

- [ ] **Step 5: Update step counters.** Change the nanny-path progress labels from "OF 4" to "OF 5" (Step1, CreatePassword, NannyLocation, NannyId, plus the new NannyDetails as step 5). Keep the mother path at OF 4 (mothers don't get the new step).

- [ ] **Step 6: Upload photo + send fields.** In `RegistrationStep3Screen.handleCompleteSetup`, after the Firebase account exists and alongside the ID upload, add `const avatarUrl = await uploadImageToFirebase(draft.photoUri, 'avatars')`. Extend the register body (nanny only) with `avatarUrl`, `bio`, `yearsOfExperience: draft.yearsOfExperience ? parseInt(...) : undefined`, `ageRanges`, `availabilityType`, `schedule`, `certificationIds`, `skillIds`.

- [ ] **Step 7: Verify.** Run: `pnpm --filter @nanny-app/mobile typecheck`. Expected: PASS. Then build a preview wrapper for the new screen under `src/__preview__/` and screenshot it at 390×844 per the `mobile-web-preview-verify` workflow; confirm required-field gating and the working-hours editor render.

- [ ] **Step 8: Commit.**

```bash
git add apps/mobile/src/store/registrationDraftStore.ts apps/mobile/src/screens/auth apps/mobile/app/\(auth\)/register-nanny-details.tsx
git commit -m "feat(mobile): capture full nanny profile during registration"
```

---

### Task 7: Mobile — read-only nanny profile screen

**Files:**
- Modify: `apps/mobile/src/screens/nanny/NannyProfileEditScreen.tsx`
- Modify: `apps/mobile/src/hooks/useNannyProfile.ts` (remove `useUpdateNannyProfile`)

**Interfaces:**
- Consumes: `useNannyProfile` (read), still used.

- [ ] **Step 1: Strip edit mode.** Remove `isEditing` state, `handleToggleEdit`, the header edit-pencil `leftSlot`, the `?edit=1` effect, the entire edit-mode JSX branch, the Save button, `handleSave`, and the `useUpdateNannyProfile` usage. Render only the existing read-only branch. Keep Sign out.

- [ ] **Step 2: Repurpose the banner.** Replace `ProfileVisibilityBanner`'s "Complete profile" CTA with a non-interactive informational note (e.g. "Your profile is managed by NannyNow. Contact support to update it."), or drop the banner if it no longer fits. Use theme tokens only.

- [ ] **Step 3: Remove the dead hook.** Delete `useUpdateNannyProfile` from `useNannyProfile.ts` (keep `useNannyProfile`).

- [ ] **Step 4: Verify.** Run: `pnpm --filter @nanny-app/mobile typecheck`. Expected: PASS. Preview the screen (there may be an existing preview wrapper) and confirm no edit affordances remain.

- [ ] **Step 5: Commit.**

```bash
git add apps/mobile/src/screens/nanny/NannyProfileEditScreen.tsx apps/mobile/src/hooks/useNannyProfile.ts
git commit -m "feat(mobile): make nanny profile read-only"
```

---

### Task 8: Admin — inline nanny profile editor

**Files:**
- Modify: `apps/admin/src/lib/api.ts` (add `updateNanny`)
- Create: `apps/admin/src/features/nannies/nanny-profile-editor.tsx`
- Modify: `apps/admin/src/pages/nanny-detail-page.tsx` (toggle the Profile card into the editor)
- Modify: `apps/admin/src/styles/global.css` only if a new class is genuinely needed (prefer existing `.form-grid`, `.row-actions`, `.settings-*`).

**Interfaces:**
- Consumes: `UpdateAdminNanny` (Task 1), `AdminNannyDetail`, `fetchCertifications`, `useToast`, `apiErrorMessage`, query keys `['nanny', id]` + `['admin-nannies']`.
- Produces: `updateNanny(id: number, input: UpdateAdminNanny): Promise<AdminNannyDetail>` → `PATCH /admin/nannies/${id}`.

- [ ] **Step 1: Add the API fn.** In `api.ts`, mirror `updateMother` (`api.ts:456-465`): `export function updateNanny(id: number, input: UpdateAdminNanny) { return unwrap(apiClient.patch(\`/admin/nannies/${id}\`, input)); }` with the correct unwrap/type helpers used by neighbors.

- [ ] **Step 2: Build `NannyProfileEditor`.** Props `{ nanny: AdminNannyDetail; certifications: PublicCertification[]; onDone: () => void }`. Seed per-field state from `nanny`. Sections using `Card`/`Field`/`Select`/`.form-grid`: Basic info (firstName, lastName, location, bio, yearsOfExperience), Age ranges (chips), Availability (`Select` over availability options), Certifications (multi-select toggles), Working hours (day rows: available toggle + start/end `time` inputs). On save: `safeParse` with `UpdateAdminNannySchema`, then `useMutation(() => updateNanny(nanny.id, input))` → `setQueryData(['nanny', String(nanny.id)], updated)` + `invalidateQueries(['admin-nannies'])` + `toast.success` + `onDone()`; errors via `toast.error(apiErrorMessage(err))`. Mirror `mother-edit-form.tsx` plumbing and `nanny-skills-editor.tsx` toggle/actions.

- [ ] **Step 3: Wire into the detail page.** On `nanny-detail-page.tsx`, add `editingProfile` state; the `<Card title="Profile">` shows the read-only `DescriptionList` + an "Edit profile" ghost button, or `<NannyProfileEditor .../>` when editing — exactly as the Skills card toggles `editingSkills`. Fetch the certification catalog with `useQuery(['certifications'], fetchCertifications)`.

- [ ] **Step 4: Verify.** Run: `pnpm --filter @nanny-app/admin typecheck` and `pnpm --filter @nanny-app/admin build`. Expected: PASS. (Live modal render needs the backend/DB; verify structurally + via typecheck, and visually with a static preds preview if practical.)

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/src/lib/api.ts apps/admin/src/features/nannies/nanny-profile-editor.tsx apps/admin/src/pages/nanny-detail-page.tsx apps/admin/src/styles/global.css
git commit -m "feat(admin): inline nanny profile editor on the detail page"
```

---

### Task 9: Full-workspace verification

- [ ] **Step 1: Typecheck all.** Run: `pnpm typecheck`. Expected: PASS across shared, backend, mobile, admin.
- [ ] **Step 2: Backend tests.** Run: `pnpm --filter @nanny-app/backend test`. Expected: PASS (incl. new register + admin-update tests).
- [ ] **Step 3: Sanity sweep.** Grep for stale references to the removed `PUT /nanny/profile` / `useUpdateNannyProfile` across `apps/`; confirm none remain.
- [ ] **Step 4: Commit** any fixups.

---

## Self-Review

**Spec coverage:**
- Registration is the only entry → Tasks 3, 6. ✓
- Required fields (photo, bio, experience, availability) → Task 1 (refine), Task 6 (client gating). ✓
- Persist via register endpoint → Task 3. ✓
- Read-only nanny profile → Task 7. ✓
- Remove PUT /nanny/profile → Task 4. ✓
- Core writer reused by admin → Tasks 2, 5. ✓
- Admin inline editor, photo deferred, skills separate → Tasks 5, 8; `UpdateAdminNannySchema` omits `avatarUrl`/`skillIds` (Task 1). ✓
- Skills at registration → Task 3 (`reconcileNannySkills`), Task 6 (skills chips). ✓

**Placeholder scan:** UI tasks reference exact existing patterns at file:line rather than repeating full JSX; logic tasks carry real code. No TBD/TODO.

**Type consistency:** `writeNannyProfileFields` signature is identical in Tasks 2, 3, 5. `updateNanny`/`updateAdminNanny`/`UpdateAdminNanny` names consistent across Tasks 1, 5, 8. `PATCH /admin/nannies/:id` consistent in Tasks 5, 8.
