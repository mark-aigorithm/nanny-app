# Handoff — sign-in rework (plans 1–4), cloud → local machine

**Date:** 2026-09-24 · **Branch:** `feat/sign-in-landing-1hrpzy` (head: see `git log -1`; last code commit `3fe982a`)
**Status:** all code for plans 1–4 is written, cleaned up and pushed. Everything left needs the local test stack, an Android emulator or Maestro, none of which the cloud container has.

Plans 1–4 ship as **one PR**. Don't open it until the checklist in §4 is green.

---

## 1. Get the branch

```bash
git fetch origin
git checkout feat/sign-in-landing
git merge --ff-only origin/feat/sign-in-landing-1hrpzy   # the cloud session worked on the -1hrpzy branch
git push origin feat/sign-in-landing
pnpm install
cd apps/backend && pnpm db:generate && cd -
```

`feat/sign-in-landing` stopped at `8cd6942` (plan 3 Task 2). Everything after that is below.

## 2. What changed since `8cd6942`

### Plan 3 — registration recovery (Tasks 3–6; Tasks 1–2 were done before)
Plan: `Docs/superpowers/plans/2026-09-24-feat-registration-recovery.md`.

| Commit | Change |
|---|---|
| `cef9bb2` | Review fix for Task 2: re-attach only runs for a uid with **no row at all**. `firebaseUid` is unique, so re-pointing onto a uid that held a soft-deleted row returned a 500. |
| `a2cad73` | Task 3: `ApiRequestError`/`apiStatusOf`/`isNotFound` (`lib/api.ts`), `clearLocalSession` (`lib/session.ts`), `useDiscardUnfinishedAccount`, `COULD_NOT_CONNECT`. `useLeaveSocialSignUp` is deleted. |
| `f383d96` | Task 4: resume an unfinished sign-up. Adds `seedDraftFromAccount` (`lib/resumeSignUp.ts`), `useRootGate` + `CouldNotConnectScreen` (the root never signs out), draft `signUpUid` (renamed from `socialUid`), `isResume`, `accountPhone` and `passwordEmail`, a locked phone on Step 1, and a skip past create-password. |
| `4fc4909` | Task 5: the SMS, email and SMS-reset doors resume a leftover through `checkAccount` and `confirmCode` (which tolerates Android's auto sign-in). |
| `73b30f1` | Task 6: collision B deletes any account the sign-up owns. Step 3 gets the already-verified phone, `session-mismatch` → "Start again", reclaim-email on a taken email, and a 409 on the social path → collision B. |
| `99e3ff9` | Task 1 minors: no double email normalising, the invalid-token test asserts the 400, and a shared test for `ReclaimEmailRequestSchema`. |

### Plan 4 — account deletion (Tasks 1–4)
Plan: `Docs/superpowers/plans/2026-09-24-feat-account-deletion.md`. Owner decisions: Q1 no recent-login gate, Q2 buttons on the pending screens too, Q3 soft-delete only the nanny profile and device tokens.

| Commit | Change |
|---|---|
| `24ef6be` | `account-deletion.service.ts`: `scrambleIdentity`, `deleteMe`. `DELETE /auth/me` without a body still only discards a row-less account (409 for a row). With `{ confirm: 'delete-my-account' }` it deletes: 409 for an active booking, 403 for staff. One transaction scrambles the email, phone and uid, sets `deletedAt`/`deletionRequestedAt`/`isActive=false`, and soft-deletes the nanny profile and device tokens. The Firebase user is deleted afterwards; if that fails, a retry finishes the job through the no-row branch. |
| `d00a8c4` | The audit log is written before the Firebase step, so it survives that step failing. |
| `2458c89` | **A29 integration test — written, never run.** |
| `707c3c7` | `useDeleteAccount`: iOS revokes Apple first (`getAppleAuthorizationCode` → `auth().revokeToken`); Android deletes anyway and the server logs it. |
| `806708d` | `useConfirmDeleteAccount` and "Delete account" on the mother profile, nanny profile, Pending review and Upload ID screens. |

### Clean-up and bug-fix pass over the whole branch (all four plans, 74+ commits since `main`)
**Tidy-up:**
- `a8632f6` (backend): one Firebase-error helper (`lib/firebase-errors.ts`), shared copy constants, `getMe` reuses `requireUser`, current comments.
- `d63d610` (mobile hooks/lib): `useAuth.ts` has a section map and documented helpers, a shared `authErrorCode`, and dead code is gone.
- `4653ae8` + `089ef93` (screens): dead styles and props removed, named handlers, screen docs.
- `54b1721` (docs/E2E): the CLAUDE.md files, the E2E README and the specs match the code, old spec text is marked "Superseded", and unused E2E params are gone.

**Bugs fixed** (each has a test that failed first):
- `08eeb8e` — a soft-deleted booking blocked account deletion.
- `0026725` — `setVerifiedEmail` 500'd after spending the token when a soft-deleted row held the address; it now 409s first.
- `17c76b0` — reclaim-email deleted the squatter even when a soft-deleted row held the email, so the registration that followed could only 409. `updateProfile`/`submitId` now re-attach an orphan like `GET /auth/me` does.
- `f4203f3` — an email verification token could be spent twice under concurrency; the write is now guarded on `consumedAt`.
- `87b87d5` — SMS reset deleted the Firebase account of a registered row with no email, orphaning it again.
- `d382e9a` — three wrong messages. SMS reset on such an account said "no account". Deleting while signed out mentioned a code. Non-Firebase errors showed their raw text.
- `b09fb04` — Step 3 checked photo/ID only after spending the SMS code.
- `3fe982a` — the phone wizard's link step could replace a **registered** account's password. It now checks `/auth/me` first: a row → sign out + "This number already has an account. Sign in instead." with "Start again".
- `0e46afb`, `27f9192` — Forgot password kept stale SMS errors, and its Back fallback went to the wrong screen.
- `e99261f` — a Google/Apple nanny's Step 1 progress bar was off by one.
- `d4d7dbe` (admin) — a nanny's old age bands (e.g. `2-5`) had no chip, so an admin couldn't remove them.
- `128356e` (docs) — the E2E catalogue and C7 still said the photo picker stopped registration at step 1.
- `b466a64` (docs) — root and backend CLAUDE.md now say the backend deploys on **Vercel** today, and ECS is the planned target.

## 3. Verified in the cloud vs not

| Check | Cloud result |
|---|---|
| Mobile jest (full) | 501/501 ✅ · `tsc --noEmit` ✅ |
| Backend unit | 822/822 tests pass. 16 suites can't load without a `.env` (the config refuses to start); none of them failed a test. **Re-run locally.** |
| Backend `tsc` (`tsconfig.json` and `tsconfig.test.json`) | ✅ |
| Shared vitest | 78/78 ✅ |
| Admin vitest | 44/44 ✅ · `tsc` ✅ |
| Backend integration | **not run** (no PostGIS or Auth emulator) |
| Device E2E (Maestro) | **not run**; E2E `.mjs`/`.js` only `node --check`ed |
| Admin E2E (Playwright) | **not run** |

Integration tests most likely to need attention:
- **A29** (`a29-account-deletion.test.ts`, never run). It assumes (a) the emulator refuses a deleted user's old token with 401, and (b) a nanny with no location query is listed by `GET /nanny/nannies`.
- **A26** — reclaim now refuses when *any* row (soft-deleted included) holds the email.
- **A27** — `updateProfile`/`submitId` now re-attach.
- Anything that spends an email verification token (A14, A11, A24, A25), since the token is now spent with `updateMany`.

## 4. Local checklist, in order

1. **Stack:** `pnpm test:env` (PostGIS 55432, Mailpit, Auth emulator 9099, Paymob fake).
2. **Backend:** `pnpm --filter=@nanny-app/backend test:unit` then `pnpm --filter=@nanny-app/backend test:integration`. Fix A29 first if it fails; then A26, A27 and the token-spending journeys.
3. **Shared, admin, mobile:** `pnpm test:unit` (it should match the cloud numbers above).
4. **Plan 3 Task 7** — device flows **C13, C14, C15**, their seeder (`E2E_MOBILE_LEFTOVERS`) and docs. Spec in the plan 3 doc, "Task 7". Use the `mobile-e2e-lab` skill. `node apps/mobile/e2e/run.mjs c13 c14 c15` **twice**, then `smoke c02 a10 c11 c12` once.
   - C15 expects Step 3 to show `Your number is already verified.` with no code box.
   - Phones 08/09 are reserved for C13/C15.
5. **Plan 4 Task 5** — device flow **C17** (delete account), account `ACCOUNTS.deletable` (`+201100000010`), and docs. Spec in the plan 4 doc, "Task 5". Run `c17` twice, then `smoke c02 c13 c15`.
6. **Admin E2E:** backend `start:test` on :3001, then `pnpm --filter=@nanny-app/admin test:e2e`.
7. **Sync `main`** into `feat/sign-in-landing` (merge, don't rebase), re-run steps 2–3, then all device flows ×2 including c02, c11–c15 and c17.
8. Open the **one** combined PR for plans 1–4.

## 4b. Added after the local run (2026-09-25): no SMS for a number with no account

Built on top of the local session's `4c3750a..369e188` (C13–C15, the plan-3 review fixes, C17).

- `POST /auth/phone-account` (`phoneHasAccount` in `auth.service.ts`) is public and has no rate
  limit, like `/auth/availability`. It returns `hasAccount` true for a number a row holds (which
  includes an orphaned row), or for one a Firebase user holds with a non-phone provider (a leftover
  to resume).
- `useSendSignInCode` (SMS sign-in and SMS reset) asks it before sending. With no account, it
  shows the no-account message and sends no SMS; a parked Google/Apple credential gets the
  "Continue with Google" variant. A failed check fails open. Resends skip the check.
- **Changed device flows, re-run locally:** `c17` (its last leg no longer enters a code),
  `live/sign-in-sms-no-account` (same; still needs approval). Re-check `c12 c14 c15` and `smoke c02`
  too.
- **New integration cases:** A26 `POST /auth/phone-account` (a registered mother, a leftover, a
  stray, and an unknown number). Written, not run.

## 5. Open decisions (owner)

- **Live suite:** should `apps/mobile/e2e/flows/live` (real Firebase and SMS with console test numbers) run before the combined PR? It hasn't been run, and **must not be run without explicit approval.**

## 6. Follow-ups (not in this PR)

- **ECS vs Vercel.** The architecture diagram, stack table and `deploy-backend.yml` (a TODO stub) still describe the planned ECS Fargate pipeline, while the backend really runs on Vercel. The Deployment section now says so. Two things to decide: when ECS actually happens, and how production migrations are applied today (nothing in the repo runs `pnpm db:migrate` on deploy).
- **Re-attached rows have no email on their new Firebase account** (spec: out of scope). Such a user can't set a password by SMS reset ("This account can't have a password yet…") until the server copies the row's email onto the new Firebase user.
- **Server-side Apple revocation** needs an Apple key; Android deletions with Apple linked are only logged.
- A PII purge, deleting a deleted user's uploads in Storage, and her Firestore location docs are all out of scope.

## 7. Rules that still apply

- Never load or use `apps/backend/.env` (it's live production). Integration runs on `.env.test`.
- Stage files by name (never `git add -A`). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `git branch --show-current` before committing.
- Backend unit tests must mock `@backend/lib/config` or `@backend/lib/firebase`. Run single files with `--runTestsByPath`; a bare path runs the whole project.
- `requireFreshAuth` on every state-changing auth route.
