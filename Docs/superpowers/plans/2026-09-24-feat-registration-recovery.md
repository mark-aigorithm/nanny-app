# Registration Recovery Implementation Plan (plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Firebase account with no `users` row (a "leftover") is resumed instead of looping or being silently signed out; a row whose Firebase user was deleted is re-attached; a stale account holding a proven email can be reclaimed; and the collision/Step 3 retry paths stop dead-ending.

**Architecture:** Backend gains three recovery primitives: `DELETE /auth/me` (unfinished accounts only in this plan), `POST /auth/reclaim-email`, and an orphan re-attach inside `getMe`/`requireUser`. Mobile gains a status-carrying API error, one local sign-out routine, a draft seeded from the signed-in Firebase account (`lib/resumeSignUp.ts`), and a root gate (`hooks/useRootGate.ts`) that turns a 404 into "finish setting up" and any other error into a retryable "Couldn't connect". The SMS, email and SMS-reset doors, collision B, and Step 3 are rewired onto those.

**Tech Stack:** Express + Prisma 7 + firebase-admin (Jest unit/integration against the Auth emulator), Expo 54 + RN Firebase + zustand + React Query (jest-expo), Maestro device flows.

**Spec:** `Docs/superpowers/specs/2026-09-24-registration-hardening-design.md` (plan 3 row) and the master plan `C:\Users\markb\.claude\plans\sunny-exploring-hummingbird.md` (T4, T5, T7, T8, T9, rest of T10, c13–c15).

## Global Constraints

- Branch: `feat/sign-in-landing` (plans 1–4 ship as ONE PR). Run `git branch --show-current` before every commit; it must print `feat/sign-in-landing`.
- Stage files by name. Never `git add -A` / `git add .`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- NEVER load or use `apps/backend/.env` (it is live production). Integration tests run on `.env.test` with the local stack (`pnpm test:env`). Never run `e2e/flows/live`.
- Backend unit tests must mock `@backend/lib/config` or `@backend/lib/firebase` when the code under test imports them (unmocked, config loads the production `.env`).
- `requireFreshAuth` (from `@backend/middleware/auth.middleware`) on every new state-changing auth route.
- The server deletes a Firebase account only after confirming no `users` row (live OR soft-deleted) points at it.
- Copy (exact):
  - `COULD_NOT_CONNECT`: `Couldn't connect. Check your connection and try again.`
  - Resume header: `Finish setting up your account`; subtitle: `Signed in as {email or phone}. Tell us who you are to finish setting up.`
  - SMS-reset leftover notice: `Finish setting up your account first.`
  - Step 3 locked phone: `Your number is already verified.`
  - Email reclaim refused: `An account with this email already exists. Sign in instead.`
  - `DELETE /auth/me` with a row (until plan 4): 409 `This account can't be removed here.`
- Mobile: no `any`; type imports; Firebase via `@mobile/lib/firebase` only.
- Test commands:
  - shared: `pnpm --filter=@nanny-app/shared test`
  - backend unit: `pnpm --filter=@nanny-app/backend exec jest --selectProjects unit <path>`
  - backend integration (stack up): `pnpm --filter=@nanny-app/backend test:integration -- <path>`
  - mobile: `pnpm --filter=@nanny-app/mobile exec jest <path>` and `pnpm --filter=@nanny-app/mobile exec tsc --noEmit`
  - backend types: `pnpm --filter=@nanny-app/backend exec tsc --noEmit`

---

### Task 1: Backend — discard an unfinished account, reclaim a proven email

**Files:**
- Modify: `packages/shared/src/auth.ts` (add `ReclaimEmailRequestSchema`)
- Create: `apps/backend/src/services/unfinished-account.service.ts`
- Modify: `apps/backend/src/routes/auth.routes.ts`
- Test: `apps/backend/src/__tests__/unfinished-account.service.test.ts` (unit, firebase + prisma mocked)
- Test: `apps/backend/src/__integration__/journeys/a26-unfinished-accounts.test.ts`
- Modify: `apps/backend/src/__tests__/fresh-auth.routes.test.ts` (pin both new routes to `verifyIdToken(tok, true)`)

**Interfaces:**
- Produces (shared): `ReclaimEmailRequestSchema = z.object({ email: z.string().trim().toLowerCase().email(), emailVerificationToken: z.string().min(1) })`, `type ReclaimEmailRequest`.
- Produces (backend): `discardUnfinishedAccount(decoded: DecodedIdToken): Promise<void>`, `reclaimEmail(decoded: DecodedIdToken, body: ReclaimEmailRequest): Promise<void>`.
- Produces (HTTP): `DELETE /auth/me` → 204 | 409; `POST /auth/reclaim-email` → 204 | 400 | 409. Both `requireFreshAuth`. Task 3/6 call them.

Behaviour:

`discardUnfinishedAccount(decoded)`:
1. `prisma.user.findFirst({ where: { firebaseUid: decoded.uid }, select: { id: true } })` — no `deletedAt` filter: a soft-deleted row counts.
2. Row found → `throw errors.conflict("This account can't be removed here.")` (plan 4 replaces this branch with real deletion).
3. No row → `firebaseAuth.deleteUser(decoded.uid)`; an error with `code === 'auth/user-not-found'` counts as success; anything else rethrows.

`reclaimEmail(decoded, { email, emailVerificationToken })`:
1. `await assertVerificationTokenIsValid(email, emailVerificationToken)` (read-only — `/auth/register` spends it later).
2. Caller must be unfinished: a row (any `deletedAt`) for `decoded.uid` → `errors.conflict('An account with this email already exists. Sign in instead.')`.
3. `holder = await firebaseAuth.getUserByEmail(email)`; `auth/user-not-found` → return (nothing to reclaim).
4. `holder.uid === decoded.uid` → return.
5. `holder.disabled` → conflict (same copy).
6. A row with `firebaseUid: holder.uid` (any `deletedAt`) → conflict (same copy).
7. A live row with `email` whose `firebaseUid !== holder.uid` → conflict (same copy).
8. `await firebaseAuth.deleteUser(holder.uid)`; then `console.warn('[auth] reclaimed email from an unfinished account', { email, deletedUid: holder.uid, byUid: decoded.uid })` (the codebase's audit convention for auth events — see `markFirebaseEmailVerified`).

```ts
// apps/backend/src/services/unfinished-account.service.ts
import type { ReclaimEmailRequest } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { firebaseAuth, type DecodedIdToken } from '@backend/lib/firebase';
import { assertVerificationTokenIsValid } from '@backend/services/email-verification.service';

const EMAIL_TAKEN = 'An account with this email already exists. Sign in instead.';

function isUserNotFound(err: unknown): boolean {
  return (err as { code?: unknown })?.code === 'auth/user-not-found';
}

/** Any row — live or soft-deleted — means the uid is not an unfinished sign-up. */
async function hasAnyRow(firebaseUid: string): Promise<boolean> {
  const row = await prisma.user.findFirst({ where: { firebaseUid }, select: { id: true } });
  return row !== null;
}

export async function discardUnfinishedAccount(decoded: DecodedIdToken): Promise<void> {
  if (await hasAnyRow(decoded.uid)) {
    throw errors.conflict("This account can't be removed here.");
  }
  try {
    await firebaseAuth.deleteUser(decoded.uid);
  } catch (err) {
    if (!isUserNotFound(err)) throw err;
  }
}

export async function reclaimEmail(decoded: DecodedIdToken, body: ReclaimEmailRequest): Promise<void> {
  const email = body.email.trim().toLowerCase();
  await assertVerificationTokenIsValid(email, body.emailVerificationToken);
  if (await hasAnyRow(decoded.uid)) throw errors.conflict(EMAIL_TAKEN);

  let holder;
  try {
    holder = await firebaseAuth.getUserByEmail(email);
  } catch (err) {
    if (isUserNotFound(err)) return;
    throw err;
  }
  if (holder.uid === decoded.uid) return;
  if (holder.disabled || (await hasAnyRow(holder.uid))) throw errors.conflict(EMAIL_TAKEN);
  const rowOwner = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } });
  if (rowOwner) throw errors.conflict(EMAIL_TAKEN);

  await firebaseAuth.deleteUser(holder.uid);
  console.warn('[auth] reclaimed email from an unfinished account', {
    email,
    deletedUid: holder.uid,
    byUid: decoded.uid,
  });
}
```

Routes (in `auth.routes.ts`, following the existing handler shape; 204 with no body):

```ts
authRouter.delete('/me', requireFreshAuth, async (req, res, next) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    await discardUnfinishedAccount(req.firebaseUser);
    res.status(204).end();
  } catch (err) { next(err); }
});

authRouter.post('/reclaim-email', requireFreshAuth, validateBody(ReclaimEmailRequestSchema), async (req, res, next) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    await reclaimEmail(req.firebaseUser, req.body);
    res.status(204).end();
  } catch (err) { next(err); }
});
```

- [ ] **Step 1:** Add the shared schema + type export; `pnpm --filter=@nanny-app/shared test` green.
- [ ] **Step 2: Unit test (failing first)** `unfinished-account.service.test.ts`, mocking `@backend/db/prisma`, `@backend/lib/firebase`, `@backend/services/email-verification.service`. Cases: discard — row → 409, no row → `deleteUser(uid)`, `user-not-found` swallowed, other error rethrown; reclaim — invalid token rethrows 400 and deletes nothing, caller has row → 409, holder not found → resolves no delete, holder is caller → no delete, holder disabled → 409, holder has row (soft-deleted too) → 409, live email row → 409, happy path → `deleteUser(holder.uid)` once.
- [ ] **Step 3:** Implement service + routes; unit green.
- [ ] **Step 4:** Extend `fresh-auth.routes.test.ts`: `DELETE /auth/me` and `POST /auth/reclaim-email` call `verifyIdToken(token, true)`.
- [ ] **Step 5: Integration A26** (emulator, pattern from `a25-registration-hardening.test.ts`, helpers `createEmulatorUser`, `signInAs`, `authHeader`, `proveEmail`, `makeMother`):
  - row-less account → `DELETE /auth/me` 204 and `firebaseAuth.getUser(uid)` rejects `auth/user-not-found`;
  - registered mother → `DELETE /auth/me` 409 and Firebase user still exists;
  - reclaim: stale row-less account A holds email E; caller B (row-less) proves E (`proveEmail(E)`) → 204, A gone, token still spendable (`/auth/register` by B with that token later succeeds, or assert via `assertVerificationTokenIsValid`);
  - reclaim refused (409, A kept) when A has a row;
  - reclaim with a bad token → 400.
- [ ] **Step 6:** `tsc --noEmit` (backend), unit + A26 green. Commit `feat(auth): discard an unfinished account and reclaim a proven email`.

---

### Task 2: Backend — re-attach an orphaned row

**Files:**
- Modify: `apps/backend/src/services/auth.service.ts` (`getMe`, `requireUser`, new `reattachOrphanedRow`)
- Test: `apps/backend/src/__tests__/auth-reattach.test.ts` (unit, mocked)
- Test: `apps/backend/src/__integration__/journeys/a27-reattach-orphan.test.ts`

**Interfaces:**
- Produces: `getMe`/`requireUser` succeed for a caller whose uid has no row when exactly one live MOTHER/NANNY row matches the token's `phone_number`, or its `email` when `email_verified === true`, AND that row's `firebaseUid` is gone from Firebase (`getUser` → `auth/user-not-found`). Otherwise unchanged 404.

```ts
/**
 * A row whose Firebase user was deleted would lock its owner out forever: every
 * new sign-in mints a fresh uid that no row points at. When the new token
 * proves the row's phone (or, verified, its email) and the old uid is truly
 * gone, move the row onto the new uid. Guarded on the old uid so two racing
 * requests re-point it once. Any Firebase error other than user-not-found
 * aborts (rethrown) — never re-point on an uncertain answer.
 */
async function reattachOrphanedRow(decoded: DecodedIdToken): Promise<User | null> {
  const phone = decoded.phone_number ?? null;
  const email = decoded.email_verified === true && decoded.email ? decoded.email.toLowerCase() : null;
  if (!phone && !email) return null;

  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: { in: ['MOTHER', 'NANNY'] },
      OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
    },
  });
  if (candidates.length !== 1) return null;
  const row = candidates[0]!;
  if (row.firebaseUid === decoded.uid) return row;

  try {
    await firebaseAuth.getUser(row.firebaseUid);
    return null; // the old account still exists — not an orphan
  } catch (err) {
    if ((err as { code?: unknown })?.code !== 'auth/user-not-found') throw err;
  }

  const moved = await prisma.user.updateMany({
    where: { id: row.id, firebaseUid: row.firebaseUid, deletedAt: null },
    data: { firebaseUid: decoded.uid },
  });
  console.warn('[auth] re-attached an orphaned row', {
    userId: row.id,
    fromUid: row.firebaseUid,
    toUid: decoded.uid,
    moved: moved.count,
  });
  return prisma.user.findFirst({ where: { firebaseUid: decoded.uid, deletedAt: null } });
}
```

`requireUser` and `getMe` call it when the uid lookup finds no live row, before throwing the existing 404:

```ts
let user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
if (!user || user.deletedAt) user = await reattachOrphanedRow(decoded);
if (!user) throw errors.notFound('User profile not found. Please complete registration.');
```

Note: when the uid's own row is soft-deleted, `reattachOrphanedRow` still requires a *different* live row, so a deleted account is never revived. Check the Prisma `Role` enum spelling in `apps/backend/prisma/schema.prisma` and use the enum import if the literal strings don't typecheck.

- [ ] **Step 1: Unit test (failing first)** mocking prisma + firebase: no phone/email → 404; unverified email only → 404; two candidates → 404; old uid exists → 404; `getUser` throws other error → rethrown (500 path); orphan → `updateMany` guarded on old uid and the moved row returned; ADMIN rows never considered (assert the `role` filter in the `findMany` call).
- [ ] **Step 2:** Implement; unit green.
- [ ] **Step 3: Integration A27:** create mother (via the factory/registration helper) with phone P on uid U1; `firebaseAuth.deleteUser(U1)`; `createEmulatorUser` a new account with phone P (no row) → `GET /auth/me` 200, same `id`, `firebaseUid` now the new uid. Second case: old uid still exists → 404 and row untouched.
- [ ] **Step 4:** Full backend unit + integration suites green (`test:integration` with no path). Commit `feat(auth): re-attach a row whose Firebase account was deleted`.

---

### Task 3: Mobile groundwork — status-carrying errors, one local sign-out, discard

**Files:**
- Modify: `apps/mobile/src/lib/api.ts`
- Create: `apps/mobile/src/lib/session.ts`
- Modify: `apps/mobile/src/hooks/useAuth.ts` (`useSignOut`, new `useDiscardUnfinishedAccount`)
- Modify: `apps/mobile/src/hooks/useMe.ts` (retry via `isNotFound`)
- Modify: `apps/mobile/src/hooks/useSocialSignIn.ts` (`signOutAndForget` also calls `signOutOfGoogle`; delete `useLeaveSocialSignUp`)
- Modify: `apps/mobile/src/screens/auth/RoleSelectionScreen.tsx` (use `useDiscardUnfinishedAccount` where it used `useLeaveSocialSignUp`)
- Test: `apps/mobile/src/lib/__tests__/api.test.ts` (create or extend), `apps/mobile/src/lib/__tests__/session.test.ts`, `apps/mobile/src/hooks/__tests__/` (extend the existing useAuth/useSocialSignIn tests — find them with `ls apps/mobile/src/hooks/__tests__`)

**Interfaces:**
- Produces: `class ApiRequestError extends Error { readonly status: number | null }`; `unwrap`/`unwrapPaginated` throw it; `isNotFound(err: unknown): boolean` (true for `ApiRequestError` with status 404 or an axios error with response status 404); `apiStatusOf(err: unknown): number | null`.
- Produces: `clearLocalSession(): Promise<void>` in `lib/session.ts` — never leaves the app half-signed-out; rethrows the `auth().signOut()` error after cleanup.
- Produces: `useDiscardUnfinishedAccount(): UseMutationResult<void, Error, void>` — best-effort `DELETE /auth/me`, then always `clearLocalSession()`.
- Produces: `COULD_NOT_CONNECT` exported from `apps/mobile/src/lib/authErrors.ts` (`"Couldn't connect. Check your connection and try again."`).

```ts
// api.ts additions
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function apiStatusOf(err: unknown): number | null {
  if (err instanceof ApiRequestError) return err.status;
  if (axios.isAxiosError(err)) return err.response?.status ?? null;
  return null;
}

export function isNotFound(err: unknown): boolean {
  return apiStatusOf(err) === 404;
}
// unwrap/unwrapPaginated catch blocks become:
//   throw new ApiRequestError(getApiErrorMessage(err), apiStatusOf(err));
// (an envelope error with a 2xx response has status null)
```

```ts
// lib/session.ts
import { unregisterPushToken } from '@mobile/hooks/usePushNotifications';
import { auth } from '@mobile/lib/firebase';
import { queryClient } from '@mobile/lib/queryClient';
import { signOutOfGoogle } from '@mobile/lib/socialAuth';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/**
 * Everything a sign-out must leave behind, in one place, so every exit
 * (sign out, discard an unfinished sign-up, "Start again", delete account)
 * clears the same things. The push token goes first — its DELETE is signed
 * with the JWT that signOut() ends. Parked credentials and the draft are
 * cleared before the sign-out call so they go even if it throws; the Google
 * session, profile and query cache go in `finally` for the same reason.
 */
export async function clearLocalSession(): Promise<void> {
  await unregisterPushToken();
  usePendingLinkStore.getState().clear();
  useRegistrationDraftStore.getState().reset();
  try {
    await auth().signOut();
  } finally {
    await signOutOfGoogle();
    useUserProfileStore.getState().clear();
    queryClient.clear();
  }
}
```

`useSignOut` → `mutationFn: async () => { try { await clearLocalSession(); } catch (e) { throw mapFirebaseAuthError(e); } }`, no `onSuccess` (keep its return type `useMutation<void, MappedAuthError, void>`). Confirm `signOutOfGoogle` never throws (read `lib/socialAuth.ts`); if it can, wrap in try/catch inside `clearLocalSession`.

```ts
/**
 * "Use a different sign-up method" / leaving an unfinished sign-up. Asks the
 * server to delete the account (it refuses unless no row exists), then signs
 * out locally whatever happened — leaving must never fail, and a leftover the
 * server kept is resumed next time instead.
 */
export function useDiscardUnfinishedAccount() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        await api.delete('/auth/me');
      } catch {
        // Best-effort — see above.
      }
      await clearLocalSession().catch(() => undefined);
    },
  });
}
```

`useMe` retry: `retry: (failureCount, err) => !isNotFound(err) && failureCount < 2`.

- [ ] **Step 1: Tests first:** `ApiRequestError` status from a 404/409/500 axios error, `null` for an envelope error; `isNotFound`; `clearLocalSession` calls in order and still clears profile/cache + `signOutOfGoogle` when `signOut` throws (and rethrows); `useDiscardUnfinishedAccount` signs out even when the DELETE rejects; `signOutAndForget` path calls `signOutOfGoogle`.
- [ ] **Step 2:** Implement. Replace `useLeaveSocialSignUp` usages (grep the repo, incl. tests) with `useDiscardUnfinishedAccount`, delete the old hook and its now-false comment ("Never deletes…").
- [ ] **Step 3:** Grep for string-matching 404 detection (`'not found'`) in mobile and switch to `isNotFound`.
- [ ] **Step 4:** mobile jest (auth-related suites + new) and `tsc --noEmit` green. Commit `feat(mobile): status-carrying API errors, one local sign-out, discard an unfinished sign-up`.

---

### Task 4: Mobile — resume an unfinished sign-up (draft seed, root gate, role selection, wizard)

**Files:**
- Modify: `apps/mobile/src/store/registrationDraftStore.ts`
- Create: `apps/mobile/src/lib/resumeSignUp.ts`
- Create: `apps/mobile/src/hooks/useRootGate.ts`
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/src/hooks/useSocialSignIn.ts` (new-user path seeds via `seedDraftFromAccount`)
- Modify: `apps/mobile/src/lib/pendingLink.ts`, `apps/mobile/src/hooks/useAuth.ts`, `RegistrationStep3Screen.tsx` (rename `socialUid` → `signUpUid` only)
- Modify: `apps/mobile/src/screens/auth/RoleSelectionScreen.tsx`, `RegistrationStep1Screen.tsx`, `RegistrationEmailScreen.tsx`
- Test: `apps/mobile/src/lib/__tests__/resumeSignUp.test.ts`, `apps/mobile/src/hooks/__tests__/useRootGate.test.tsx`, extend screen tests if they exist for RoleSelection/Step1

**Interfaces:**
- Consumes: `isNotFound`, `COULD_NOT_CONNECT`, `useDiscardUnfinishedAccount`, `useSignOut` (Task 3).
- Produces (draft): `signUpUid: string | null` (renamed from `socialUid`, same meaning, now set for every account-backed draft), `isResume: boolean`, `accountPhone: string | null` (E.164 already on the Firebase account), `passwordEmail: string | null` (email of an existing `password` provider, lowercased). All default `false`/`null`.
- Produces: `seedDraftFromAccount(user: FirebaseUser, options?: { isResume?: boolean }): void` (default `isResume: true`).
- Produces: `useRootGate(): RootGate` where
  `type RootGate = { kind: 'wait' } | { kind: 'redirect'; href: Href } | { kind: 'error'; retry: () => void; signOut: () => void; isSigningOut: boolean }`.

```ts
// lib/resumeSignUp.ts
import type { FirebaseUser } from '@mobile/lib/firebase';
import { fromE164 } from '@mobile/lib/validation';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import type { AuthProvider } from '@mobile/types';

const COUNTRY_CODE = '+20';

function socialProviderOf(user: FirebaseUser): AuthProvider | null {
  const ids = user.providerData.map((p) => p.providerId);
  if (ids.includes('google.com')) return 'google';
  if (ids.includes('apple.com')) return 'apple';
  return null;
}

/**
 * Starts a draft from the account that is already signed in, for someone
 * whose sign-up stopped after Firebase created the account but before
 * /auth/register wrote the row. What the account already proves is carried
 * and locked: a Google/Apple-verified email (the social wizard), the phone on
 * the account (Step 1 locks it, Step 3 skips the SMS), and an existing
 * password for the same email (the create-password step is skipped).
 */
export function seedDraftFromAccount(user: FirebaseUser, options: { isResume?: boolean } = {}): void {
  const social = socialProviderOf(user);
  const authProvider: AuthProvider = social && user.email && user.emailVerified ? social : 'phone';
  const passwordEntry = user.providerData.find((p) => p.providerId === 'password');
  const [firstName = '', ...rest] = (user.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  const draft = useRegistrationDraftStore.getState();
  draft.reset();
  draft.patch({
    isResume: options.isResume ?? true,
    signUpUid: user.uid,
    authProvider,
    email: (user.email ?? passwordEntry?.email ?? '').trim().toLowerCase(),
    firstName,
    lastName: rest.join(' '),
    countryCode: COUNTRY_CODE,
    phone: fromE164(COUNTRY_CODE, user.phoneNumber ?? null),
    accountPhone: user.phoneNumber ?? null,
    passwordEmail: passwordEntry?.email?.trim().toLowerCase() ?? null,
  });
}
```

(Check `fromE164`'s signature in `lib/validation.ts` — SignInScreen calls `fromE164(countryCode, pending?.phoneHint ?? null)` — and `FirebaseUser.providerData[].email` typing in RNFB; adjust types, not behaviour.)

Root gate — move `index.tsx`'s logic into `useRootGate` and change only the no-profile branch:
- no user → guest ? `/(parent)/home` : `/(auth)/sign-in` (unchanged);
- fetching with no profile → `wait`;
- profile → existing role/approval/email routing (unchanged, moved verbatim);
- `isNotFound(meQuery.error)` and no profile → in an effect, once per uid: `seedDraftFromAccount(auth().currentUser)` (skip seeding if `useRegistrationDraftStore.getState().signUpUid === user.uid` — a wizard already under way for this account keeps its draft), then `redirect` to `/(auth)/role-selection`;
- any other error with no profile → `{ kind: 'error', retry: () => meQuery.refetch(), signOut: () => signOut.mutate() }`. Never auto-sign-out.

`index.tsx` renders `null` for `wait`, `<Redirect href=…/>` for `redirect`, and for `error` a centred view: title `Couldn't connect`, body `COULD_NOT_CONNECT`, primary `Button` "Retry", outline `Button` "Sign out" (disabled while signing out). Use existing `@mobile/components/ui` `Button` and theme colors; styles in `app/styles/index.styles.ts` or inline `StyleSheet.create` consistent with neighbours (check where other route-level styles live; screens use `src/screens/**/styles/*.styles.ts`).

`useSocialSignIn` new-user path: replace the `draft.reset(); draft.patch({...socialUid...})` block with
```ts
seedDraftFromAccount(user, { isResume: false });
useRegistrationDraftStore.getState().patch({
  role: role ?? null,
  authProvider: provider,
  socialCredential: result.credential,
  firstName: result.profile.firstName || useRegistrationDraftStore.getState().firstName,
  lastName: result.profile.lastName || useRegistrationDraftStore.getState().lastName,
  email: email.trim().toLowerCase(),
});
```
(`user` is non-null here — assert with the existing early returns.) This also carries a phone already linked to that Google account ("a social 404 also seeds a linked phone").

RoleSelectionScreen:
- `isResume = draft.isResume`; `isAccountBacked = isSocial || isResume`.
- Header: `isResume ? 'Finish setting up your account' : 'Create your account'`.
- Subtitle when `isResume`: `` `Signed in as ${draft.email || `${draft.countryCode} ${draft.phone}`}. Tell us who you are to finish setting up.` `` (social non-resume keeps its current copy).
- `handleContinue`: `isAccountBacked` → `patchDraft({ role })` only (keep the seed).
- "Use a different sign-up method" shows when `isAccountBacked`; it runs `useDiscardUnfinishedAccount` (Task 3). Afterwards the draft is reset, so the screen falls back to phone mode.
- Selected-role Google/Apple buttons stay hidden in account-backed mode (as today for social).

Step 1: phone `TextInput` `editable={!draft.accountPhone}` with a hint under it when locked: `Already verified on your account` (reuse `styles.verifiedHint`). Email stays `editable={!isSocial}`.

RegistrationEmailScreen `handleContinue` after `patch({ emailVerificationToken })`: if `draft.passwordEmail && draft.passwordEmail === email.trim().toLowerCase()` → skip create-password: push `role === 'nanny' ? '/(auth)/register-nanny-location' : '/(auth)/register-step-2'` (same targets as `CreatePasswordScreen.handleContinue`); else push create-password as today.

- [ ] **Step 1: Tests first** — `seedDraftFromAccount`: phone+password account → `authProvider 'phone'`, `accountPhone`, `passwordEmail`, email from password provider, `isResume true`; Google verified → `'google'`; Google unverified → `'phone'`; displayName split. `useRootGate` (mock `useMe`, stores, `auth`): 404 → seeds once and redirects to role-selection; 500 → `error` and `signOut` not called automatically; retry calls refetch; existing draft for same uid not re-seeded; profile routing unchanged (one case per branch is enough).
- [ ] **Step 2:** Rename `socialUid` → `signUpUid` everywhere (`grep -rn socialUid apps/mobile/src apps/mobile/app`), add fields, implement the rest.
- [ ] **Step 3:** mobile jest + `tsc --noEmit` green. Commit `feat(mobile): resume an unfinished sign-up instead of signing it out`.

---

### Task 5: Mobile — sign-in door fixes (SMS, email, SMS reset)

**Files:**
- Modify: `apps/mobile/src/hooks/useAuth.ts` (`useConfirmPhoneSignIn`, `useSignInWithEmail`, `useConfirmPhoneAndResetPassword`)
- Modify: `apps/mobile/src/screens/auth/SignInScreen.tsx`, `EmailSignInScreen.tsx`, `ForgotPasswordScreen.tsx`
- Test: extend the existing useAuth hook tests (`apps/mobile/src/hooks/__tests__/`)

**Interfaces:**
- Consumes: `isNotFound`, `COULD_NOT_CONNECT` (Task 3); root gate seeding (Task 4) — doors route a leftover to `/`, and the gate seeds + opens role selection.
- Produces: `useConfirmPhoneSignIn` variables `{ confirmation, code, phone: string }` (E.164), resolves `'signed-in' | 'needs-setup'`. `useConfirmPhoneAndResetPassword` resolves `'password-updated' | 'needs-setup'` (variables gain `phone`).

Shared helper in `useAuth.ts`:
```ts
type AccountCheck = 'exists' | 'unfinished' | 'phone-only-new';
/** GET /auth/me for the account just signed in. Throws COULD_NOT_CONNECT (after signing out, keeping any parked credential) on anything but 200/404. */
async function checkAccount(user: FirebaseUser): Promise<AccountCheck> {
  try {
    await api.get('/auth/me');
    return 'exists';
  } catch (error) {
    if (isNotFound(error)) {
      const phoneOnly = user.providerData.length > 0 && user.providerData.every((p) => p.providerId === 'phone');
      return phoneOnly ? 'phone-only-new' : 'unfinished';
    }
    useRegistrationDraftStore.getState().reset();
    await auth().signOut().catch(() => undefined);
    throw { field: 'form', message: COULD_NOT_CONNECT } satisfies MappedAuthError;
  }
}
```

`useConfirmPhoneSignIn`:
1. `confirm(code)`; on error, if `auth().currentUser?.phoneNumber === phone` (Android auto sign-in already consumed the code) continue, else throw mapped.
2. `checkAccount(user)`: `exists` → reset draft → `'signed-in'`; `phone-only-new` → `discardPhoneOnlyAccount(user)` → throw `NO_ACCOUNT_FOR_PHONE_ERROR` (keeps `live/sign-in-sms-no-account` valid); `unfinished` → `'needs-setup'`.
3. SignInScreen `onSuccess`: `await linkPendingCredential(); router.replace('/');` for both outcomes (the SMS just proved the account, so a parked Google/Apple credential may link onto a leftover too; the root gate then seeds with it). Pass `phone: phoneE164`.

`useSignInWithEmail`: after sign-in and draft reset, `checkAccount(credential.user)`: `exists` or `unfinished` → `await linkPendingCredential()`; return credential. (`phone-only-new` cannot happen with a password; treat as `unfinished`.) Errors from `checkAccount` propagate (`COULD_NOT_CONNECT`, parked credential kept). Update the hook's doc comment — the "root router signs a row-less account out" sentence is now false. EmailSignInScreen already `replace('/')` on success.

`useConfirmPhoneAndResetPassword`:
1. confirm (same auto-sign-in tolerance as above).
2. `checkAccount(user)`: `phone-only-new` → discard + `NO_ACCOUNT_FOR_PHONE_ERROR`; `unfinished` → return `'needs-setup'` WITHOUT `updatePassword`; `exists` → if `!user.email` discard + `NO_ACCOUNT_FOR_PHONE_ERROR` (unchanged guard), else `updatePassword` → `'password-updated'`.
3. ForgotPasswordScreen `onSuccess(outcome)`: `'needs-setup'` → `noticeDialog({ title: 'Finish setting up your account first.', message: "Your sign-up isn't finished yet. Pick up where you left off." })` (from `@mobile/store/confirmDialogStore`) then `router.replace('/')`; otherwise `router.replace('/')` as today.

- [ ] **Step 1: Tests first** (mock `api.get`, `auth()`): SMS — 200 → `'signed-in'`; 404 phone-only → deleted + phone error; 404 phone+password → `'needs-setup'`, nothing deleted; 500 → signed out, draft reset, `COULD_NOT_CONNECT`, pending store untouched; confirm throws but `currentUser.phoneNumber === phone` → proceeds. Email — 404 → `linkPendingCredential` called; 500 → `COULD_NOT_CONNECT`, pending kept. Reset — leftover → `'needs-setup'` and `updatePassword` not called; 500 → `COULD_NOT_CONNECT`.
- [ ] **Step 2:** Implement hooks + screens.
- [ ] **Step 3:** mobile jest + `tsc --noEmit` green. Commit `fix(mobile): every sign-in door resumes a leftover instead of dead-ending`.

---

### Task 6: Mobile — collision B and Step 3 retries

**Files:**
- Modify: `apps/mobile/src/lib/pendingLink.ts` (`abandonSocialSignUpForLink`, `deleteThrowawayAccount`)
- Modify: `apps/mobile/src/hooks/useAuth.ts` (`useConfirmPhoneAndLink`, `useLinkPhoneToCurrentUser`)
- Modify: `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx`
- Test: `apps/mobile/src/lib/__tests__/pendingLink.test.ts` (extend/create), useAuth hook tests, Step 3 screen test if one exists

**Interfaces:**
- Consumes: `api.delete('/auth/me')`, `POST /auth/reclaim-email` (Task 1), `apiStatusOf` (Task 3), draft `signUpUid`/`accountPhone`/`passwordEmail` (Task 4), `useSignOut`.
- Produces: `useConfirmPhoneAndLink` variables `{ confirmation: PhoneConfirmation | null; code: string; phone: string; email: string; password: string; emailVerificationToken: string | null }`. `useLinkPhoneToCurrentUser` variables `{ challenge: PhoneLinkChallenge | null; code; phone; signUpUid }`. Session-mismatch error carries `code: 'session-mismatch'`. `EMAIL_TAKEN_ERROR: MappedAuthError = { field: 'form', message: 'An account with this email already exists. Sign in instead.', code: 'auth/email-already-in-use' }`.

Collision B — `abandonSocialSignUpForLink(phoneHint)`:
- Guard unchanged except `socialUid` → `signUpUid`, and `socialCredential` may be null (a resumed social sign-up has none): the guard needs `user`, `authProvider !== 'phone'`, `signUpUid === user.uid`.
- Drop the social-only providers requirement: the account is this sign-up's own (proven by `signUpUid`) and the server re-checks it has no row.
- Delete order, returning the credential to park (`AuthCredential | null`):
  1. `user.delete()` → done, park `socialCredential`.
  2. `auth/requires-recent-login` → `api.delete('/auth/me')` → done (then `auth().signOut()` locally), park `socialCredential`.
  3. That failed → if `socialCredential`: `reauthenticateWithCredential(socialCredential)` + `delete()`; if that fails, `getSocialCredential(authProvider)` (fresh sheet) → reauth + delete; park the fresh one.
  4. Still not deleted → `auth().signOut()`; park the freshest credential anyway (the link at sign-in will fail harmlessly with credential-already-in-use and show the existing notice).
- Park only when a credential exists: `if (credential) usePendingLinkStore.getState().set({ provider: authProvider, credential, phoneHint })`. Reset the draft.
- Update the function's doc comment (the "social-only" paragraph is gone).

`useConfirmPhoneAndLink`:
1. `confirmation` null → require `auth().currentUser?.phoneNumber === phone` (the account already has it) else throw session-mismatch; otherwise `confirm(code)` as today.
2. Password: `const hasSamePassword = user.providerData.some((p) => p.providerId === 'password' && p.email?.toLowerCase() === email)`. If `!password`: require `hasSamePassword` (else throw `{ field: 'form', message: 'Please go back and create a password.' }`) and skip linking. Else link as today (unlink/relink on `provider-already-linked`).
3. On `auth/email-already-in-use` or `auth/credential-already-in-use` from the link: if `emailVerificationToken`, `await api.post('/auth/reclaim-email', { email, emailVerificationToken })`; 409 (`apiStatusOf(err) === 409`) → throw `EMAIL_TAKEN_ERROR`; other failure → throw `{ field: 'form', message: COULD_NOT_CONNECT }`; success → link once more (errors mapped). Without a token → throw `EMAIL_TAKEN_ERROR`.
4. `await user.getIdToken(true)` as today.

`useLinkPhoneToCurrentUser`: `challenge` null → require `user.phoneNumber === phone` (else session-mismatch); skip linking. Session-mismatch error: `{ field: 'form', message: 'Your session ended. Please start again.', code: 'session-mismatch' }` (used by both hooks).

Step 3:
- `phoneAlreadyVerified = draft.accountPhone !== null && draft.accountPhone === phoneE164 && auth().currentUser?.uid === draft.signUpUid`. When true: don't send on arrival, no OTP box/resend row; show `Your number is already verified.` where the code UI was; `canSubmit` ignores the code; `handleCompleteSetup` skips the `!challenge` and code-length checks and calls the confirm/link hook with `confirmation: null` / `challenge: null`.
- Pass `emailVerificationToken` and `phone: phoneE164` to `useConfirmPhoneAndLink`; `signUpUid` to `useLinkPhoneToCurrentUser`.
- In the step-1 catch: check `err.code === 'session-mismatch'` FIRST (before collision and before the `instantlyVerified` branch) → `setSessionEnded(true)` and `setFormError(err.message)`. Render, under the form error, a `Button` "Start again" (outline) that runs `useSignOut().mutate(undefined, { onSettled: () => router.dismissTo('/(auth)/sign-in') })`.
- Register failure: `if (isSocial && apiStatusOf(err) === 409)` → collision B exactly like the phone-taken branch (`setIsHandingOff(true); await abandonSocialSignUpForLink(phoneE164); router.dismissTo('/(auth)/sign-in')`). Otherwise the message as today.

- [ ] **Step 1: Tests first:** abandon — deletes a Google+phone account (no longer social-only); `requires-recent-login` → `api.delete('/auth/me')` then park; server delete fails → reauth path; no credential (resumed) → deletes, parks nothing; uid mismatch → signs out, parks nothing. ConfirmAndLink — `confirmation: null` with matching phone skips confirm; same-email password + empty password skips link; `email-already-in-use` → reclaim → relink; reclaim 409 → `EMAIL_TAKEN_ERROR`. LinkPhone — `challenge: null` with matching phone skips link; mismatch → `code: 'session-mismatch'`.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** mobile jest + `tsc --noEmit` green. Commit `fix(mobile): collision B deletes any sign-up-owned account; Step 3 survives retries, resumes and a taken email`.

---

### Task 7: Device E2E — C13, C14, C15 + seeder + docs

**Files:**
- Create: `apps/mobile/e2e/flows/c13-nanny-google-sign-up.yaml`, `c14-google-collision-email-door.yaml`, `c15-leftover-resume.yaml`
- Modify: `apps/mobile/e2e/accounts.mjs`, `apps/mobile/e2e/run.mjs` (wipe list, params), `apps/backend/test/e2e/seed-mobile.ts` (leftover seeding), `apps/mobile/e2e/README.md`, `Docs/testing/e2e-flows.md`, `apps/mobile/CLAUDE.md` (resume/root gate note), and QA scenarios if the doc lists flows (`grep -rn "c12" apps/admin/src --include=*.ts | head`)

**Interfaces:**
- Consumes: everything above; `advance.js` steps `phone-otp` and `email-otp`; the E2E Google picker (`e2eGooglePicker.email`, "Use this Google account"); `_launch.yaml`; C11 (`c11-google-sign-up.yaml`) and A10 (`a10-nanny-onboarding.yaml`) as templates.

Accounts (`accounts.mjs`), each with a doc comment in the file's style:
- `SOCIAL_NANNY_REGISTRATION = { phone: '+201100000008', email: 'e2e-google-nanny@nannyapp.test', role: 'NANNY' }` — wiped by phone+email.
- `EMAIL_DOOR_COLLISION = { email: <the seeded mother's email> }` — C14 uses the seeded mother (`ACCOUNTS.mother`), whose email already has a password account; the seeder must unlink `google.com` from her before each run (same as C12's cleanup does — reuse that code path by adding her to the unlink list, read `seed-mobile.ts` for how C12's SOCIAL_COLLISION unlink works).
- `LEFTOVER = { phone: '+201100000009', email: 'e2e-leftover@nannyapp.test', password: PASSWORD, firstName: 'Lina' }` — seeder: wipe by phone+email, then create a Firebase user `{ email, password, phoneNumber: phone, emailVerified: false }` with NO row (new env var `E2E_MOBILE_LEFTOVERS`, JSON array, handled right after the wipe in `seed-mobile.ts`).

Flows:
- **C13 nanny Google sign-up:** Sign up → "I'm a nanny" → Continue with Google → picker types `SOCIAL_NANNY_REGISTRATION_EMAIL` → STEP 1 OF 5: photo, phone, DOB, Continue → nanny location (tap map, street address `1 Test Street, Cairo`) → ID (placeholder picker) → professional details (fill minimum like A10) → Step 3: code via `advance.js phone-otp` with `SOCIAL_NANNY_REGISTRATION_PHONE_E164` (or the instant-verify path) → terms → Complete setup → notification permission → pending review screen text.
- **C14 Google collision at the email door:** Continue with Google on sign-in with the seeded mother's email → emulator raises `account-exists-with-different-credential` → banner `You already have an account…` → "Sign in with email" → mother email + `PASSWORD` → lands on mother home → last step asks the emulator that the mother's account now has `google.com` (copy C12's final `advance.js` check).
- **C15 leftover resume:** sign-in by SMS with `LEFTOVER_PHONE` (+ `phone-otp`) → `Finish setting up your account` → "I'm a mother" → Step 1: phone field shows the number and `Already verified on your account`; email prefilled; type first/last name, photo, DOB, Continue → email code from Mailpit (`email-otp`) → Continue lands on Step 2 (create-password skipped) → map + street → Step 3 shows `Your number is already verified.` (no code box) → terms → Complete setup → notification permission → home.

- [ ] **Step 1:** Accounts, seeder, run.mjs params/wipes. Backend `tsc --noEmit` for the seeder.
- [ ] **Step 2:** Write the three flows. Run on the lab per the `mobile-e2e-lab` skill: `node apps/mobile/e2e/run.mjs c13 c14 c15` twice; then `smoke c02 a10 c11 c12` once (regressions from Tasks 3–6). Read failure screenshots under `~/.maestro/tests/<ts>/`.
- [ ] **Step 3:** Docs: README flow table + accounts; `Docs/testing/e2e-flows.md` entries C13–C15; mobile CLAUDE.md: the root gate resumes a 404 and shows "Couldn't connect" on other errors (no auto sign-out). Mark in the social-auth spec (`Docs/superpowers/specs/2026-09-23-social-auth-google-apple-design.md`) that "only collision B may delete" is superseded (one line pointing at the hardening spec).
- [ ] **Step 4:** Commit `test(e2e): nanny Google sign-up, Google collision at the email door, leftover resume`.

---

## Self-review notes

- Spec coverage: T4 → Tasks 1–2; T5 → Task 3; T7 → Task 4; T8 → Task 5; T9 → Task 6 (abandon) + Task 4 (social 404 seeds phone); T10 rest → Task 6; c13–c15 → Task 7. `DELETE /auth/me` no-row branch pulled forward from plan 4 T3 (plan 4 replaces the 409 branch).
- Out of scope (spec): setting the email on a re-attached row's new Firebase account.
- Names used across tasks: `ApiRequestError`, `apiStatusOf`, `isNotFound`, `clearLocalSession`, `COULD_NOT_CONNECT`, `useDiscardUnfinishedAccount`, `seedDraftFromAccount`, `useRootGate`, `signUpUid`, `isResume`, `accountPhone`, `passwordEmail`, `EMAIL_TAKEN_ERROR`, `'session-mismatch'`.
