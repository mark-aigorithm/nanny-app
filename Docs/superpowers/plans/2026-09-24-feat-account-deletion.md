# Account Deletion Implementation Plan (plan 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mother or nanny can delete her account from the app (an App Store requirement). Deletion is immediate: the row is soft-deleted with its email, phone and uid scrambled so they can be reused, `deletionRequestedAt` is set, and the Firebase user is deleted. On iOS an Apple sign-in is revoked first. Active bookings block it; staff can't use it.

**Architecture:** `DELETE /auth/me` grows its row branch. Plan 3 left it discarding a row-less account and refusing (409) when a row exists. Plan 4 deletes a live MOTHER/NANNY row, but **only when the body carries an explicit `confirm: 'delete-my-account'`**. The two plan 3 callers (`useDiscardUnfinishedAccount`, collision B's `api.delete('/auth/me')`) send no body, so a stale or racing discard can never delete a real account; they keep getting the 409. The backend gains `scrambleIdentity` and `deleteAccount` in a new `account-deletion.service.ts`. The mobile app gains `getAppleAuthorizationCode`, `useDeleteAccount` (Apple revoke → DELETE → `clearLocalSession`), and "Delete account" on the profile screens.

**Tech Stack:** Express + Prisma 7 + firebase-admin (Jest unit/integration against the Auth emulator), Expo 54 + RN Firebase 24 (`auth().revokeToken`) + expo-apple-authentication + React Query (jest-expo), Maestro device flows.

**Spec:** `Docs/superpowers/specs/2026-09-24-registration-hardening-design.md` (plan 4 row; "Design choices": deletion refusals, immediate deletion, Apple revocation, deleting accounts).

## Open questions (owner) — answer before Task 1

| # | Question | Plan's default |
|---|---|---|
| Q1 | Require a **recent sign-in** (e.g. `auth_time` within 5 minutes) before deleting? The spec doesn't ask for it. It protects an unlocked, borrowed phone, but costs a re-auth screen for every provider. | **No.** A destructive confirm dialog only. If yes, it becomes its own task after Task 3. |
| Q2 | A nanny on **Pending review / Upload ID** can't reach her profile screen, so she has no way to delete. Add "Delete account" there too? | **Yes.** Put it next to the existing Sign out on `PendingReviewScreen` and `UploadIdScreen` (Task 4). |
| Q3 | What else is soft-deleted with the row? | The nanny profile (drops her out of search, which already filters `u.deleted_at`) and device tokens (no more pushes). Addresses, children, wallet/care points, messages and community posts stay, linked to the scrambled row. A PII purge is out of scope (spec). |

## Global Constraints

- Branch: `feat/sign-in-landing-1hrpzy` (plans 1–4 ship as ONE PR from `feat/sign-in-landing`; fast-forward it before opening). Run `git branch --show-current` before every commit.
- Stage files by name. Never `git add -A` / `git add .`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- NEVER load or use `apps/backend/.env` (it is live production). Integration tests run on `.env.test` with the local stack (`pnpm test:env`). Never run `e2e/flows/live` without explicit owner approval.
- Backend unit tests must mock `@backend/lib/config` or `@backend/lib/firebase` when the code under test imports them.
- `DELETE /auth/me` stays behind `requireFreshAuth` (already pinned in `fresh-auth.routes.test.ts`).
- Soft delete only (backend CLAUDE.md). The Firebase user is the one thing hard-deleted.
- Copy (exact):
  - Active booking refusal (409): `Finish or cancel your upcoming bookings before deleting your account.`
  - Staff refusal (403): `Staff accounts are removed from the admin console.`
  - Row without confirm, or a soft-deleted row (409, unchanged from plan 3): `This account can't be removed here.`
  - Confirm dialog: title `Delete your account?`; message `This deletes your profile and signs you out. It can't be undone.`; confirm `Delete account` (destructive).
  - After deletion (notice on sign-in): title `Account deleted`; message `Your account has been deleted.`
  - Apple revoke failed: `We couldn't disconnect your Apple ID. Please try again.`
- Mobile: no `any`; type imports; Firebase via `@mobile/lib/firebase` only.
- Test commands: as plan 3 (`Docs/superpowers/plans/2026-09-24-feat-registration-recovery.md`, Global Constraints). Run backend unit files with `--runTestsByPath`; a bare path argument runs the whole project.

---

### Task 1: Backend — scramble and delete

**Files:**
- Modify: `packages/shared/src/auth.ts` (add `DeleteMeRequestSchema`)
- Create: `packages/shared/src/__tests__/delete-me.test.ts`
- Create: `apps/backend/src/services/account-deletion.service.ts`
- Modify: `apps/backend/src/services/unfinished-account.service.ts` (the discard branch moves to the new service; `reclaimEmail` stays)
- Modify: `apps/backend/src/routes/auth.routes.ts` (`DELETE /me` → `deleteMe`)
- Test: `apps/backend/src/__tests__/account-deletion.service.test.ts` (unit; prisma + firebase mocked); move the discard cases from `unfinished-account.service.test.ts`

**Interfaces:**
- Produces (shared): `DeleteMeRequestSchema = z.object({ confirm: z.literal('delete-my-account').optional(), appleRevoked: z.boolean().optional() })`, `type DeleteMeRequest`. An empty or missing body parses to `{}`.
- Produces (backend): `scrambleIdentity(userId: number): { email: string; phone: null; firebaseUid: string }`, `deleteMe(decoded: DecodedIdToken, body: DeleteMeRequest): Promise<void>`.
- Produces (HTTP): `DELETE /auth/me` → 204 | 403 | 409.

`scrambleIdentity(userId)`: `email: \`deleted-${userId}-${randomUUID()}@deleted.nannyapp.invalid\``, `phone: null`, `firebaseUid: \`deleted:${userId}:${randomUUID()}\``. The `.invalid` TLD can never receive mail, and the id plus UUID keeps all three `@unique` columns collision-free even if a row is deleted twice. `phone` is nullable, so null frees it outright.

`deleteMe(decoded, body)`:
1. `row = prisma.user.findFirst({ where: { firebaseUid: decoded.uid }, select: { id, role, deletedAt, nannyProfile: { select: { id } } } })`, with no `deletedAt` filter.
2. No row → the plan 3 discard: `firebaseAuth.deleteUser(decoded.uid)`, with `auth/user-not-found` counting as success. This is also how a retry finishes a deletion whose Firebase step failed (step 7).
3. `row.deletedAt` set → 409 `This account can't be removed here.` (e.g. a nanny an admin removed, whose uid was never scrambled).
4. `body.confirm !== 'delete-my-account'` → 409, same copy. This keeps plan 3's discard callers safe.
5. `row.role` not MOTHER/NANNY → 403 staff copy.
6. In one `prisma.$transaction(async (tx) => …)`:
   - Count bookings with `status in ACTIVE_BOOKING_STATUSES` where `motherId = row.id` OR `nannyProfileId = row.nannyProfile?.id`; if there are any, throw the 409 booking copy.
   - `tx.user.update({ where: { id }, data: { ...scrambleIdentity(id), deletedAt: now, deletionRequestedAt: now, isActive: false } })`.
   - Soft-delete the nanny profile, if any.
   - `tx.deviceToken.updateMany({ where: { userId: id, deletedAt: null }, data: { deletedAt: now } })`.

   `ACTIVE_BOOKING_STATUSES = [PENDING, APPROVED, PENDING_CONFIRMATION, CONFIRMED, IN_PROGRESS]` (the `BookingStatus` enum imported from Prisma). A booking row has no `deletedAt`.
7. After the commit: `firebaseAuth.deleteUser(decoded.uid)` (`user-not-found` counts as success). Any other error is rethrown, so the client sees 500 and retries. By then the uid no longer matches any row, so the retry lands in step 2 and deletes the Firebase user.
8. Apple audit: before step 6, `firebaseAuth.getUser(decoded.uid)` → `appleLinked = providerData.some(p => p.providerId === 'apple.com')`. After step 7, `console.warn('[auth] account deleted', { userId, role, appleLinked, appleRevoked: body.appleRevoked === true })`. It uses `warn` so an Android deletion with Apple linked and no revoke shows in the logs (spec).

Route (handler shape as today):
```ts
authRouter.delete('/me', requireFreshAuth, validateBody(DeleteMeRequestSchema), async (req, res, next) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    await deleteMe(req.firebaseUser, req.body);
    res.status(204).end();
  } catch (err) { next(err); }
});
```
Check that `validateBody` accepts a missing body (`req.body` is `{}` or `undefined` for a bodiless DELETE). If it rejects `undefined`, default it with `DeleteMeRequestSchema` wrapped as `z.preprocess((b) => b ?? {}, …)` in the shared schema, not in the route.

- [ ] **Step 1:** Shared schema + `delete-me.test.ts`: `{}` and `undefined` → `{}`; the confirm literal is accepted; `confirm: 'yes'` is refused.
- [ ] **Step 2: Unit tests (failing first):**
  - no row → `deleteUser`, `user-not-found` swallowed;
  - soft-deleted row → 409;
  - live row without confirm → 409 and no update;
  - ADMIN/OPERATOR/SUPERUSER → 403;
  - active booking (as mother; as nanny via profile id) → 409 booking copy and no update;
  - happy path → one update with scrambled fields, `deletedAt`, `deletionRequestedAt`, `isActive: false`; nanny profile and device tokens soft-deleted; `deleteUser(uid)` after the transaction;
  - `deleteUser` throws other → rethrown after the DB commit;
  - the audit warn carries `appleLinked`/`appleRevoked`;
  - `scrambleIdentity` gives distinct values on two calls and an `.invalid` email.
- [ ] **Step 3:** Implement. Move `discardUnfinishedAccount` into the new service as the no-row branch; drop its "plan 4 replaces this" comment; keep one `isUserNotFound` helper (export it from one place rather than duplicating).
- [ ] **Step 4:** Backend `tsc --noEmit`; unit files green. Commit `feat(auth): delete an account — scramble the row, delete the Firebase user`.

---

### Task 2: Backend integration — A29

**Files:**
- Create: `apps/backend/src/__integration__/journeys/a29-account-deletion.test.ts`
- Modify: `apps/backend/src/__integration__/journeys/a26-unfinished-accounts.test.ts` only if its "registered mother → 409" case needs the no-body wording in its title

Cases (factories `makeMother`, `makeNanny`, `makeBooking`, `makeOperator`; helpers `signInAs`, `authHeader`):
- mother, `{ confirm }` → 204:
  - the row has `deletedAt` and `deletionRequestedAt`, its email ends `@deleted.nannyapp.invalid`, `phone` is null and `firebaseUid` starts `deleted:`;
  - `firebaseAuth.getUser(uid)` rejects `user-not-found`;
  - `GET /auth/me` with the old token → 401 (revoked or deleted), not 200;
- **reuse:** after deletion, `makeMother` with the same email and phone succeeds (unique columns freed);
- mother, no body → 409; row and Firebase user untouched (plan 3 contract);
- mother with a CONFIRMED booking → 409 booking copy; nothing changed. The same booking COMPLETED → 204;
- nanny with an IN_PROGRESS booking on her profile → 409. Nanny with none → 204, profile soft-deleted, and `GET /nanny/nannies` no longer lists her;
- operator → 403;
- the deleted mother's device tokens have `deletedAt`.

- [ ] **Step 1:** Write A29; run it against the stack (local machine only — no PostGIS or emulator in the cloud container).
- [ ] **Step 2:** Full backend unit + integration suites green. Commit `test(auth): A29 account deletion`.

---

### Task 3: Mobile — `useDeleteAccount` with Apple revocation

**Files:**
- Modify: `apps/mobile/src/lib/socialAuth.ts` (add `getAppleAuthorizationCode`)
- Modify: `apps/mobile/src/hooks/useAuth.ts` (add `useDeleteAccount`)
- Test: `apps/mobile/src/hooks/__tests__/useAuth.deleteAccount.test.tsx`, and extend the socialAuth tests if they exist

**Interfaces:**
- Consumes: `clearLocalSession` (lib/session.ts), `apiStatusOf`, `getApiErrorMessage` (lib/api.ts), `COULD_NOT_CONNECT`.
- Produces: `getAppleAuthorizationCode(): Promise<string | null>` — `AppleAuthentication.signInAsync({ requestedScopes: [] })` → `result.authorizationCode`; `null` on `ERR_REQUEST_CANCELED`; otherwise throws `APPLE_FAILED`.
- Produces: `useDeleteAccount(): UseMutationResult<'deleted' | 'cancelled', MappedAuthError, void>`.

```ts
/**
 * Deletes the signed-in account. On iOS an Apple sign-in is revoked first
 * (Apple's rule for account deletion). Android has no way to revoke, so it
 * deletes anyway and the server logs it. The server does the deleting and
 * refuses (409) while a booking is active. Signing out afterwards can't fail
 * the deletion: the account is already gone.
 */
export function useDeleteAccount() {
  return useMutation<'deleted' | 'cancelled', MappedAuthError, void>({
    mutationFn: async () => {
      const user = auth().currentUser;
      if (!user) throw SESSION_LOST_ERROR;
      const appleLinked = user.providerData.some((p) => p.providerId === 'apple.com');
      let appleRevoked = false;
      if (appleLinked && Platform.OS === 'ios') {
        const code = await getAppleAuthorizationCode();
        if (!code) return 'cancelled';
        try {
          await auth().revokeToken(code);
          appleRevoked = true;
        } catch {
          throw { field: 'form', message: "We couldn't disconnect your Apple ID. Please try again." } satisfies MappedAuthError;
        }
      }
      try {
        await api.delete('/auth/me', { data: { confirm: 'delete-my-account', appleRevoked } });
      } catch (err) {
        const status = apiStatusOf(err);
        throw {
          field: 'form',
          message: status === 409 || status === 403 ? getApiErrorMessage(err) : COULD_NOT_CONNECT,
        } satisfies MappedAuthError;
      }
      await clearLocalSession().catch(() => undefined);
      return 'deleted';
    },
  });
}
```
Check `auth().revokeToken` is reachable through `@mobile/lib/firebase`'s `auth` export (RNFB 24 types declare it). Check `api.delete(url, { data })` is how the axios instance sends a DELETE body (it is plain axios).

- [ ] **Step 1: Tests first** (mock `api.delete`, `auth()`, `Platform.OS`, socialAuth, session):
  - phone-only → DELETE with `{ confirm, appleRevoked: false }`, then `clearLocalSession`, then `'deleted'`;
  - iOS + Apple → code → `revokeToken(code)` before DELETE, `appleRevoked: true`;
  - iOS + Apple cancelled → `'cancelled'`, no DELETE;
  - `revokeToken` throws → Apple copy, no DELETE;
  - Android + Apple → no revoke, DELETE with `appleRevoked: false`;
  - 409 → the server message, no sign-out;
  - network error → `COULD_NOT_CONNECT`, no sign-out;
  - `clearLocalSession` rejecting still resolves `'deleted'`.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Mobile jest + `tsc --noEmit` green. Commit `feat(mobile): delete the account, revoking Apple first on iOS`.

---

### Task 4: Mobile — "Delete account" buttons

**Files:**
- Modify: `apps/mobile/src/screens/parent/MotherProfileWalletScreen.tsx` (a list item under "Sign out", same `listItem` / `listItemDestructive` styles, `trash-outline` icon)
- Modify: `apps/mobile/src/screens/nanny/NannyProfileEditScreen.tsx` (under the Sign out button, as a text-style destructive button, not a second filled button; use the nanny-app-mobile-design skill)
- Modify (Q2 default): `apps/mobile/src/screens/auth/PendingReviewScreen.tsx`, `UploadIdScreen.tsx` (a small destructive text link under their Sign out)
- Test: the four screens' tests (create where missing, following `RoleSelectionScreen.test.tsx`)

Each button: `confirmDialog({ title: 'Delete your account?', message: "This deletes your profile and signs you out. It can't be undone.", confirmLabel: 'Delete account', destructive: true, onConfirm: () => deleteAccount.mutate(undefined, { onSuccess }) })`.
- `onSuccess('deleted')` → `router.replace('/')` then `noticeDialog({ title: 'Account deleted', message: 'Your account has been deleted.' })`. The root gate sends a signed-out user to sign-in.
- `onSuccess('cancelled')` → nothing.
- `onError(e)` → `noticeDialog({ title: "Couldn't delete your account", message: e.message })`.

While pending, the label reads `Deleting…` and both Sign out and Delete are disabled. Extract a shared `useConfirmDeleteAccount()` (dialog + mutation + routing) in `hooks/useAuth.ts` or a small `hooks/useConfirmDeleteAccount.ts`, so the four screens don't repeat it.

- [ ] **Step 1: Tests first:** tapping Delete opens the destructive dialog; confirming calls the mutation; `'deleted'` → `replace('/')` + notice; the 409 message is shown; `'cancelled'` does nothing.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Mobile jest + `tsc --noEmit` green. Commit `feat(mobile): delete account from the profile and pending screens`.

---

### Task 5: Device E2E — C17 + seeder + docs (local machine)

**Files:**
- Create: `apps/mobile/e2e/flows/c17-delete-account.yaml`
- Modify: `apps/mobile/e2e/accounts.mjs`, `apps/mobile/e2e/run.mjs` (params, seed list), `apps/mobile/e2e/README.md`, `Docs/testing/e2e-flows.md`, `apps/mobile/CLAUDE.md` (deletion note), `apps/backend/CLAUDE.md` (Known Gotchas: a deleted row is scrambled — look it up by id, never by email/phone)

Account (`accounts.mjs`, doc comment in the file's style): `ACCOUNTS.deletable = { phone: '+201100000010', email: 'e2e-delete-me@nannyapp.test', password: PASSWORD, role: 'MOTHER', firstName: 'Dina' }`. It is seeded fresh every run like the other `ACCOUNTS`. Its previous run's row is scrambled and so invisible to the upsert by email. Phones 08/09 belong to plan 3's C13/C15.

**C17:**
1. Sign in by SMS as `DELETABLE_PHONE` (`_sign-in.yaml`) → home.
2. Profile tab → "Delete account" → dialog `Delete your account?` → "Delete account" → sign-in screen, notice `Account deleted` → OK.
3. SMS sign-in again with the same number (+ `phone-otp`) → `We couldn't find an account for that number. Sign up first.` The Firebase user is gone and the phone-only account is discarded, so the phone is free.

- [ ] **Step 1:** Accounts, run.mjs, flow. Run on the lab per the `mobile-e2e-lab` skill: `node apps/mobile/e2e/run.mjs c17` twice, then `smoke c02 c13 c15` once.
- [ ] **Step 2:** Docs as listed. Mark the spec's plan 4 row delivered.
- [ ] **Step 3:** Commit `test(e2e): C17 delete account`.

---

## Before the combined PR (plans 1–4)

1. Sync `main` into the branch; fast-forward `feat/sign-in-landing`.
2. Backend unit + integration (all), shared, admin unit, mobile jest + `tsc`.
3. Device flows ×2 including c02, c11–c15 and c17; admin E2E.
4. Owner decides whether `e2e/flows/live` runs (still open).

## Self-review notes

- Spec coverage:
  - `scrambleIdentity`, `DELETE /auth/me`, the refusals (409 bookings, 403 staff) and immediate deletion → Task 1–2;
  - `useDeleteAccount` + Apple revocation (iOS revoke, Android logged) → Task 3;
  - buttons → Task 4;
  - C17 → Task 5.
- Deviation from the spec wording: the row branch of `DELETE /auth/me` needs an explicit `confirm` body, so plan 3's best-effort discard calls can't delete a registered account.
- Deviation, Q1: no recent-login gate unless the owner asks.
- Q2 adds the pending screens.
- Relies on plan 3:
  - re-attach ignores soft-deleted rows, and a uid with a soft-deleted row 404s (`cef9bb2`);
  - scrambling the uid means a deleted account's old uid matches no row at all, so a Firebase user left behind by a failed step 7 is a plain row-less leftover, and retrying `DELETE /auth/me` removes it.
- Out of scope: a PII purge; server-side Apple revocation (needs an Apple key); deleting uploads in Storage; Firestore location docs.
- Names used across tasks: `DeleteMeRequestSchema`, `scrambleIdentity`, `deleteMe`, `ACTIVE_BOOKING_STATUSES`, `getAppleAuthorizationCode`, `useDeleteAccount`, `useConfirmDeleteAccount`, `ACCOUNTS.deletable`, `DELETABLE_PHONE`.
