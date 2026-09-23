# Sign in with Google and Apple — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Continue with Google" (both platforms) and "Continue with Apple" (iOS) beside the existing phone + SMS, email + password and reset doors. New social users finish the wizard with a verified, linked phone; a Google/Apple identity is linked onto an existing account only after the user signs in to it the usual way.

**Architecture:**
- **Obtaining the credential:** native SDKs (`@react-native-google-signin/google-signin`, `expo-apple-authentication`) produce an ID token, which becomes a Firebase credential for RNFB `signInWithCredential`.
- **Routing after sign-in:** `GET /auth/me` decides.
  - 200 → home.
  - 404 → the social wizard: skips the email-code and password steps, then links the phone onto the Google/Apple account.
  - A collision parks the credential in an in-memory store, which is linked after the next successful SMS or password sign-in.
- **Backend:** `/auth/register` accepts the Firebase ID token's own `email_verified` claim in place of our email-OTP token.

**Tech Stack:**
- Mobile: Expo SDK 54 / RN 0.81, `@react-native-firebase/auth` 24, `@react-native-google-signin/google-signin`, `expo-apple-authentication`, `expo-crypto`, Zustand, TanStack Query.
- Backend: Express + Prisma + firebase-admin.
- Tests: Jest (backend unit/integration, Auth emulator), jest-expo + RNTL, Maestro.

## Global Constraints

- **Spec:** `Docs/superpowers/specs/2026-09-23-social-auth-google-apple-design.md`. Read it before Task 1.
- **Branch:** `feat/social-auth`.
  - Run `git branch --show-current` before the first commit of every task; another session may share this checkout.
  - Stage files **by name**. Never `git add -A` or `git add .`.
- **TypeScript:** strict, **no `any`**. Use `unknown` plus a type guard.
- **Mobile theme:** no hardcoded hex colors, font strings or shadows; use `@mobile/theme` tokens.
  - Screen styles live in `src/screens/<area>/styles/<screen>.styles.ts`.
  - Component styles live in `src/components/styles/<component>.styles.ts`.
- **Mobile boundaries:** no business logic in screens; it goes in hooks and `src/lib`. Shared types go in `src/types`.
- **`jest.mock` factories** may only close over identifiers prefixed `mock`. A static property on a mocked function (e.g. `auth.GoogleAuthProvider`) must be defined with a **getter**, because the factory runs before the `const mockX` lines are assigned. See `src/hooks/__tests__/useAuth.confirmPhoneAndLink.test.tsx:20-41`.
- **Credentials are never persisted.** `pendingLinkStore` and `registrationDraftStore` are plain in-memory Zustand stores, with no `persist`.
- **Apple is iOS-only.** Android never shows or calls it.
- **Live systems:**
  - Nothing in this plan touches live Firebase or the live DB. Every test runs against the Auth emulator and `nannyapp_test`.
  - `apps/backend/.env` is LIVE. Run backend scripts only through the test env loaders.
- **Copy, verbatim** (tests assert it):
  - Banner: `You already have an account. Sign in with your phone once to connect Google.` (or `Apple`)
  - Banner dismiss: `Not now`
  - Email hint: `Verified by Google` / `Verified by Apple`
  - Buttons: `Continue with Google`; Apple uses its own `CONTINUE` button type.
  - Backend 400: `Please verify your email address before finishing sign-up.`
- **Before each commit:** run `pnpm --filter=@nanny-app/backend typecheck` / `pnpm --filter=@nanny-app/mobile typecheck` for the packages you touched. ESLint is broken repo-wide; do not rely on it.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

## File Structure

**Shared / Backend**
- **Modify** `packages/shared/src/auth.ts`: `emailVerificationToken` becomes optional.
- **Modify** `apps/backend/src/services/auth.service.ts`: `registerUser` accepts a Firebase-verified email when there is no token.
- **Modify** `apps/backend/src/__tests__/auth-register-nanny-profile.test.ts`: the schema test flips, and a new describe covers the no-token path.
- **Modify** `apps/backend/test/auth.ts`: adds `signInWithGoogleAs()` (emulator IdP sign-in).
- **Create** `apps/backend/src/__integration__/journeys/a24-social-registration.test.ts`.
- **Modify** `apps/backend/test/e2e/seed-mobile.ts`: unlinks `google.com` from seeded accounts; wipe accepts an email-only spec.

**Mobile — config and native**
- **Modify** `apps/mobile/package.json`: three new dependencies.
- **Modify** `apps/mobile/app.config.ts`: `usesAppleSignIn`, the plugins, and `extra.googleWebClientId`.
- **Replace** `apps/mobile/google-services.json` and `apps/mobile/GoogleService-Info.plist`.
- **Modify** `apps/mobile/jest.setup.js`: global mocks for the three native modules.

**Mobile — logic**
- **Modify** `src/lib/firebase.ts`: exports `AuthCredential`.
- **Modify** `src/types/registration.ts` and `src/types/index.ts`: add `SocialProvider` and `AuthProvider`.
- **Modify** `src/lib/authErrors.ts`: optional `code` on `MappedAuthError`, `isMappedAuthError`, and two new codes.
- **Modify** `src/lib/validation.ts`: adds `fromE164`.
- **Create** `src/lib/socialAuth.ts`: Google/Apple credential acquisition plus the E2E seam.
- **Create** `src/store/e2eGooglePickerStore.ts` and `src/components/E2eGooglePickerHost.tsx` (with its styles): the E2E seam UI.
- **Create** `src/store/pendingLinkStore.ts`.
- **Modify** `src/store/registrationDraftStore.ts`: adds `authProvider` and `socialCredential`.
- **Create** `src/lib/pendingLink.ts`: `linkPendingCredential()` and `abandonSocialSignUpForLink()`.
- **Create** `src/hooks/useSocialSignIn.ts`.
- **Modify** `src/hooks/useAuth.ts`:
  - the provider-guarded discard;
  - Google sign-out;
  - `useSendPhoneLinkCode` and `useLinkPhoneToCurrentUser`.

**Mobile — UI**
- **Create** `src/components/SocialAuthButtons.tsx` (with its styles).
- **Modify** `src/screens/auth/SignInScreen.tsx` (with its styles): banner, phone prefill, social buttons, link after sign-in.
- **Modify** `src/screens/auth/EmailSignInScreen.tsx`: link after sign-in.
- **Modify** `src/screens/auth/RoleSelectionScreen.tsx` (with its styles): social buttons and social mode.
- **Modify** `src/screens/auth/RegistrationStep1Screen.tsx` (with its styles): social mode.
- **Modify** `src/screens/auth/RegistrationStep3Screen.tsx`: link the phone for social users; register without a token.
- **Modify** `app/_layout.tsx`: mounts the E2E picker host.

**E2E** (`apps/mobile/e2e`)
- **Modify** `accounts.mjs`, `run.mjs` and `scripts/advance.js`.
- **Create** `flows/c11-google-sign-up.yaml` and `flows/c12-google-collision.yaml`.
- **Modify** `README.md`.

---

### Task 1: Backend — register with a Firebase-verified email

**Files:**
- Modify: `packages/shared/src/auth.ts:96-100`
- Modify: `apps/backend/src/services/auth.service.ts` (`registerUser`)
- Modify: `apps/backend/src/__tests__/auth-register-nanny-profile.test.ts:247-256` plus a new describe
- Modify: `apps/backend/test/auth.ts`
- Create: `apps/backend/src/__integration__/journeys/a24-social-registration.test.ts`

**Interfaces:**
- Produces: `RegisterRequest.emailVerificationToken?: string`.
  - `POST /auth/register` with no token → 201 when the ID token has `email_verified: true` and `email === body.email` (compared case-insensitively); otherwise 400 `Please verify your email address before finishing sign-up.`
- Produces: `signInWithGoogleAs(email: string, opts?: { emailVerified?: boolean }): Promise<string>` in `apps/backend/test/auth.ts`.

- [ ] **Step 1: Write the failing unit tests**

In `apps/backend/src/__tests__/auth-register-nanny-profile.test.ts`, replace the test `'rejects either role’s payload with no token at the schema, before any service runs'` with:

```typescript
  it('lets a payload with no token through the schema — registerUser decides what proves the address', () => {
    const { emailVerificationToken: _nannyToken, ...nannyWithoutToken } = NANNY_BODY;
    const { emailVerificationToken: _motherToken, ...motherWithoutToken } = MOTHER_BODY;

    expect(RegisterRequestSchema.safeParse(nannyWithoutToken).success).toBe(true);
    expect(RegisterRequestSchema.safeParse(motherWithoutToken).success).toBe(true);
    // Present but empty is still malformed.
    expect(RegisterRequestSchema.safeParse({ ...MOTHER_BODY, emailVerificationToken: '' }).success).toBe(false);
  });
```

Append a new describe block at the end of the file:

```typescript
describe('registerUser — Google/Apple sign-up without a token', () => {
  const { emailVerificationToken: _unused, ...MOTHER_NO_TOKEN } = MOTHER_BODY;
  /** Firebase vouches for this exact address — what a Google or Apple sign-in yields. */
  const DECODED_GOOGLE = {
    uid: 'fb-1',
    email: 'Layla@Example.com',
    email_verified: true,
    phone_number: '+201004455667',
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it('creates the account when Firebase verified this exact address, spending no token', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(DECODED_GOOGLE, MOTHER_NO_TOKEN);

    expect(mockConsumeToken).not.toHaveBeenCalled();
    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.email).toBe('layla@example.com');
    expect(userData.isEmailVerified).toBe(true);
    expect(userData.emailVerifiedAt).toBeInstanceOf(Date);
    expect(res.isEmailVerified).toBe(true);
  });

  it('refuses when Firebase has not verified the address', async () => {
    const decoded = { uid: 'fb-1', email: 'layla@example.com', phone_number: '+201004455667' } as never;

    await expect(registerUser(decoded, MOTHER_NO_TOKEN)).rejects.toThrow(
      'Please verify your email address before finishing sign-up.',
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when the verified address is not the one being registered', async () => {
    const decoded = { uid: 'fb-1', email: 'someone-else@example.com', email_verified: true } as never;

    await expect(registerUser(decoded, MOTHER_NO_TOKEN)).rejects.toThrow(
      'Please verify your email address before finishing sign-up.',
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when the token carries no email at all', async () => {
    const decoded = { uid: 'fb-1', email_verified: true } as never;

    await expect(registerUser(decoded, MOTHER_NO_TOKEN)).rejects.toThrow(
      'Please verify your email address before finishing sign-up.',
    );
  });

  it('still spends a token when one is sent, even if Firebase also verified the address', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    await registerUser(DECODED_GOOGLE, MOTHER_BODY);

    expect(mockConsumeToken).toHaveBeenCalledWith(MOTHER_BODY.email, 'b'.repeat(64), tx);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter=@nanny-app/backend test:unit -- auth-register-nanny-profile`
Expected: FAIL. Either `MOTHER_NO_TOKEN` fails to type-check against `RegisterRequest` (the token is required), or the schema test fails.

- [ ] **Step 3: Make the token optional in the shared schema**

In `packages/shared/src/auth.ts`, replace the `emailVerificationToken` field and its comment with:

```typescript
    // Proof from POST /auth/email/verify that this address belongs to whoever
    // is registering — required unless Firebase itself already verified it. A
    // Google or Apple sign-up arrives without one: its Firebase ID token says
    // `email_verified: true` for exactly this address, and `registerUser`
    // checks that instead. Every other sign-up still brings the token, so no
    // account is ever created with an unproven address — which is what lets
    // receipts, payment records and account recovery rely on `users.email`.
    emailVerificationToken: z
      .string()
      .min(1, 'Please verify your email address before finishing sign-up.')
      .optional(),
```

- [ ] **Step 4: Accept the Firebase-verified email in `registerUser`**

In `apps/backend/src/services/auth.service.ts`, add this module-private helper just above `export async function registerUser`:

```typescript
/**
 * What a Google or Apple sign-up brings instead of our email OTP token: the
 * Firebase ID token itself says this exact address is verified. Only Firebase
 * sets `email_verified` — after Google or Apple vouched for the address, or
 * after one of its own verification flows — so a client cannot claim it. A
 * phone sign-up's linked email/password credential is still unverified at
 * this point, so that path keeps presenting a token.
 */
function assertFirebaseVerifiedEmail(decoded: DecodedIdToken, email: string): void {
  const tokenEmail = decoded.email?.trim().toLowerCase();
  if (decoded.email_verified !== true || !tokenEmail || tokenEmail !== email.trim().toLowerCase()) {
    throw errors.badRequest('Please verify your email address before finishing sign-up.');
  }
}
```

Inside `registerUser`, replace:

```typescript
  // Both roles prove their address mid-wizard and arrive holding the token for
  // it (the shared schema makes it mandatory), so no account is created with an
  // unproven address.
  const emailVerificationToken = body.emailVerificationToken;
  const created = await prisma.$transaction(async (tx) => {
    // Inside the transaction so the token isn't burned by a registration that
    // then fails — either the user exists with a verified address, or the token
    // is still spendable on a retry.
    await consumeVerificationToken(body.email, emailVerificationToken, tx);
```

with:

```typescript
  // Phone sign-ups prove their address mid-wizard and arrive holding the token
  // for it. Google and Apple sign-ups arrive without one, because Firebase has
  // already verified the provider's address — so check that instead. Either
  // way, no account is created with an unproven address.
  const emailVerificationToken = body.emailVerificationToken;
  if (!emailVerificationToken) {
    assertFirebaseVerifiedEmail(decoded, body.email);
  }
  const created = await prisma.$transaction(async (tx) => {
    // Inside the transaction so the token isn't burned by a registration that
    // then fails — either the user exists with a verified address, or the token
    // is still spendable on a retry.
    if (emailVerificationToken) {
      await consumeVerificationToken(body.email, emailVerificationToken, tx);
    }
```

In the same function, update the comment above `isEmailVerified: true,` inside `tx.user.create` to:

```typescript
        // Proven either way: the token above was spent for this address, or
        // Firebase's own token vouched for it.
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `pnpm --filter=@nanny-app/backend test:unit -- auth-register-nanny-profile`
Expected: PASS.

Then run: `pnpm --filter=@nanny-app/backend test:unit && pnpm --filter=@nanny-app/shared test`
Expected: all green.

- [ ] **Step 6: Add the emulator Google sign-in helper**

Append to `apps/backend/test/auth.ts`:

```typescript
/**
 * Signs in with Google against the emulator and returns a usable ID token.
 *
 * The Auth emulator accepts an unsigned JSON claim set in place of a real
 * Google ID token and creates the account on first use — exactly the state the
 * app is in after `signInWithCredential(GoogleAuthProvider.credential(...))`
 * for someone new: a Firebase user holding Google's address, and no row.
 */
export async function signInWithGoogleAs(
  email: string,
  { emailVerified = true }: { emailVerified?: boolean } = {},
): Promise<string> {
  const claims = JSON.stringify({ sub: `google-${email}`, email, email_verified: emailVerified });
  const response = await fetch(`${IDENTITY_TOOLKIT}/accounts:signInWithIdp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(claims)}&providerId=google.com`,
      requestUri: 'http://localhost',
      returnSecureToken: true,
      returnIdpCredential: true,
    }),
  });

  const body = (await response.json()) as { idToken?: string; error?: { message?: string } };

  if (!body.idToken) {
    throw new Error(
      `Emulator Google sign-in failed for ${email}: ${body.error?.message ?? response.status}. ` +
        'Is the Auth emulator running (pnpm test:emulator)?',
    );
  }

  return body.idToken;
}
```

- [ ] **Step 7: Write the integration journey**

Create `apps/backend/src/__integration__/journeys/a24-social-registration.test.ts`:

```typescript
/**
 * A24 — a Google or Apple sign-up registers without our email OTP.
 *
 * Firebase has already verified the provider's address, so `/auth/register`
 * takes the ID token's own `email_verified` claim in place of a token — but
 * only for that exact address, and only when it really is verified. The
 * Google account here is a real emulator account created by a real IdP
 * sign-in; nothing about the token path is stubbed.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader, signInWithGoogleAs } from '../../../test/auth';

function uniquePhone(): string {
  return `+2011${String(Date.now()).slice(-8)}`;
}

function uniqueEmail(): string {
  return `google-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

function registrationBody(email: string, phone: string) {
  return {
    firstName: 'Salma',
    lastName: 'Google',
    email,
    phone,
    dateOfBirth: '1993-02-03',
    role: 'MOTHER',
    termsAcceptedVersion: '1.0',
    latitude: 30.0444,
    longitude: 31.2357,
    address: '1 Test Street, Cairo',
  };
}

describe('A24 — social registration', () => {
  it('registers a Google sign-up that brings no token, starting out verified', async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    const idToken = await signInWithGoogleAs(email);

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send(registrationBody(email, phone));

    expect(response.status).toBe(201);
    expect(response.body.data.isEmailVerified).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { phone } });
    expect(row.email).toBe(email);
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it('refuses an address other than the one Google verified', async () => {
    const phone = uniquePhone();
    const idToken = await signInWithGoogleAs(uniqueEmail());

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send(registrationBody(uniqueEmail(), phone));

    expect(response.status).toBe(400);
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('refuses when the provider did not verify the address', async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    const idToken = await signInWithGoogleAs(email, { emailVerified: false });

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send(registrationBody(email, phone));

    expect(response.status).toBe(400);
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });
});
```

- [ ] **Step 8: Run the journey against the test stack**

Bring the stack up if it isn't already (`pnpm test:env` from the repo root; see the `test-stack` memory). Then run:

```bash
pnpm --filter=@nanny-app/backend test:integration -- --testPathPatterns a24-social-registration
```

Expected: 3 passed.

If only the third test fails, with a 201, the emulator is marking google.com addresses verified regardless of the claim. In that case:
- Delete that one test and add a comment saying the emulator ignores `email_verified: false` for Google. The unit test in Step 1 covers the branch.
- Report it in your summary.

Then run the whole integration suite, which should be all green (A14's "no token" case still gets a 400):

```bash
pnpm --filter=@nanny-app/backend test:integration
```

Use `--testPathPatterns` for one file. Never pass a positional path with `--selectProjects`: that runs the whole suite in parallel.

- [ ] **Step 9: Typecheck and commit**

```bash
pnpm --filter=@nanny-app/shared typecheck && pnpm --filter=@nanny-app/backend typecheck
git add packages/shared/src/auth.ts apps/backend/src/services/auth.service.ts apps/backend/src/__tests__/auth-register-nanny-profile.test.ts apps/backend/test/auth.ts apps/backend/src/__integration__/journeys/a24-social-registration.test.ts
git commit -m "feat(auth): register Google and Apple sign-ups on Firebase's verified email

A social sign-up has no email OTP token to spend, but Firebase has already
verified the provider's address, and only Firebase can set email_verified.
Accept that claim in place of the token, for the exact address only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Mobile — native dependencies, config and test mocks

**Files:**
- Replace: `apps/mobile/google-services.json`, `apps/mobile/GoogleService-Info.plist`
- Modify: `apps/mobile/package.json` (via `expo install`), `apps/mobile/app.config.ts`, `apps/mobile/jest.setup.js`
- Modify: `apps/mobile/src/lib/firebase.ts`, `apps/mobile/src/types/registration.ts`, `apps/mobile/src/types/index.ts`

**Interfaces:**
- Produces: `Constants.expoConfig.extra.googleWebClientId: string`.
- Produces: `export type AuthCredential = FirebaseAuthTypes.AuthCredential` from `@mobile/lib/firebase`.
- Produces: `export type SocialProvider = 'google' | 'apple'` and `export type AuthProvider = 'phone' | SocialProvider` from `@mobile/types`.
- Produces: global jest mocks for `@react-native-google-signin/google-signin`, `expo-apple-authentication` and `expo-crypto`, so any screen importing them renders in jest.

- [ ] **Step 1: Install the Firebase config files the owner downloaded**

These carry the new OAuth clients: the Android debug and release SHA-1 clients, the web client (`client_type: 3`), and iOS `CLIENT_ID`/`REVERSED_CLIENT_ID`.

```bash
cp "/d/Downloads/google-services (2).json" /d/Projects/nanny-app/apps/mobile/google-services.json
cp "/d/Downloads/GoogleService-Info (1).plist" /d/Projects/nanny-app/apps/mobile/GoogleService-Info.plist
cd /d/Projects/nanny-app/apps/mobile && git diff --stat -- google-services.json GoogleService-Info.plist
```

Expected: both files changed. Only the OAuth client entries and the plist's `CLIENT_ID`, `REVERSED_CLIENT_ID` and `ANDROID_CLIENT_ID` are added. Check with `git diff`, but **do not paste the API key into any output**.

- [ ] **Step 2: Install the native packages at SDK-54-compatible versions**

```bash
cd /d/Projects/nanny-app/apps/mobile && npx expo install @react-native-google-signin/google-signin expo-apple-authentication expo-crypto
```

Expected: all three are added to `apps/mobile/package.json` `dependencies`, and `pnpm-lock.yaml` is updated.

- [ ] **Step 3: Wire the config**

In `apps/mobile/app.config.ts`:

Add at the top, below the `ExpoConfig` import:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```

Add below `GOOGLE_PLACES_API_KEY`:

```typescript
/**
 * The OAuth "web" client Firebase created when Google sign-in was enabled.
 * Native Google Sign-In needs it as `webClientId` to mint an ID token that
 * Firebase accepts. Read from google-services.json rather than copied, so it
 * can never drift from the file Firebase issues.
 */
function readGoogleWebClientId(): string {
  type GoogleServices = {
    client?: { oauth_client?: { client_id: string; client_type: number }[] }[];
  };
  const file = JSON.parse(
    readFileSync(join(__dirname, 'google-services.json'), 'utf8'),
  ) as GoogleServices;
  const web = file.client
    ?.flatMap((c) => c.oauth_client ?? [])
    .find((o) => o.client_type === 3);
  if (!web) {
    throw new Error(
      'google-services.json has no web OAuth client (client_type 3). ' +
        'Re-download it from Firebase after enabling Google sign-in.',
    );
  }
  return web.client_id;
}

const GOOGLE_WEB_CLIENT_ID = readGoogleWebClientId();
```

In `ios`, directly after `googleServicesFile`, add:

```typescript
    // Sign in with Apple capability. EAS enables it on the App ID at build
    // time. Apple is offered on iOS only — see lib/socialAuth.ts.
    usesAppleSignIn: true,
```

In `plugins`, after `"@react-native-firebase/messaging",`, add:

```typescript
    // Native Google account picker. No options: with ios.googleServicesFile
    // set, the plugin reads REVERSED_CLIENT_ID from the plist itself.
    '@react-native-google-signin/google-signin',
    'expo-apple-authentication',
```

In `extra`, after `googlePlacesApiKey`, add:

```typescript
    // Web OAuth client id for native Google Sign-In — read by lib/socialAuth.ts.
    googleWebClientId: GOOGLE_WEB_CLIENT_ID,
```

- [ ] **Step 4: Verify the resolved config**

```bash
cd /d/Projects/nanny-app/apps/mobile && npx expo config --type public | grep -E "googleWebClientId|usesAppleSignIn|google-signin|apple-authentication"
```

Expected: `googleWebClientId: '936472549582-scl1ot7iaqj4tjr257nnt9gob0t7njht.apps.googleusercontent.com'`, `usesAppleSignIn: true`, and both plugin names.

- [ ] **Step 5: Add the shared types and the credential type**

In `apps/mobile/src/types/registration.ts`, append:

```typescript
/** A third-party identity provider the app signs in with. Apple is iOS-only. */
export type SocialProvider = 'google' | 'apple';

/** How a registration started: the phone wizard, or a Google/Apple sign-in. */
export type AuthProvider = 'phone' | SocialProvider;
```

In `apps/mobile/src/types/index.ts`, change `export type { Role, Child } from './registration';` to:

```typescript
export type { Role, Child, SocialProvider, AuthProvider } from './registration';
```

In `apps/mobile/src/lib/firebase.ts`, append after the existing type exports:

```typescript
export type AuthCredential = FirebaseAuthTypes.AuthCredential;
```

- [ ] **Step 6: Add global jest mocks for the native modules**

In `apps/mobile/jest.setup.js`, after the last existing `jest.mock(...)` block, append:

```javascript
// 9. Google Sign-In, Apple Authentication and expo-crypto are native modules
//    with no JS implementation under jest. Any screen rendering the social
//    buttons reaches them through lib/socialAuth. The defaults: Google's sheet
//    is never opened, Apple is unavailable (so the Apple button renders
//    nothing), and hashing is deterministic. Tests that exercise a sign-in
//    override these per file.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    signOut: jest.fn().mockResolvedValue(null),
  },
  isErrorWithCode: (error) =>
    typeof error === 'object' && error !== null && typeof error.code === 'string',
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: () => null,
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'raw-nonce'),
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
```

Update the header comment's count ("mocks 4–8 follow…") only if it would otherwise be wrong.

- [ ] **Step 7: Check the installed API matches what the plan uses**

Open the installed type definitions and confirm each name exists:

```bash
cd /d/Projects/nanny-app/apps/mobile
grep -rn "SIGN_IN_CANCELLED\|IN_PROGRESS\|PLAY_SERVICES_NOT_AVAILABLE" node_modules/@react-native-google-signin/google-signin/lib/typescript --include=*.d.ts | head
grep -rn "type SignInResponse\|type SignInSuccessResponse\|type CancelledResponse" node_modules/@react-native-google-signin/google-signin/lib/typescript --include=*.d.ts | head
grep -n "export declare function signInAsync\|isAvailableAsync\|ERR_REQUEST_CANCELED" -r node_modules/expo-apple-authentication/build | head
grep -n "export declare function randomUUID\|export declare function digestStringAsync" node_modules/expo-crypto/build/*.d.ts
```

Expected:
- `signIn()` resolves to `{ type: 'success', data: { idToken, user: { givenName, familyName, email } } } | { type: 'cancelled', data: null }`.
- `statusCodes` has the three names.
- `signInAsync` rejects with code `ERR_REQUEST_CANCELED` on cancel.

If a name differs, use the installed name in Task 4 and in the jest mock above, and note it in your summary.

- [ ] **Step 8: Typecheck, run the mobile suite, commit**

```bash
cd /d/Projects/nanny-app && pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test
git add apps/mobile/google-services.json apps/mobile/GoogleService-Info.plist apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.config.ts apps/mobile/jest.setup.js apps/mobile/src/lib/firebase.ts apps/mobile/src/types/registration.ts apps/mobile/src/types/index.ts
git commit -m "build(mobile): add Google Sign-In and Sign in with Apple native modules

New Firebase config files carry the Google OAuth clients. The web client id
is read from google-services.json at config time so it cannot drift. Apple
is iOS-only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck clean, mobile suite green (233+).

---

### Task 3: Phone guards delete only phone-only accounts

**Files:**
- Modify: `apps/mobile/src/hooks/useAuth.ts:27-40` (`discardPhoneOnlyAccount`)
- Modify: `apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx`
- Modify: `apps/mobile/src/screens/auth/__tests__/ForgotPasswordScreen.test.tsx:87,111`

**Interfaces:**
- Consumes: `FirebaseUser.providerData: { providerId: string }[]`.
- Produces: no API change. `useConfirmPhoneSignIn` / `useConfirmPhoneAndResetPassword` delete the stray account only when its **sole** provider is `phone`; otherwise they sign out.

- [ ] **Step 1: Write the failing test**

In `SignInScreen.test.tsx`:

Change the `mockCurrentUser` type and the `beforeEach` assignment to carry providers:

```typescript
let mockCurrentUser: {
  delete: jest.Mock;
  email: string | null;
  providerData: { providerId: string }[];
} | null = null;
```

```typescript
  mockCurrentUser = { delete: mockDelete, email: 'mona@example.com', providerData: [{ providerId: 'phone' }] };
```

Add this test after `'signs out if delete fails when no profile exists'`:

```typescript
it('signs out rather than deleting when the stray account also holds a Google identity', async () => {
  // A Google sign-up whose /auth/register failed after its phone was linked:
  // deleting would take the Google identity with it.
  mockCurrentUser = {
    delete: mockDelete,
    email: 'mona@gmail.com',
    providerData: [{ providerId: 'google.com' }, { providerId: 'phone' }],
  };
  mockGet.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404, data: { error: 'User profile not found. Please complete registration.' } },
  });
  mockSignOut.mockResolvedValueOnce(undefined);

  renderScreen();

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567894');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('signIn.code'), '444444');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(mockDelete).not.toHaveBeenCalled();
  expect(
    screen.getByText("We couldn't find an account for that number. Sign up first."),
  ).toBeTruthy();
});
```

In `ForgotPasswordScreen.test.tsx`, add `providerData: [{ providerId: 'phone' }]` to the two phone-only users at lines 87 and 111:

```typescript
  mockCurrentUser = { email: null, updatePassword: mockUpdatePassword, delete: mockDelete, providerData: [{ providerId: 'phone' }] };
```

Widen that file's `mockCurrentUser` type to include `providerData?: { providerId: string }[]`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/screens/auth/__tests__/SignInScreen.test.tsx src/screens/auth/__tests__/ForgotPasswordScreen.test.tsx`
Expected: FAIL. The new test sees `mockDelete` called once.

- [ ] **Step 3: Guard the discard on providers**

Replace `discardPhoneOnlyAccount` in `apps/mobile/src/hooks/useAuth.ts` with:

```typescript
/**
 * Discards the account Firebase just minted for a number that turned out to
 * have no application account behind it — but only when a phone number is all
 * it holds. Anything more (a password, Google, Apple) is a real sign-up that
 * stalled before its row was written; deleting it would take the user's
 * Google or Apple identity with it, so sign out instead and let them resume.
 * Best-effort: if the delete itself fails we must still not leave the app
 * signed in as an account nothing recognizes, so fall back to signing out — a
 * retry re-confirms into the same uid either way.
 */
async function discardPhoneOnlyAccount(user: FirebaseUser): Promise<void> {
  const phoneOnly =
    user.providerData.length > 0 &&
    user.providerData.every((provider) => provider.providerId === 'phone');
  if (phoneOnly) {
    try {
      await user.delete();
      return;
    } catch {
      // Fall through to signing out.
    }
  }
  await auth().signOut().catch(() => undefined);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/screens/auth/__tests__`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /d/Projects/nanny-app && pnpm --filter=@nanny-app/mobile typecheck
git add apps/mobile/src/hooks/useAuth.ts apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx apps/mobile/src/screens/auth/__tests__/ForgotPasswordScreen.test.tsx
git commit -m "fix(auth): only delete a stray account when a phone is all it holds

Social sign-in means a row-less account can now carry a Google or Apple
identity; deleting it on the next SMS sign-in would destroy that identity.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `socialAuth` — Google/Apple credentials and the E2E picker

**Files:**
- Modify: `apps/mobile/src/lib/authErrors.ts`
- Create: `apps/mobile/src/lib/socialAuth.ts`
- Create: `apps/mobile/src/store/e2eGooglePickerStore.ts`
- Create: `apps/mobile/src/components/E2eGooglePickerHost.tsx`, `apps/mobile/src/components/styles/e2e-google-picker-host.styles.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Test: `apps/mobile/src/lib/__tests__/socialAuth.test.ts`, `apps/mobile/src/components/__tests__/E2eGooglePickerHost.test.tsx`

**Interfaces:**
- Consumes: `AuthCredential`, `SocialProvider` (Task 2).
- Produces, in `@mobile/lib/authErrors`:
  - `MappedAuthError = { field: AuthErrorField; message: string; code?: string }`
  - `isMappedAuthError(value: unknown): value is MappedAuthError`
- Produces, in `@mobile/lib/socialAuth`:
  ```typescript
  export type SocialCredentialResult = {
    provider: SocialProvider;
    credential: AuthCredential;
    profile: { firstName: string; lastName: string; email: string | null };
  };
  export const SOCIAL_PROVIDER_LABEL: Record<SocialProvider, string>;
  export function isAuthEmulator(): boolean;
  export function getGoogleCredential(): Promise<SocialCredentialResult | null>; // null = cancelled
  export function getAppleCredential(): Promise<SocialCredentialResult | null>;  // null = cancelled
  export function getSocialCredential(provider: SocialProvider): Promise<SocialCredentialResult | null>;
  export function isAppleSignInAvailable(): Promise<boolean>;
  export function signOutOfGoogle(): Promise<void>; // best-effort, never throws
  ```
  The two getters throw a `MappedAuthError` (`field: 'form'`) on SDK failure.
- Produces: `requestE2eGoogleEmail(): Promise<string | null>` (store) and `<E2eGooglePickerHost />`.

- [ ] **Step 1: Extend the error type**

In `apps/mobile/src/lib/authErrors.ts`:

Replace the `MappedAuthError` type with:

```typescript
export type MappedAuthError = {
  field: AuthErrorField;
  message: string;
  /**
   * The Firebase code, set only where a caller branches on it (e.g.
   * `auth/credential-already-in-use` starting the collision flow). The copy in
   * `message` stays the thing screens show.
   */
  code?: string;
};

export function isMappedAuthError(value: unknown): value is MappedAuthError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { field?: unknown }).field === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}
```

Add two cases to the `switch` in `mapFirebaseAuthError`, before `default`:

```typescript
    case 'auth/account-exists-with-different-credential':
      return {
        field: 'form',
        message: 'You already have an account with this email. Sign in with your phone once to connect it.',
      };
    case 'auth/user-disabled':
      return { field: 'form', message: 'This account has been disabled. Contact support for help.' };
```

- [ ] **Step 2: Write the failing `socialAuth` tests**

Create `apps/mobile/src/lib/__tests__/socialAuth.test.ts`:

```typescript
import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';

let mockExtra: Record<string, unknown> = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

const mockGoogleCredential = jest.fn((token: string) => ({ providerId: 'google.com', token, secret: '' }));
const mockAppleCredential = jest.fn((token: string, secret: string) => ({ providerId: 'apple.com', token, secret }));
// Getters: the factory runs before the consts above are assigned.
jest.mock('@mobile/lib/firebase', () => {
  const authFn = () => ({});
  Object.defineProperty(authFn, 'GoogleAuthProvider', {
    enumerable: true,
    get: () => ({ credential: mockGoogleCredential }),
  });
  Object.defineProperty(authFn, 'AppleAuthProvider', {
    enumerable: true,
    get: () => ({ credential: mockAppleCredential }),
  });
  return { auth: authFn };
});

import {
  getAppleCredential,
  getGoogleCredential,
  isAppleSignInAvailable,
  signOutOfGoogle,
} from '@mobile/lib/socialAuth';
import { useE2eGooglePickerStore } from '@mobile/store/e2eGooglePickerStore';

const mockSignIn = GoogleSignin.signIn as jest.Mock;
const mockHasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;
const mockConfigure = GoogleSignin.configure as jest.Mock;
const mockGoogleSignOut = GoogleSignin.signOut as jest.Mock;
const mockAppleSignIn = AppleAuthentication.signInAsync as jest.Mock;
const mockAppleAvailable = AppleAuthentication.isAvailableAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockExtra = { googleWebClientId: 'web-client-id' };
  mockHasPlayServices.mockResolvedValue(true);
});

describe('getGoogleCredential', () => {
  it('turns the Google ID token into a Firebase credential and passes the profile along', async () => {
    mockSignIn.mockResolvedValue({
      type: 'success',
      data: { idToken: 'google-id-token', user: { givenName: 'Salma', familyName: 'Ali', email: 'salma@gmail.com' } },
    });

    const result = await getGoogleCredential();

    expect(mockConfigure).toHaveBeenCalledWith({ webClientId: 'web-client-id' });
    expect(mockGoogleCredential).toHaveBeenCalledWith('google-id-token');
    expect(result).toEqual({
      provider: 'google',
      credential: { providerId: 'google.com', token: 'google-id-token', secret: '' },
      profile: { firstName: 'Salma', lastName: 'Ali', email: 'salma@gmail.com' },
    });
  });

  it('returns null when the user closes the sheet', async () => {
    mockSignIn.mockResolvedValue({ type: 'cancelled', data: null });

    await expect(getGoogleCredential()).resolves.toBeNull();
    expect(mockGoogleCredential).not.toHaveBeenCalled();
  });

  it('explains when Google Play services are missing', async () => {
    mockHasPlayServices.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });

    await expect(getGoogleCredential()).rejects.toEqual({
      field: 'form',
      message: 'Google sign-in needs Google Play services on this device.',
    });
  });

  it('fails with generic copy when Google returns no ID token', async () => {
    mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: null, user: { email: 'x@gmail.com' } } });

    await expect(getGoogleCredential()).rejects.toEqual({
      field: 'form',
      message: 'Google sign-in failed. Please try again.',
    });
  });

  it('uses the E2E picker instead of Google when the app points at the Auth emulator', async () => {
    mockExtra = { firebaseAuthEmulatorHost: '10.0.2.2:9099' };

    const pending = getGoogleCredential();
    await Promise.resolve();
    useE2eGooglePickerStore.getState().settle('Mona@Test.local');
    const result = await pending;

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockGoogleCredential).toHaveBeenCalledWith(
      JSON.stringify({ sub: 'e2e-mona@test.local', email: 'mona@test.local', email_verified: true, name: 'E2E Google' }),
    );
    expect(result?.profile).toEqual({ firstName: 'E2E', lastName: 'Google', email: 'mona@test.local' });
  });

  it('returns null when the E2E picker is cancelled', async () => {
    mockExtra = { firebaseAuthEmulatorHost: '10.0.2.2:9099' };

    const pending = getGoogleCredential();
    await Promise.resolve();
    useE2eGooglePickerStore.getState().settle(null);

    await expect(pending).resolves.toBeNull();
  });
});

describe('getAppleCredential', () => {
  it('sends Apple the hashed nonce and Firebase the raw one', async () => {
    mockAppleSignIn.mockResolvedValue({
      identityToken: 'apple-id-token',
      fullName: { givenName: 'Mona', familyName: 'Adel' },
      email: 'abc@privaterelay.appleid.com',
    });

    const result = await getAppleCredential();

    expect(mockAppleSignIn).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: 'hashed-nonce' });
    expect(mockAppleCredential).toHaveBeenCalledWith('apple-id-token', 'raw-nonce');
    expect(result?.profile).toEqual({ firstName: 'Mona', lastName: 'Adel', email: 'abc@privaterelay.appleid.com' });
  });

  it('returns blank names when Apple withholds them on a repeat sign-in', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-id-token', fullName: null, email: null });

    const result = await getAppleCredential();

    expect(result?.profile).toEqual({ firstName: '', lastName: '', email: null });
  });

  it('returns null when the user cancels', async () => {
    mockAppleSignIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });

    await expect(getAppleCredential()).resolves.toBeNull();
  });
});

describe('isAppleSignInAvailable', () => {
  it('is false on Android without asking the native module', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    await expect(isAppleSignInAvailable()).resolves.toBe(false);
    expect(mockAppleAvailable).not.toHaveBeenCalled();
  });

  it('asks the native module on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockAppleAvailable.mockResolvedValue(true);

    await expect(isAppleSignInAvailable()).resolves.toBe(true);
  });
});

describe('signOutOfGoogle', () => {
  it('never throws', async () => {
    mockGoogleSignOut.mockRejectedValue(new Error('not signed in'));

    await expect(signOutOfGoogle()).resolves.toBeUndefined();
  });
});
```

If `jest.replaceProperty(Platform, 'OS', …)` throws because the property is not configurable in this RN version, use this in those two tests instead:

```typescript
const original = Platform.OS;
Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
// …assertions…
Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/lib/__tests__/socialAuth.test.ts`
Expected: FAIL with "Cannot find module '@mobile/lib/socialAuth'".

- [ ] **Step 4: Write the E2E picker store**

Create `apps/mobile/src/store/e2eGooglePickerStore.ts`:

```typescript
import { create } from 'zustand';

type E2eGooglePickerState = {
  /** True while a request is waiting on the picker. */
  pending: boolean;
  resolver: ((email: string | null) => void) | null;
  request: () => Promise<string | null>;
  settle: (email: string | null) => void;
};

/**
 * Drives the E2E stand-in for Google's account sheet (E2eGooglePickerHost).
 * Only reached when the app points at the Auth emulator — see
 * lib/socialAuth.ts. A second request settles the first as cancelled.
 */
export const useE2eGooglePickerStore = create<E2eGooglePickerState>((set, get) => ({
  pending: false,
  resolver: null,
  request: () =>
    new Promise<string | null>((resolve) => {
      get().resolver?.(null);
      set({ pending: true, resolver: resolve });
    }),
  settle: (email) => {
    get().resolver?.(email);
    set({ pending: false, resolver: null });
  },
}));

/** Opens the picker and resolves with the typed address, or null on cancel. */
export function requestE2eGoogleEmail(): Promise<string | null> {
  return useE2eGooglePickerStore.getState().request();
}
```

- [ ] **Step 5: Write `socialAuth.ts`**

Create `apps/mobile/src/lib/socialAuth.ts`:

```typescript
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { auth } from '@mobile/lib/firebase';
import type { AuthCredential } from '@mobile/lib/firebase';
import { isMappedAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { requestE2eGoogleEmail } from '@mobile/store/e2eGooglePickerStore';
import type { SocialProvider } from '@mobile/types';

/**
 * Google and Apple sign-in, up to the Firebase credential.
 *
 * The native SDKs show their own sheets and hand back an ID token; this turns
 * that into the credential RNFB's `signInWithCredential` / `linkWithCredential`
 * take. What happens next — which account, whether to register or link — is
 * `useSocialSignIn`'s business, not this module's.
 *
 * Apple is iOS-only (the App Store requires it once Google is offered there);
 * Android never shows or calls it.
 */

export type SocialCredentialResult = {
  provider: SocialProvider;
  credential: AuthCredential;
  profile: { firstName: string; lastName: string; email: string | null };
};

export const SOCIAL_PROVIDER_LABEL: Record<SocialProvider, string> = {
  google: 'Google',
  apple: 'Apple',
};

const GOOGLE_FAILED: MappedAuthError = { field: 'form', message: 'Google sign-in failed. Please try again.' };
const APPLE_FAILED: MappedAuthError = { field: 'form', message: 'Apple sign-in failed. Please try again.' };

function extra(key: string): unknown {
  return Constants.expoConfig?.extra?.[key];
}

/**
 * True when native Auth points at the local emulator — the E2E lab. Empty in
 * every real build (see app.config.ts `firebaseAuthEmulatorHost`).
 */
export function isAuthEmulator(): boolean {
  return Boolean(extra('firebaseAuthEmulatorHost'));
}

let googleConfigured = false;
function configureGoogle(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({ webClientId: extra('googleWebClientId') as string | undefined });
  googleConfigured = true;
}

/**
 * The E2E seam. Google's sheet needs a real Google account on the device, which
 * the lab's emulator cannot have, so under the Auth emulator a small picker
 * asks for an address instead, and the emulator accepts an unsigned claim set
 * in place of a Google ID token. The `sub` is derived from the address, so the
 * same address is the same Google identity on every run.
 */
async function getE2eGoogleCredential(): Promise<SocialCredentialResult | null> {
  const typed = await requestE2eGoogleEmail();
  if (!typed) return null;
  const email = typed.trim().toLowerCase();
  const claims = { sub: `e2e-${email}`, email, email_verified: true, name: 'E2E Google' };
  return {
    provider: 'google',
    credential: auth.GoogleAuthProvider.credential(JSON.stringify(claims)),
    profile: { firstName: 'E2E', lastName: 'Google', email },
  };
}

export async function getGoogleCredential(): Promise<SocialCredentialResult | null> {
  if (isAuthEmulator()) return getE2eGoogleCredential();
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return null;
    const { idToken, user } = response.data;
    if (!idToken) throw GOOGLE_FAILED;
    return {
      provider: 'google',
      credential: auth.GoogleAuthProvider.credential(idToken),
      profile: {
        firstName: user.givenName ?? '',
        lastName: user.familyName ?? '',
        email: user.email ?? null,
      },
    };
  } catch (error) {
    if (isMappedAuthError(error)) throw error;
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
        return null;
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw { field: 'form', message: 'Google sign-in needs Google Play services on this device.' } satisfies MappedAuthError;
      }
    }
    throw GOOGLE_FAILED;
  }
}

/**
 * Apple binds its identity token to a nonce: Apple gets the SHA-256 of a random
 * value, and Firebase gets the raw value to check against it.
 */
export async function getAppleCredential(): Promise<SocialCredentialResult | null> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!result.identityToken) throw APPLE_FAILED;
    return {
      provider: 'apple',
      credential: auth.AppleAuthProvider.credential(result.identityToken, rawNonce),
      // Apple sends the name only on the very first authorization.
      profile: {
        firstName: result.fullName?.givenName ?? '',
        lastName: result.fullName?.familyName ?? '',
        email: result.email ?? null,
      },
    };
  } catch (error) {
    if (isMappedAuthError(error)) throw error;
    if ((error as { code?: unknown })?.code === 'ERR_REQUEST_CANCELED') return null;
    throw APPLE_FAILED;
  }
}

export function getSocialCredential(provider: SocialProvider): Promise<SocialCredentialResult | null> {
  return provider === 'google' ? getGoogleCredential() : getAppleCredential();
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Forgets the Google account on the device so the next tap shows the picker. */
export async function signOutOfGoogle(): Promise<void> {
  if (isAuthEmulator()) return;
  try {
    configureGoogle();
    await GoogleSignin.signOut();
  } catch {
    // Best-effort: signing out of the app must never fail on this.
  }
}
```

If Task 2 Step 7 found different installed names (e.g. no `SIGN_IN_CANCELLED`), adjust these lines to match.

- [ ] **Step 6: Run the `socialAuth` tests to verify they pass**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/lib/__tests__/socialAuth.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing host test**

Create `apps/mobile/src/components/__tests__/E2eGooglePickerHost.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import E2eGooglePickerHost from '@mobile/components/E2eGooglePickerHost';
import { requestE2eGoogleEmail } from '@mobile/store/e2eGooglePickerStore';

it('stays hidden until a request comes in', () => {
  render(<E2eGooglePickerHost />);
  expect(screen.queryByText('Use this Google account')).toBeNull();
});

it('resolves with the typed address', async () => {
  render(<E2eGooglePickerHost />);
  let pending!: Promise<string | null>;
  act(() => {
    pending = requestE2eGoogleEmail();
  });

  fireEvent.changeText(screen.getByTestId('e2eGooglePicker.email'), ' mona@test.local ');
  fireEvent.press(screen.getByText('Use this Google account'));

  await expect(pending).resolves.toBe('mona@test.local');
  expect(screen.queryByText('Use this Google account')).toBeNull();
});

it('resolves null on cancel', async () => {
  render(<E2eGooglePickerHost />);
  let pending!: Promise<string | null>;
  act(() => {
    pending = requestE2eGoogleEmail();
  });

  fireEvent.press(screen.getByText('Cancel'));

  await expect(pending).resolves.toBeNull();
});
```

- [ ] **Step 8: Write the host and its styles**

Create `apps/mobile/src/components/styles/e2e-google-picker-host.styles.ts`:

```typescript
import { StyleSheet } from 'react-native';

import { borderRadius, colors, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  input: {
    ...typeScale.bodyMd,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
```

Create `apps/mobile/src/components/E2eGooglePickerHost.tsx`:

```tsx
import React, { useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';

import { Button } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { useE2eGooglePickerStore } from '@mobile/store/e2eGooglePickerStore';
import { styles } from './styles/e2e-google-picker-host.styles';

/**
 * The E2E lab's stand-in for Google's account sheet. The root layout mounts it
 * only when the app points at the Auth emulator (lib/socialAuth.ts
 * `isAuthEmulator`), so no real build ever renders it. A Maestro flow types an
 * address here the way a person would pick an account.
 */
export default function E2eGooglePickerHost() {
  const pending = useE2eGooglePickerStore((s) => s.pending);
  const settle = useE2eGooglePickerStore((s) => s.settle);
  const [email, setEmail] = useState('');

  function finish(value: string | null) {
    setEmail('');
    settle(value);
  }

  return (
    <Modal visible={pending} transparent animationType="fade" onRequestClose={() => finish(null)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Choose a test Google account</Text>
          <TextInput
            testID="e2eGooglePicker.email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            placeholderTextColor={colors.textPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Button
            title="Use this Google account"
            onPress={() => finish(email.trim() || null)}
            fullWidth
            disabled={!email.trim()}
          />
          <Button title="Cancel" variant="text" onPress={() => finish(null)} fullWidth />
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 9: Mount the host under the emulator only**

In `apps/mobile/app/_layout.tsx`, add the imports:

```typescript
import E2eGooglePickerHost from '@mobile/components/E2eGooglePickerHost';
import { isAuthEmulator } from '@mobile/lib/socialAuth';
```

Directly after `<ConfirmDialogHost />`, add:

```tsx
        {/* E2E only: stands in for Google's account sheet against the Auth
            emulator. Never mounted in a real build. */}
        {isAuthEmulator() && <E2eGooglePickerHost />}
```

- [ ] **Step 10: Run the tests, typecheck, commit**

```bash
cd /d/Projects/nanny-app/apps/mobile && npx jest src/lib/__tests__/socialAuth.test.ts src/components/__tests__/E2eGooglePickerHost.test.tsx && cd ../.. && pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test
git add apps/mobile/src/lib/authErrors.ts apps/mobile/src/lib/socialAuth.ts apps/mobile/src/store/e2eGooglePickerStore.ts apps/mobile/src/components/E2eGooglePickerHost.tsx apps/mobile/src/components/styles/e2e-google-picker-host.styles.ts apps/mobile/app/_layout.tsx apps/mobile/src/lib/__tests__/socialAuth.test.ts apps/mobile/src/components/__tests__/E2eGooglePickerHost.test.tsx
git commit -m "feat(auth): obtain Google and Apple credentials for Firebase

Native sheets hand back an ID token; this turns it into the RNFB credential.
Apple's token is nonce-bound. Under the Auth emulator, an E2E-only picker
stands in for Google's sheet, since the lab has no Google account.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Social session state — `useSocialSignIn`, pending links, collision B

**Files:**
- Modify: `apps/mobile/src/store/registrationDraftStore.ts`
- Create: `apps/mobile/src/store/pendingLinkStore.ts`
- Create: `apps/mobile/src/lib/pendingLink.ts`
- Create: `apps/mobile/src/hooks/useSocialSignIn.ts`
- Modify: `apps/mobile/src/hooks/useAuth.ts` (`useSignOut`)
- Test: `apps/mobile/src/hooks/__tests__/useSocialSignIn.test.tsx`, `apps/mobile/src/lib/__tests__/pendingLink.test.ts`, `apps/mobile/src/hooks/__tests__/useAuth.signOut.test.tsx`

**Interfaces:**
- Consumes: `getSocialCredential`, `signOutOfGoogle`, `SOCIAL_PROVIDER_LABEL`, `SocialCredentialResult` (Task 4). `api`, `getApiErrorMessage`. `noticeDialog`.
- Produces: `RegistrationDraft` gains `authProvider: AuthProvider` (default `'phone'`) and `socialCredential: AuthCredential | null` (default `null`).
- Produces: `usePendingLinkStore` with `{ pending: PendingLink | null; set(p: PendingLink): void; clear(): void }`, where `PendingLink = { provider: SocialProvider; credential: AuthCredential; phoneHint: string | null }`.
- Produces: `useSocialSignIn()` — a mutation with variables `{ provider: SocialProvider; role?: Role }` resolving `SocialSignInOutcome = 'cancelled' | 'signed-in' | 'new-user' | 'needs-link'`, and error `MappedAuthError`.
- Produces: `linkPendingCredential(): Promise<void>` and `abandonSocialSignUpForLink(phoneHint: string | null): Promise<void>` from `@mobile/lib/pendingLink`.

- [ ] **Step 1: Add the draft fields**

In `apps/mobile/src/store/registrationDraftStore.ts`:

Change the imports to:

```typescript
import { create } from 'zustand';
import type { AvailabilityType, IdDocumentType, WeeklySchedule } from '@nanny-app/shared';
import type { AuthCredential } from '@mobile/lib/firebase';
import type { AuthProvider, Role } from '@mobile/types';
```

Add to `RegistrationDraft`, right after `role: Role | null;`:

```typescript
  // How this registration started. 'phone' is the full wizard; 'google' or
  // 'apple' means the user already signed in with that provider, which
  // supplied a verified email — so the email-code and password steps are
  // skipped, and step 3 links the phone onto that account instead of signing
  // in with it.
  authProvider: AuthProvider;
  // The Google/Apple credential that started a social registration, kept so
  // that a collision can move it into pendingLinkStore and link it onto the
  // existing account. In-memory only, like `password` below.
  socialCredential: AuthCredential | null;
```

Add to `INITIAL`, right after `role: null,`:

```typescript
  authProvider: 'phone',
  socialCredential: null,
```

- [ ] **Step 2: Write the pending-link store**

Create `apps/mobile/src/store/pendingLinkStore.ts`:

```typescript
import { create } from 'zustand';

import type { AuthCredential } from '@mobile/lib/firebase';
import type { SocialProvider } from '@mobile/types';

export type PendingLink = {
  provider: SocialProvider;
  credential: AuthCredential;
  /** The E.164 number typed before the collision, to prefill sign-in. */
  phoneHint: string | null;
};

type PendingLinkState = {
  pending: PendingLink | null;
  set: (pending: PendingLink) => void;
  clear: () => void;
};

/**
 * A Google/Apple credential waiting to be linked onto an account the user is
 * about to prove they own — by SMS code or password (see lib/pendingLink.ts).
 *
 * In memory only: the credential is a live ID token. And whatever this holds
 * is linked on the next successful sign-in, so only a real collision may put
 * a credential here, and it is cleared eagerly — after any link attempt, when
 * a new social attempt starts, on "Not now", and on sign-out.
 */
export const usePendingLinkStore = create<PendingLinkState>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
```

- [ ] **Step 3: Write the failing `pendingLink` tests**

Create `apps/mobile/src/lib/__tests__/pendingLink.test.ts`:

```typescript
const mockLinkWithCredential = jest.fn();
const mockDelete = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentUser: {
  linkWithCredential: jest.Mock;
  delete: jest.Mock;
  providerData: { providerId: string }[];
} | null = null;

jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
    signOut: mockSignOut,
  }),
}));

const mockGetSocialCredential = jest.fn();
jest.mock('@mobile/lib/socialAuth', () => ({
  getSocialCredential: (...args: unknown[]) => mockGetSocialCredential(...args),
  SOCIAL_PROVIDER_LABEL: { google: 'Google', apple: 'Apple' },
}));

const mockNoticeDialog = jest.fn();
jest.mock('@mobile/store/confirmDialogStore', () => ({
  noticeDialog: (...args: unknown[]) => mockNoticeDialog(...args),
}));

import { abandonSocialSignUpForLink, linkPendingCredential } from '@mobile/lib/pendingLink';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const GOOGLE_CREDENTIAL = { providerId: 'google.com', token: 'google-id-token', secret: '' };
const FRESH_CREDENTIAL = { providerId: 'apple.com', token: 'fresh', secret: 'n' };

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockCurrentUser = {
    linkWithCredential: mockLinkWithCredential,
    delete: mockDelete,
    providerData: [{ providerId: 'phone' }, { providerId: 'password' }],
  };
  usePendingLinkStore.getState().clear();
  useRegistrationDraftStore.getState().reset();
});

describe('linkPendingCredential', () => {
  it('does nothing when no link is pending', async () => {
    await linkPendingCredential();
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
  });

  it('links the pending credential onto the signed-in account and clears it', async () => {
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockResolvedValue(undefined);

    await linkPendingCredential();

    expect(mockLinkWithCredential).toHaveBeenCalledWith(GOOGLE_CREDENTIAL);
    expect(usePendingLinkStore.getState().pending).toBeNull();
    expect(mockNoticeDialog).not.toHaveBeenCalled();
  });

  it('asks the provider once more when the reused credential is refused', async () => {
    usePendingLinkStore.getState().set({ provider: 'apple', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential
      .mockRejectedValueOnce({ code: 'auth/invalid-credential' })
      .mockResolvedValueOnce(undefined);
    mockGetSocialCredential.mockResolvedValue({ provider: 'apple', credential: FRESH_CREDENTIAL, profile: {} });

    await linkPendingCredential();

    expect(mockGetSocialCredential).toHaveBeenCalledWith('apple');
    expect(mockLinkWithCredential).toHaveBeenLastCalledWith(FRESH_CREDENTIAL);
    expect(mockNoticeDialog).not.toHaveBeenCalled();
  });

  it('does not retry when the identity already belongs to another account, and says so', async () => {
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/credential-already-in-use' });

    await linkPendingCredential();

    expect(mockGetSocialCredential).not.toHaveBeenCalled();
    expect(mockNoticeDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't connect Google" }),
    );
  });

  it('treats an already-linked provider as done', async () => {
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/provider-already-linked' });

    await linkPendingCredential();

    expect(mockNoticeDialog).not.toHaveBeenCalled();
  });

  it('tells the user when the second attempt is cancelled', async () => {
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/invalid-credential' });
    mockGetSocialCredential.mockResolvedValue(null);

    await linkPendingCredential();

    expect(mockNoticeDialog).toHaveBeenCalledTimes(1);
  });
});

describe('abandonSocialSignUpForLink', () => {
  function seedSocialDraft() {
    useRegistrationDraftStore.setState({
      authProvider: 'google',
      socialCredential: GOOGLE_CREDENTIAL as never,
      email: 'mona@gmail.com',
      firstName: 'Mona',
    });
  }

  it('deletes the Google-only account, parks the credential, and resets the draft', async () => {
    seedSocialDraft();
    mockCurrentUser = { linkWithCredential: mockLinkWithCredential, delete: mockDelete, providerData: [{ providerId: 'google.com' }] };
    mockDelete.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toEqual({
      provider: 'google',
      credential: GOOGLE_CREDENTIAL,
      phoneHint: '+201234567891',
    });
    expect(useRegistrationDraftStore.getState().authProvider).toBe('phone');
    expect(useRegistrationDraftStore.getState().email).toBe('');
  });

  it('only signs out when the account holds anything besides Google/Apple', async () => {
    seedSocialDraft();
    mockCurrentUser = {
      linkWithCredential: mockLinkWithCredential,
      delete: mockDelete,
      providerData: [{ providerId: 'google.com' }, { providerId: 'phone' }],
    };

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the delete itself fails', async () => {
    seedSocialDraft();
    mockCurrentUser = { linkWithCredential: mockLinkWithCredential, delete: mockDelete, providerData: [{ providerId: 'apple.com' }] };
    mockDelete.mockRejectedValue(new Error('network'));

    await abandonSocialSignUpForLink(null);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending?.provider).toBe('google');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/lib/__tests__/pendingLink.test.ts`
Expected: FAIL with "Cannot find module '@mobile/lib/pendingLink'".

- [ ] **Step 5: Write `pendingLink.ts`**

Create `apps/mobile/src/lib/pendingLink.ts`:

```typescript
import { auth } from '@mobile/lib/firebase';
import type { AuthCredential } from '@mobile/lib/firebase';
import { getSocialCredential, SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

/** Link failures a fresh credential cannot fix — no point asking again. */
const FINAL_LINK_ERRORS = new Set([
  'auth/credential-already-in-use',
  'auth/email-already-in-use',
  'auth/network-request-failed',
]);

/**
 * Links the parked Google/Apple credential onto the account the user just
 * signed in to (by SMS or password), completing either collision flow.
 *
 * Signing in proved they own this account; the credential proves they own the
 * Google/Apple identity; so linking is safe. It never blocks sign-in: on any
 * failure the user stays signed in and is told the connection didn't happen.
 *
 * Collision B reuses a credential that already signed in once (the throwaway
 * social account it then deleted). Apple's token is nonce-bound and may be
 * refused a second time, so a refused credential gets one more try with a
 * fresh one from the provider's sheet.
 */
export async function linkPendingCredential(): Promise<void> {
  const pending = usePendingLinkStore.getState().pending;
  usePendingLinkStore.getState().clear();
  const user = auth().currentUser;
  if (!pending || !user) return;

  const attempt = async (credential: AuthCredential): Promise<string | null> => {
    try {
      await user.linkWithCredential(credential);
      return null;
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      // Already linked means there is nothing left to do.
      if (code === 'auth/provider-already-linked') return null;
      return typeof code === 'string' ? code : 'unknown';
    }
  };

  let failure = await attempt(pending.credential);
  if (failure && !FINAL_LINK_ERRORS.has(failure)) {
    try {
      const fresh = await getSocialCredential(pending.provider);
      if (fresh) failure = await attempt(fresh.credential);
    } catch {
      // Keep the original failure.
    }
  }

  if (failure) {
    const label = SOCIAL_PROVIDER_LABEL[pending.provider];
    noticeDialog({
      title: `Couldn't connect ${label}`,
      message: `You're signed in, but we couldn't connect ${label} to your account. Try Continue with ${label} next time.`,
    });
  }
}

/**
 * Collision B: a social sign-up ran into an account that already exists (its
 * phone or email is taken). Delete the Google/Apple-only account this sign-up
 * created — which frees the identity to be linked onto the real account —
 * park the credential, and reset the draft. The caller then sends the user to
 * sign in, where `phoneHint` prefills the number they typed.
 *
 * Only ever called from inside the social wizard, which starts only after
 * `/auth/me` returned 404 — so the signed-in account has no row. The provider
 * check below is the other half of that guard: anything besides Google/Apple
 * on the account means it is not the throwaway, so it is signed out, never
 * deleted.
 */
export async function abandonSocialSignUpForLink(phoneHint: string | null): Promise<void> {
  const draft = useRegistrationDraftStore.getState();
  const { authProvider, socialCredential } = draft;
  const user = auth().currentUser;

  if (user) {
    const socialOnly =
      user.providerData.length > 0 &&
      user.providerData.every((p) => p.providerId === 'google.com' || p.providerId === 'apple.com');
    let deleted = false;
    if (socialOnly) {
      try {
        await user.delete();
        deleted = true;
      } catch {
        // Fall through to signing out.
      }
    }
    if (!deleted) await auth().signOut().catch(() => undefined);
  }

  if (socialCredential && authProvider !== 'phone') {
    usePendingLinkStore.getState().set({ provider: authProvider, credential: socialCredential, phoneHint });
  }
  draft.reset();
}
```

- [ ] **Step 6: Run the `pendingLink` tests to verify they pass**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/lib/__tests__/pendingLink.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing `useSocialSignIn` tests**

Create `apps/mobile/src/hooks/__tests__/useSocialSignIn.test.tsx`:

```tsx
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSignInWithCredential = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentUser: { email: string | null; delete: jest.Mock } | null = null;
jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    signInWithCredential: mockSignInWithCredential,
    signOut: mockSignOut,
    get currentUser() {
      return mockCurrentUser;
    },
  }),
}));

const mockGetSocialCredential = jest.fn();
jest.mock('@mobile/lib/socialAuth', () => ({
  getSocialCredential: (...args: unknown[]) => mockGetSocialCredential(...args),
}));

const mockGet = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  getApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

import { useSocialSignIn } from '@mobile/hooks/useSocialSignIn';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const CREDENTIAL = { providerId: 'google.com', token: 'google-id-token', secret: '' };
const RESULT = {
  provider: 'google',
  credential: CREDENTIAL,
  profile: { firstName: 'Salma', lastName: 'Ali', email: 'salma@gmail.com' },
};
const NOT_FOUND = { isAxiosError: true, response: { status: 404, data: {} } };

let currentUnmount: (() => void) | null = null;
function renderSocialSignIn() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useSocialSignIn(), { wrapper: Wrapper });
  currentUnmount = rendered.unmount;
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { email: 'salma@gmail.com', delete: jest.fn() };
  mockGetSocialCredential.mockResolvedValue(RESULT);
  mockSignInWithCredential.mockResolvedValue(undefined);
  mockGet.mockResolvedValue({ data: { data: { id: 1 }, error: null } });
  usePendingLinkStore.getState().clear();
  useRegistrationDraftStore.getState().reset();
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
});

it('does nothing when the sheet is closed', async () => {
  mockGetSocialCredential.mockResolvedValue(null);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('cancelled');
  expect(mockSignInWithCredential).not.toHaveBeenCalled();
});

it('signs an existing account straight in', async () => {
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('signed-in');
  expect(mockSignInWithCredential).toHaveBeenCalledWith(CREDENTIAL);
  expect(useRegistrationDraftStore.getState().authProvider).toBe('phone');
});

it('keeps a brand-new account and seeds the social draft', async () => {
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google', role: 'parent' })).resolves.toBe('new-user');

  const draft = useRegistrationDraftStore.getState();
  expect(draft).toMatchObject({
    role: 'parent',
    authProvider: 'google',
    socialCredential: CREDENTIAL,
    firstName: 'Salma',
    lastName: 'Ali',
    email: 'salma@gmail.com',
  });
  expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
  // Only a collision may park a credential for linking.
  expect(usePendingLinkStore.getState().pending).toBeNull();
});

it("falls back to Firebase's address when Apple withholds it on a repeat sign-in", async () => {
  mockGetSocialCredential.mockResolvedValue({
    ...RESULT,
    provider: 'apple',
    profile: { firstName: '', lastName: '', email: null },
  });
  mockCurrentUser = { email: 'abc@privaterelay.appleid.com', delete: jest.fn() };
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await result.current.mutateAsync({ provider: 'apple' });

  expect(useRegistrationDraftStore.getState().email).toBe('abc@privaterelay.appleid.com');
});

it('refuses a new account with no email at all, and signs out', async () => {
  mockGetSocialCredential.mockResolvedValue({ ...RESULT, profile: { firstName: '', lastName: '', email: null } });
  mockCurrentUser = { email: null, delete: jest.fn() };
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'apple' })).rejects.toMatchObject({ field: 'form' });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

it('parks the credential when the email belongs to an account with another sign-in method', async () => {
  mockSignInWithCredential.mockRejectedValue({ code: 'auth/account-exists-with-different-credential' });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('needs-link');
  expect(usePendingLinkStore.getState().pending).toEqual({ provider: 'google', credential: CREDENTIAL, phoneHint: null });
  expect(mockGet).not.toHaveBeenCalled();
});

it('maps any other Firebase error', async () => {
  mockSignInWithCredential.mockRejectedValue({ code: 'auth/network-request-failed' });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).rejects.toEqual({
    field: 'form',
    message: 'Network error. Check your connection and try again.',
  });
});

it('drops a stale pending link when a new attempt starts', async () => {
  usePendingLinkStore.getState().set({ provider: 'apple', credential: CREDENTIAL as never, phoneHint: null });
  const { result } = renderSocialSignIn();

  await result.current.mutateAsync({ provider: 'google' });

  expect(usePendingLinkStore.getState().pending).toBeNull();
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/hooks/__tests__/useSocialSignIn.test.tsx`
Expected: FAIL with "Cannot find module '@mobile/hooks/useSocialSignIn'".

- [ ] **Step 9: Write `useSocialSignIn.ts`**

Create `apps/mobile/src/hooks/useSocialSignIn.ts`:

```typescript
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

import { api, getApiErrorMessage } from '@mobile/lib/api';
import { mapFirebaseAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { auth } from '@mobile/lib/firebase';
import { getSocialCredential } from '@mobile/lib/socialAuth';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import type { Role, SocialProvider } from '@mobile/types';

/**
 * - `cancelled`: the user closed the sheet.
 * - `signed-in`: an existing account — the root router takes over.
 * - `new-user`: a new person; the social draft is seeded, so go to the wizard.
 * - `needs-link`: the email belongs to an account with another sign-in method;
 *   the credential is parked, so go to sign-in (collision A).
 */
export type SocialSignInOutcome = 'cancelled' | 'signed-in' | 'new-user' | 'needs-link';

const NO_EMAIL_ERROR: MappedAuthError = {
  field: 'form',
  message:
    "Your account didn't share an email address, which we need for receipts. Sign up with your phone number instead.",
};

/**
 * "Continue with Google / Apple". Signs in with the provider's credential, then
 * asks the backend whether this uid has an account.
 *
 * A 404 here is a new person, not an orphan: unlike the SMS guards, the
 * Firebase account is kept, because the wizard is about to finish it.
 */
export function useSocialSignIn() {
  return useMutation<SocialSignInOutcome, MappedAuthError, { provider: SocialProvider; role?: Role }>({
    mutationFn: async ({ provider, role }) => {
      usePendingLinkStore.getState().clear();

      const result = await getSocialCredential(provider);
      if (!result) return 'cancelled';

      try {
        await auth().signInWithCredential(result.credential);
      } catch (error) {
        if ((error as { code?: unknown })?.code === 'auth/account-exists-with-different-credential') {
          usePendingLinkStore.getState().set({ provider, credential: result.credential, phoneHint: null });
          return 'needs-link';
        }
        throw mapFirebaseAuthError(error);
      }

      try {
        await api.get('/auth/me');
        return 'signed-in';
      } catch (error) {
        if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
          throw {
            field: 'form',
            message: getApiErrorMessage(error, 'Could not sign you in. Please try again.'),
          } satisfies MappedAuthError;
        }
      }

      // Apple returns the address only on the first authorization; Firebase
      // kept it on the account, so read it back from there on later attempts.
      const email = result.profile.email ?? auth().currentUser?.email ?? null;
      if (!email) {
        await auth().signOut().catch(() => undefined);
        throw NO_EMAIL_ERROR;
      }

      const draft = useRegistrationDraftStore.getState();
      draft.reset();
      draft.patch({
        role: role ?? null,
        authProvider: provider,
        socialCredential: result.credential,
        firstName: result.profile.firstName,
        lastName: result.profile.lastName,
        email: email.trim().toLowerCase(),
      });
      return 'new-user';
    },
  });
}
```

`axios.isAxiosError` must accept the plain `{ isAxiosError: true, response }` object the tests use. It checks the `isAxiosError` flag, as `SignInScreen.test.tsx` already relies on.

- [ ] **Step 10: Run the hook tests to verify they pass**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/hooks/__tests__/useSocialSignIn.test.tsx`
Expected: PASS.

- [ ] **Step 11: Sign out of Google and clear any pending link on sign-out**

In `apps/mobile/src/hooks/useAuth.ts`, add the imports:

```typescript
import { signOutOfGoogle } from '@mobile/lib/socialAuth';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
```

In `useSignOut`'s `mutationFn`, after the `try { await auth().signOut(); } catch … { … }` block, add:

```typescript
      // A parked Google/Apple credential must never link onto whoever signs
      // in next; and forgetting the Google account on the device makes the
      // next tap show the account picker again.
      usePendingLinkStore.getState().clear();
      await signOutOfGoogle();
```

In `apps/mobile/src/hooks/__tests__/useAuth.signOut.test.tsx`, add:

```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
```

Then add this test, following that file's existing render/unmount pattern (read the file first, and reuse `withNativePush(false)` so push is out of the way):

```typescript
it('forgets the Google account and any parked link', async () => {
  withNativePush(false);
  mockSignOut.mockResolvedValue(undefined);
  usePendingLinkStore.getState().set({ provider: 'google', credential: { providerId: 'google.com', token: 't', secret: '' } as never, phoneHint: null });
  const { result } = renderSignOut();

  await result.current.mutateAsync();

  expect(GoogleSignin.signOut).toHaveBeenCalledTimes(1);
  expect(usePendingLinkStore.getState().pending).toBeNull();
});
```

- [ ] **Step 12: Run everything touched, typecheck, commit**

```bash
cd /d/Projects/nanny-app/apps/mobile && npx jest src/lib/__tests__/pendingLink.test.ts src/hooks/__tests__/useSocialSignIn.test.tsx src/hooks/__tests__/useAuth.signOut.test.tsx && cd ../.. && pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test
git add apps/mobile/src/store/registrationDraftStore.ts apps/mobile/src/store/pendingLinkStore.ts apps/mobile/src/lib/pendingLink.ts apps/mobile/src/hooks/useSocialSignIn.ts apps/mobile/src/hooks/useAuth.ts apps/mobile/src/lib/__tests__/pendingLink.test.ts apps/mobile/src/hooks/__tests__/useSocialSignIn.test.tsx apps/mobile/src/hooks/__tests__/useAuth.signOut.test.tsx
git commit -m "feat(auth): route Google and Apple sign-ins, and link on collision

A 404 from /auth/me seeds a social draft instead of discarding the account.
A collision parks the credential in memory, and it is linked only after the
user signs in to the existing account the usual way.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Entry UI — social buttons, sign-in banner, role selection

**Files:**
- Create: `apps/mobile/src/components/SocialAuthButtons.tsx`, `apps/mobile/src/components/styles/social-auth-buttons.styles.ts`
- Modify: `apps/mobile/src/lib/validation.ts` (adds `fromE164`)
- Modify: `apps/mobile/src/screens/auth/SignInScreen.tsx`, `apps/mobile/src/screens/auth/styles/sign-in-screen.styles.ts`
- Modify: `apps/mobile/src/screens/auth/EmailSignInScreen.tsx`
- Modify: `apps/mobile/src/screens/auth/RoleSelectionScreen.tsx`, `apps/mobile/src/screens/auth/styles/role-selection-screen.styles.ts`
- Test: `apps/mobile/src/components/__tests__/SocialAuthButtons.test.tsx`, plus `SignInScreen.test.tsx`, `EmailSignInScreen.test.tsx` and `RoleSelectionScreen.test.tsx` (extended)

**Interfaces:**
- Consumes: `useSocialSignIn` / `SocialSignInOutcome`, `usePendingLinkStore`, `linkPendingCredential` (Task 5). `isAppleSignInAvailable`, `SOCIAL_PROVIDER_LABEL` (Task 4).
- Produces: `<SocialAuthButtons context: 'sign-in' | 'sign-up'; role?: Role; disabled?: boolean />`.
- Produces: `fromE164(countryCode: string, e164: string | null): string`.

- [ ] **Step 1: Add `fromE164` with a test**

Append to `apps/mobile/src/lib/validation.ts`:

```typescript
/**
 * The digits a person types for `e164` next to the country-code box — the
 * reverse of `toE164`. Empty when the number is from another country code.
 */
export function fromE164(countryCode: string, e164: string | null): string {
  if (!e164) return '';
  const cc = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
  return e164.startsWith(cc) ? e164.slice(cc.length) : '';
}
```

Add a test next to the existing validation tests (`src/lib/__tests__/validation.test.ts` if present; otherwise create it):

```typescript
import { fromE164, toE164 } from '@mobile/lib/validation';

describe('fromE164', () => {
  it('reverses toE164', () => {
    expect(fromE164('+20', toE164('+20', '1234567891'))).toBe('1234567891');
  });
  it('is empty for another country code or nothing', () => {
    expect(fromE164('+20', '+441234567890')).toBe('');
    expect(fromE164('+20', null)).toBe('');
  });
});
```

- [ ] **Step 2: Write the failing `SocialAuthButtons` tests**

Create `apps/mobile/src/components/__tests__/SocialAuthButtons.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

let mockOutcome: string | { error: { field: string; message: string } } = 'signed-in';
const mockMutate = jest.fn(
  (
    _vars: unknown,
    opts: { onSuccess?: (o: string) => void; onError?: (e: { message: string }) => void },
  ) => {
    if (typeof mockOutcome === 'string') opts.onSuccess?.(mockOutcome);
    else opts.onError?.(mockOutcome.error);
  },
);
jest.mock('@mobile/hooks/useSocialSignIn', () => ({
  useSocialSignIn: () => ({ mutate: mockMutate, isPending: false }),
}));

const mockAppleAvailable = jest.fn();
jest.mock('@mobile/lib/socialAuth', () => ({
  isAppleSignInAvailable: () => mockAppleAvailable(),
}));

import SocialAuthButtons from '@mobile/components/SocialAuthButtons';

beforeEach(() => {
  jest.clearAllMocks();
  mockAppleAvailable.mockResolvedValue(false);
});

it('sends an existing account to the root router', () => {
  mockOutcome = 'signed-in';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockMutate).toHaveBeenCalledWith({ provider: 'google', role: undefined }, expect.anything());
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('takes a new user with a role straight to step 1', () => {
  mockOutcome = 'new-user';
  render(<SocialAuthButtons context="sign-up" role="nanny" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-1', params: { role: 'nanny' } });
});

it('asks a new user from sign-in to pick a role first', () => {
  mockOutcome = 'new-user';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockPush).toHaveBeenCalledWith('/(auth)/role-selection');
});

it('sends a collision on sign-up to the sign-in screen', () => {
  mockOutcome = 'needs-link';
  render(<SocialAuthButtons context="sign-up" role="parent" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockPush).toHaveBeenCalledWith('/(auth)/sign-in');
});

it('stays put on a collision from the sign-in screen, where the banner appears', () => {
  mockOutcome = 'needs-link';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('shows the error under the buttons', () => {
  mockOutcome = { error: { field: 'form', message: 'Google sign-in failed. Please try again.' } };
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(screen.getByText('Google sign-in failed. Please try again.')).toBeTruthy();
});

it('does not start while disabled', () => {
  render(<SocialAuthButtons context="sign-up" disabled />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockMutate).not.toHaveBeenCalled();
});

it('asks whether Apple is available', async () => {
  render(<SocialAuthButtons context="sign-in" />);
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/components/__tests__/SocialAuthButtons.test.tsx`
Expected: FAIL with "Cannot find module '@mobile/components/SocialAuthButtons'".

- [ ] **Step 4: Write the component and styles**

Create `apps/mobile/src/components/styles/social-auth-buttons.styles.ts`:

```typescript
import { StyleSheet } from 'react-native';

import { colors, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  // Matches Button's md height, so the two stack as a pair.
  appleButton: {
    width: '100%',
    height: 56,
  },
  error: {
    ...typeScale.bodySm,
    color: colors.error,
    textAlign: 'center',
  },
});
```

Create `apps/mobile/src/components/SocialAuthButtons.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Button } from '@mobile/components/ui';
import { useSocialSignIn } from '@mobile/hooks/useSocialSignIn';
import { isAppleSignInAvailable } from '@mobile/lib/socialAuth';
import { borderRadius } from '@mobile/theme';
import type { Role, SocialProvider } from '@mobile/types';
import { styles } from './styles/social-auth-buttons.styles';

type SocialAuthButtonsProps = {
  /**
   * Where the buttons sit. On sign-up a collision moves to the sign-in screen;
   * on sign-in the user is already there, and its banner appears by itself.
   */
  context: 'sign-in' | 'sign-up';
  /** The role picked on "Create your account"; absent on sign-in. */
  role?: Role;
  disabled?: boolean;
};

/**
 * "Continue with Google" on both platforms, and Apple's own button on iOS when
 * the device supports it. What an outcome means is decided in useSocialSignIn;
 * this only turns it into a destination.
 */
export default function SocialAuthButtons({ context, role, disabled = false }: SocialAuthButtonsProps) {
  const router = useRouter();
  const socialSignIn = useSocialSignIn();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void isAppleSignInAvailable().then((available) => {
      if (alive) setAppleAvailable(available);
    });
    return () => {
      alive = false;
    };
  }, []);

  const busy = disabled || socialSignIn.isPending;

  function start(provider: SocialProvider) {
    if (busy) return;
    setError(null);
    socialSignIn.mutate(
      { provider, role },
      {
        onSuccess: (outcome) => {
          switch (outcome) {
            case 'signed-in':
              router.replace('/');
              break;
            case 'new-user':
              if (role) router.push({ pathname: '/(auth)/register-step-1', params: { role } });
              else router.push('/(auth)/role-selection');
              break;
            case 'needs-link':
              if (context === 'sign-up') router.push('/(auth)/sign-in');
              break;
            case 'cancelled':
              break;
          }
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <View style={styles.container}>
      <Button
        title="Continue with Google"
        icon="logo-google"
        variant="outline"
        fullWidth
        onPress={() => start('google')}
        disabled={busy}
      />
      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={borderRadius['2xl']}
          style={styles.appleButton}
          onPress={() => start('apple')}
        />
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
```

- [ ] **Step 5: Run the component tests to verify they pass**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/components/__tests__/SocialAuthButtons.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the failing sign-in screen tests**

In `SignInScreen.test.tsx`:
- Add `linkWithCredential: jest.Mock` to the `mockCurrentUser` type, and `linkWithCredential: mockLinkWithCredential` to the `beforeEach` user.
- Declare `const mockLinkWithCredential = jest.fn();` with the other mocks.
- Add these imports after `import SignInScreen …`:

```typescript
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
```

In `beforeEach`, add `usePendingLinkStore.getState().clear();` and `mockLinkWithCredential.mockResolvedValue(undefined);`.

Add:

```typescript
const PENDING_GOOGLE = {
  provider: 'google' as const,
  credential: { providerId: 'google.com', token: 'google-id-token', secret: '' } as never,
  phoneHint: '+201234567891',
};

it('offers Google beside the phone door', () => {
  renderScreen();
  expect(screen.getByText('Continue with Google')).toBeTruthy();
});

it('explains a pending connection, prefills the number, and links after the SMS sign-in', async () => {
  usePendingLinkStore.getState().set(PENDING_GOOGLE);
  renderScreen();

  expect(
    screen.getByText('You already have an account. Sign in with your phone once to connect Google.'),
  ).toBeTruthy();
  expect(screen.getByTestId('signIn.phone').props.value).toBe('1234567891');

  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith('+201234567891', undefined));
  fireEvent.changeText(screen.getByTestId('signIn.code'), '111111');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockLinkWithCredential).toHaveBeenCalledWith(PENDING_GOOGLE.credential);
  expect(usePendingLinkStore.getState().pending).toBeNull();
});

it('drops the pending connection on "Not now"', () => {
  usePendingLinkStore.getState().set(PENDING_GOOGLE);
  renderScreen();

  fireEvent.press(screen.getByText('Not now'));

  expect(usePendingLinkStore.getState().pending).toBeNull();
  expect(
    screen.queryByText('You already have an account. Sign in with your phone once to connect Google.'),
  ).toBeNull();
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/screens/auth/__tests__/SignInScreen.test.tsx`
Expected: FAIL. There is no Google button and no banner yet.

- [ ] **Step 8: Update `SignInScreen`**

In `apps/mobile/src/screens/auth/SignInScreen.tsx`:

Change the imports to add:

```typescript
import { Button, Divider, OtpCodeInput } from '@mobile/components/ui';
import SocialAuthButtons from '@mobile/components/SocialAuthButtons';
import { linkPendingCredential } from '@mobile/lib/pendingLink';
import { SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { validatePhone, toE164, fromE164 } from '@mobile/lib/validation';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
```

This replaces the existing `Button, OtpCodeInput` and `validatePhone, toE164` imports.

Replace the first two state lines with:

```typescript
  const pending = usePendingLinkStore((s) => s.pending);
  const clearPending = usePendingLinkStore((s) => s.clear);
  const [countryCode] = useState('+20');
  // A collision during a Google/Apple sign-up brings the number typed there.
  const [phone, setPhone] = useState(() => fromE164('+20', pending?.phoneHint ?? null));
```

In `handleSignIn`, change `onSuccess: () => router.replace('/'),` to:

```typescript
        onSuccess: async () => {
          // Completes a Google/Apple collision, if one brought her here.
          await linkPendingCredential();
          router.replace('/');
        },
```

Directly after the header `</View>` (the one closing `styles.header`), add the banner:

```tsx
          {pending && (
            <View style={styles.linkBanner}>
              <Text style={styles.linkBannerText}>
                {`You already have an account. Sign in with your phone once to connect ${SOCIAL_PROVIDER_LABEL[pending.provider]}.`}
              </Text>
              <Pressable onPress={clearPending} hitSlop={8}>
                <Text style={styles.linkBannerDismiss}>Not now</Text>
              </Pressable>
            </View>
          )}
```

Directly after the primary `<Button … />` (Send code / Sign in), add:

```tsx
          {!isCodePhase && (
            <View style={styles.socialSection}>
              <Divider label="or" />
              <SocialAuthButtons context="sign-in" />
            </View>
          )}
```

In `styles/sign-in-screen.styles.ts`, add (import `borderRadius` from `@mobile/theme` if it isn't already):

```typescript
  // Collision banner — a Google/Apple identity waiting to be connected.
  linkBanner: {
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  linkBannerText: {
    ...typeScale.bodyMd,
    color: colors.textPrimary,
  },
  linkBannerDismiss: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primaryDark,
  },

  // "or" + Google/Apple, under the phone door.
  socialSection: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
```

- [ ] **Step 9: Link after an email sign-in too**

In `apps/mobile/src/screens/auth/EmailSignInScreen.tsx`, add `import { linkPendingCredential } from '@mobile/lib/pendingLink';` and change `onSuccess: () => router.replace('/'),` to:

```typescript
        onSuccess: async () => {
          // Completes a Google/Apple collision, if one brought her here.
          await linkPendingCredential();
          router.replace('/');
        },
```

In `EmailSignInScreen.test.tsx`, replace the firebase mock with one that also exposes a signed-in user:

```typescript
const mockSignInWithEmailAndPassword = jest.fn();
const mockLinkWithCredential = jest.fn();
// babel-plugin-jest-hoist only allows a jest.mock() factory to close over
// variables whose name starts with "mock" (see SignInScreen.test.tsx).
jest.mock('@mobile/lib/firebase', () => ({
  auth: Object.assign(
    () => ({
      signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
      get currentUser() {
        return { linkWithCredential: mockLinkWithCredential };
      },
    }),
    { EmailAuthProvider: { credential: jest.fn() } },
  ),
}));
```

Add `import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';` below the screen import, and `usePendingLinkStore.getState().clear();` inside `beforeEach`. Then add:

```typescript
it('connects a pending Google identity once signed in', async () => {
  const credential = { providerId: 'google.com', token: 't', secret: '' };
  usePendingLinkStore.getState().set({ provider: 'google', credential: credential as never, phoneHint: null });
  mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  mockLinkWithCredential.mockResolvedValue(undefined);
  renderScreen();

  fireEvent.changeText(screen.getByTestId('emailSignIn.email'), 'mona@example.com');
  fireEvent.changeText(screen.getByTestId('emailSignIn.password'), 'Password1');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockLinkWithCredential).toHaveBeenCalledWith(credential);
  expect(usePendingLinkStore.getState().pending).toBeNull();
});
```

- [ ] **Step 10: Update `RoleSelectionScreen` and its test**

In `apps/mobile/src/screens/auth/RoleSelectionScreen.tsx`:

Add the imports:

```typescript
import { Button, Divider } from '@mobile/components/ui';
import SocialAuthButtons from '@mobile/components/SocialAuthButtons';
import { SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
```

This replaces `import { Button } from '@mobile/components/ui';`.

After `const resetDraft = …`, add:

```typescript
  // Arrived from "Continue with Google/Apple" on sign-in as a new person: she
  // is already signed in with that provider and her draft holds what it gave.
  const authProvider = useRegistrationDraftStore((s) => s.authProvider);
  const socialEmail = useRegistrationDraftStore((s) => s.email);
  const isSocial = authProvider !== 'phone';
```

Replace `handleContinue`'s body with:

```typescript
    if (!selectedRole) return;
    if (isSocial) {
      // Keep what Google/Apple supplied; only the role is new.
      patchDraft({ role: selectedRole });
    } else {
      // Start a fresh draft for this registration attempt and seed the role.
      resetDraft();
      patchDraft({ role: selectedRole });
    }
    router.push({ pathname: '/(auth)/register-step-1', params: { role: selectedRole } });
```

Replace the subtitle `<Text>` content with:

```tsx
          <Text style={styles.subtitle}>
            {isSocial && authProvider !== 'phone'
              ? `Signed in with ${SOCIAL_PROVIDER_LABEL[authProvider]} as ${socialEmail}. Tell us who you are to finish setting up.`
              : 'Tell us who you are so we can set up the right experience for you.'}
          </Text>
```

In the footer, between the Continue `<Button … />` and the `dividerRow` view, add:

```tsx
        {!isSocial && (
          <View style={styles.socialSection}>
            <Divider label="or" />
            <SocialAuthButtons
              context="sign-up"
              role={selectedRole ?? undefined}
              disabled={!selectedRole}
            />
          </View>
        )}
```

Add to `styles/role-selection-screen.styles.ts`:

```typescript
  socialSection: {
    gap: spacing.lg,
  },
```

`RoleSelectionScreen.test.tsx` needs two fixes before its new tests:

- **A query client.** The screen now renders `SocialAuthButtons`, whose `useSocialSignIn` needs a `QueryClientProvider`. Add the import and helper, and replace every `render(<RoleSelectionScreen />)` with `renderScreen()`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
```

```typescript
function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoleSelectionScreen />
    </QueryClientProvider>,
  );
}
```

- **An ambiguous query.** In `'does nothing until a role is picked'`, `getByText(/continue/i)` now matches two buttons ("Continue" and "Continue with Google"). Change it to `getByText('Continue')`.

Then add inside the `describe`:

```typescript
  it('offers Google beside the role choice', () => {
    const { getByText } = renderScreen();
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('keeps a Google draft on Continue and hides the social buttons', () => {
    useRegistrationDraftStore.setState({ authProvider: 'google', email: 'mona@gmail.com', firstName: 'Mona' });
    const { getByText, queryByText } = renderScreen();

    expect(
      getByText('Signed in with Google as mona@gmail.com. Tell us who you are to finish setting up.'),
    ).toBeTruthy();
    expect(queryByText('Continue with Google')).toBeNull();

    fireEvent.press(getByText("I'm a mother"));
    fireEvent.press(getByText('Sign up as a mother'));

    expect(useRegistrationDraftStore.getState()).toMatchObject({
      role: 'parent',
      authProvider: 'google',
      firstName: 'Mona',
      email: 'mona@gmail.com',
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-1', params: { role: 'parent' } });
  });
```

- [ ] **Step 11: Run the auth screen tests, typecheck, commit**

```bash
cd /d/Projects/nanny-app/apps/mobile && npx jest src/components/__tests__/SocialAuthButtons.test.tsx src/screens/auth/__tests__ src/lib/__tests__ && cd ../.. && pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test
git add apps/mobile/src/components/SocialAuthButtons.tsx apps/mobile/src/components/styles/social-auth-buttons.styles.ts apps/mobile/src/lib/validation.ts apps/mobile/src/screens/auth/SignInScreen.tsx apps/mobile/src/screens/auth/styles/sign-in-screen.styles.ts apps/mobile/src/screens/auth/EmailSignInScreen.tsx apps/mobile/src/screens/auth/RoleSelectionScreen.tsx apps/mobile/src/screens/auth/styles/role-selection-screen.styles.ts apps/mobile/src/components/__tests__/SocialAuthButtons.test.tsx apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx apps/mobile/src/screens/auth/__tests__/EmailSignInScreen.test.tsx apps/mobile/src/screens/auth/__tests__/RoleSelectionScreen.test.tsx
```

Also `git add` the validation test file you created or edited in Step 1, by its path. Then commit:

```bash
git commit -m "feat(auth): Continue with Google and Apple on sign-in and sign-up

A pending connection shows a banner on sign-in, prefills the number typed
during the social sign-up, and is linked after the SMS or password sign-in.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The social wizard — step 1 and the phone link on step 3

**Files:**
- Modify: `apps/mobile/src/hooks/useAuth.ts` (adds `useSendPhoneLinkCode`, `useLinkPhoneToCurrentUser`)
- Modify: `apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx`, `apps/mobile/src/screens/auth/styles/registration-step1-screen.styles.ts`
- Modify: `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx`
- Test: `apps/mobile/src/hooks/__tests__/useAuth.phoneLink.test.tsx`, `apps/mobile/src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx` (extended), `apps/mobile/src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx` (new)

**Interfaces:**
- Consumes: `abandonSocialSignUpForLink` (Task 5), `SOCIAL_PROVIDER_LABEL` (Task 4), and the draft's `authProvider` / `socialCredential`.
- Produces, in `@mobile/hooks/useAuth`:
  ```typescript
  export type PhoneLinkChallenge = { verificationId: string | null; autoVerified: boolean; code: string | null };
  export function useSendPhoneLinkCode(): UseMutationResult<PhoneLinkChallenge, MappedAuthError, { phone: string; forceResend?: boolean }>;
  export function useLinkPhoneToCurrentUser(): UseMutationResult<void, MappedAuthError, { challenge: PhoneLinkChallenge; code: string; phone: string }>;
  ```
  The link rejects with `{ field: 'phone', message, code: 'auth/credential-already-in-use' }` when the number belongs to another account.

- [ ] **Step 1: Write the failing hook tests**

Create `apps/mobile/src/hooks/__tests__/useAuth.phoneLink.test.tsx`:

```tsx
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Snapshot = { state: string; verificationId: string | null; code: string | null; error?: unknown };
let mockObserver: ((s: Snapshot) => void) | null = null;
const mockVerifyPhoneNumber = jest.fn(() => ({
  on: (_event: string, observer: (s: Snapshot) => void) => {
    mockObserver = observer;
  },
}));
const mockPhoneCredential = jest.fn((verificationId: string | null, code?: string) => ({ verificationId, code }));
const mockLinkWithCredential = jest.fn();
const mockUnlink = jest.fn();
const mockGetIdToken = jest.fn();
let mockCurrentUser: {
  phoneNumber: string | null;
  linkWithCredential: jest.Mock;
  unlink: jest.Mock;
  getIdToken: jest.Mock;
} | null = null;

jest.mock('@mobile/lib/firebase', () => {
  const authFn = () => ({
    verifyPhoneNumber: mockVerifyPhoneNumber,
    get currentUser() {
      return mockCurrentUser;
    },
  });
  Object.defineProperty(authFn, 'PhoneAuthProvider', {
    enumerable: true,
    get: () => ({ credential: mockPhoneCredential }),
  });
  return { auth: authFn };
});

import { useLinkPhoneToCurrentUser, useSendPhoneLinkCode } from '@mobile/hooks/useAuth';

let currentUnmount: (() => void) | null = null;
function wrap<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(hook, { wrapper: Wrapper });
  currentUnmount = rendered.unmount;
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockObserver = null;
  mockCurrentUser = {
    phoneNumber: null,
    linkWithCredential: mockLinkWithCredential,
    unlink: mockUnlink,
    getIdToken: mockGetIdToken,
  };
  mockLinkWithCredential.mockResolvedValue(undefined);
  mockGetIdToken.mockResolvedValue('token');
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
});

describe('useSendPhoneLinkCode', () => {
  it('resolves as soon as the code is sent — without signing anyone in', async () => {
    const { result } = wrap(() => useSendPhoneLinkCode());
    const pending = result.current.mutateAsync({ phone: '+201234567891' });
    await Promise.resolve();
    mockObserver?.({ state: 'sent', verificationId: 'vid', code: null });

    await expect(pending).resolves.toEqual({ verificationId: 'vid', autoVerified: false, code: null });
    expect(mockVerifyPhoneNumber).toHaveBeenCalledWith('+201234567891', false);
  });

  it('reports an Android auto-verification with its code', async () => {
    const { result } = wrap(() => useSendPhoneLinkCode());
    const pending = result.current.mutateAsync({ phone: '+201234567891', forceResend: true });
    await Promise.resolve();
    mockObserver?.({ state: 'verified', verificationId: 'vid', code: '123456' });

    await expect(pending).resolves.toEqual({ verificationId: 'vid', autoVerified: true, code: '123456' });
    expect(mockVerifyPhoneNumber).toHaveBeenCalledWith('+201234567891', true);
  });

  it('maps a failure', async () => {
    const { result } = wrap(() => useSendPhoneLinkCode());
    const pending = result.current.mutateAsync({ phone: '+20' });
    await Promise.resolve();
    mockObserver?.({ state: 'error', verificationId: null, code: null, error: { code: 'auth/invalid-phone-number' } });

    await expect(pending).rejects.toEqual({ field: 'phone', message: "That phone number doesn't look right." });
  });
});

describe('useLinkPhoneToCurrentUser', () => {
  const CHALLENGE = { verificationId: 'vid', autoVerified: false, code: null };

  it('links the phone onto the signed-in account and refreshes the token', async () => {
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891' });

    expect(mockPhoneCredential).toHaveBeenCalledWith('vid', '111111');
    expect(mockLinkWithCredential).toHaveBeenCalledWith({ verificationId: 'vid', code: '111111' });
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  it("uses the native side's credential after an instant verification", async () => {
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({
      challenge: { verificationId: null, autoVerified: true, code: null },
      code: '',
      phone: '+201234567891',
    });

    expect(mockPhoneCredential).toHaveBeenCalledWith(null);
  });

  it('flags a number that belongs to another account', async () => {
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/credential-already-in-use' });
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await expect(
      result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891' }),
    ).rejects.toMatchObject({ field: 'phone', code: 'auth/credential-already-in-use' });
  });

  it('treats the same number already linked (a retry) as done', async () => {
    mockCurrentUser!.phoneNumber = '+201234567891';
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/provider-already-linked' });
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891' });

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  it('swaps a different number left by an abandoned attempt', async () => {
    mockCurrentUser!.phoneNumber = '+201111111111';
    mockLinkWithCredential
      .mockRejectedValueOnce({ code: 'auth/provider-already-linked' })
      .mockResolvedValueOnce(undefined);
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891' });

    expect(mockUnlink).toHaveBeenCalledWith('phone');
    expect(mockLinkWithCredential).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/hooks/__tests__/useAuth.phoneLink.test.tsx`
Expected: FAIL. `useSendPhoneLinkCode` is not exported.

- [ ] **Step 3: Write the two hooks**

In `apps/mobile/src/hooks/useAuth.ts`, add after `useConfirmPhoneAndLink`:

```typescript
/**
 * A code sent to link a phone onto the account that is already signed in —
 * the Google/Apple wizard's step 3. On Android, Firebase can read the SMS
 * itself (`autoVerified` with the `code` filled in) or skip it entirely on an
 * instant verification (`autoVerified` with no code), in which case the
 * native side holds the credential.
 */
export type PhoneLinkChallenge = {
  verificationId: string | null;
  autoVerified: boolean;
  code: string | null;
};

const PHONE_TAKEN_ERROR: MappedAuthError = {
  field: 'phone',
  message: 'This phone number already has an account.',
  code: 'auth/credential-already-in-use',
};

/**
 * Sends the SMS for linking, not for signing in: `verifyPhoneNumber` leaves
 * the signed-in Google/Apple account alone, where `signInWithPhoneNumber`
 * would replace it.
 *
 * Resolves on the first usable event. The listener's own promise is not used:
 * on Android it waits out the whole auto-retrieval timeout before settling.
 */
export function useSendPhoneLinkCode() {
  return useMutation<PhoneLinkChallenge, MappedAuthError, { phone: string; forceResend?: boolean }>({
    mutationFn: ({ phone, forceResend }) =>
      new Promise<PhoneLinkChallenge>((resolve, reject) => {
        auth()
          .verifyPhoneNumber(phone, forceResend ?? false)
          .on(
            'state_changed',
            (snapshot) => {
              if (snapshot.state === 'sent' || snapshot.state === 'timeout') {
                resolve({ verificationId: snapshot.verificationId, autoVerified: false, code: null });
              } else if (snapshot.state === 'verified') {
                resolve({ verificationId: snapshot.verificationId, autoVerified: true, code: snapshot.code });
              } else if (snapshot.state === 'error') {
                reject(mapFirebaseAuthError(snapshot.error));
              }
            },
            (error) => reject(mapFirebaseAuthError(error)),
          );
      }),
  });
}

/**
 * Links the verified phone onto the signed-in Google/Apple account, so SMS
 * sign-in and SMS reset reach the same uid. Then refreshes the ID token so
 * `/auth/register` sees `phone_number` and marks the phone verified.
 *
 * A number that already belongs to another account rejects with
 * `code: 'auth/credential-already-in-use'` — the caller's cue for collision B.
 * Idempotent across retries: the same number already linked is done; a
 * different one left by an abandoned attempt is swapped, as the phone wizard
 * does for its password credential.
 */
export function useLinkPhoneToCurrentUser() {
  return useMutation<void, MappedAuthError, { challenge: PhoneLinkChallenge; code: string; phone: string }>({
    mutationFn: async ({ challenge, code, phone }) => {
      const user = auth().currentUser;
      if (!user) {
        throw {
          field: 'form',
          message: 'Your session ended. Please continue with Google or Apple again.',
        } satisfies MappedAuthError;
      }

      const credential =
        challenge.autoVerified && !challenge.code
          ? auth.PhoneAuthProvider.credential(null)
          : auth.PhoneAuthProvider.credential(challenge.verificationId, challenge.code ?? code);

      const toMapped = (error: unknown): MappedAuthError =>
        (error as { code?: unknown })?.code === 'auth/credential-already-in-use'
          ? PHONE_TAKEN_ERROR
          : mapFirebaseAuthError(error);

      try {
        await user.linkWithCredential(credential);
      } catch (error) {
        if ((error as { code?: unknown })?.code !== 'auth/provider-already-linked') throw toMapped(error);
        if (user.phoneNumber !== phone) {
          try {
            await user.unlink('phone');
            await user.linkWithCredential(credential);
          } catch (relinkError) {
            throw toMapped(relinkError);
          }
        }
      }

      await user.getIdToken(true);
    },
  });
}
```

If the mock's `verifyPhoneNumber(...).on` return type trips the typecheck in the test only, cast in the test, not in the hook.

- [ ] **Step 4: Run the hook tests to verify they pass**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/hooks/__tests__/useAuth.phoneLink.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing step 1 tests**

In `RegistrationStep1Screen.test.tsx`:

Change the router mock to expose `replace`:

```typescript
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ role: 'parent' }),
}));

const mockAbandon = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/pendingLink', () => ({
  abandonSocialSignUpForLink: (...args: unknown[]) => mockAbandon(...args),
}));
```

Append a describe block:

```typescript
describe('RegistrationStep1Screen — Google/Apple sign-up', () => {
  function fillSocialDraft() {
    fillDraft();
    useRegistrationDraftStore.setState({ authProvider: 'google', email: 'mona@gmail.com' });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    useRegistrationDraftStore.getState().reset();
  });

  it('shows the provider-verified email read-only and counts three steps', () => {
    fillSocialDraft();
    const { getByDisplayValue, getByText } = renderScreen();

    expect(getByDisplayValue('mona@gmail.com').props.editable).toBe(false);
    expect(getByText('Verified by Google')).toBeTruthy();
    expect(getByText('STEP 1 OF 3 — PERSONAL INFO')).toBeTruthy();
  });

  it('skips the email-code and password steps', async () => {
    fillSocialDraft();
    mockPost.mockResolvedValueOnce(availability(false, false));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-2', params: { role: 'parent' } }),
    );
  });

  it('hands a taken phone to the collision flow instead of flagging the field', async () => {
    fillSocialDraft();
    mockPost.mockResolvedValueOnce(availability(false, true));
    const { getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in'));
    expect(mockAbandon).toHaveBeenCalledWith('+201234567893');
    expect(queryByText(PHONE_TAKEN)).toBeNull();
  });
});
```

Use this file's existing `renderScreen`, `fillDraft`, `availability` and `mockPost` helpers.

- [ ] **Step 6: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`
Expected: FAIL. The three new tests fail; the existing tests still pass.

- [ ] **Step 7: Update step 1**

In `apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx`:

Add the imports:

```typescript
import { abandonSocialSignUpForLink } from '@mobile/lib/pendingLink';
import { SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
```

After `const patch = …`, add:

```typescript
  // A Google/Apple sign-up: the provider verified the email, so it is fixed,
  // and the email-code and password steps are skipped.
  const isSocial = draft.authProvider !== 'phone';
  const stepLabel = isSocial
    ? isNanny ? 'STEP 1 OF 5' : 'STEP 1 OF 3'
    : isNanny ? 'STEP 1 OF 6' : 'STEP 1 OF 5';
```

In `handleContinue`, replace the three lines after the availability `try/catch`:

```typescript
    setEmailError(availability.emailTaken ? EMAIL_TAKEN_MESSAGE : null);
    setPhoneError(availability.phoneTaken ? PHONE_TAKEN_MESSAGE : null);
    if (availability.emailTaken || availability.phoneTaken) return;

    router.push({ pathname: '/(auth)/register-email', params: { role } });
```

with:

```typescript
    if (isSocial && (availability.emailTaken || availability.phoneTaken)) {
      // Collision B: this person already has an account. Drop the Google/Apple
      // account just created, keep the credential, and have them sign in with
      // the number they typed — the credential is linked once they do.
      await abandonSocialSignUpForLink(toE164(draft.countryCode, draft.phone));
      router.replace('/(auth)/sign-in');
      return;
    }
    setEmailError(availability.emailTaken ? EMAIL_TAKEN_MESSAGE : null);
    setPhoneError(availability.phoneTaken ? PHONE_TAKEN_MESSAGE : null);
    if (availability.emailTaken || availability.phoneTaken) return;

    if (isSocial) {
      // Both roles set a home location next, as CreatePasswordScreen routes
      // the phone wizard.
      router.push({
        pathname: isNanny ? '/(auth)/register-nanny-location' : '/(auth)/register-step-2',
        params: { role },
      });
      return;
    }
    router.push({ pathname: '/(auth)/register-email', params: { role } });
```

Replace the step label text with:

```tsx
            {stepLabel} — PERSONAL INFO
```

Replace the progress-fill style array with:

```tsx
          <View
            style={[
              styles.progressBarFill,
              isNanny && styles.progressBarFillNanny,
              isSocial && !isNanny && styles.progressBarFillSocialMother,
            ]}
          />
```

The social nanny's five steps use the default 20% width.

On the email `TextInputField`, add `editable={!isSocial}`. Directly after that field, add:

```tsx
            {isSocial && draft.authProvider !== 'phone' && (
              <Text style={styles.verifiedHint}>
                {`Verified by ${SOCIAL_PROVIDER_LABEL[draft.authProvider]}`}
              </Text>
            )}
```

In `styles/registration-step1-screen.styles.ts`, add (import `typeScale` if it isn't already):

```typescript
  // Social mother: three steps, so step 1 fills a third.
  progressBarFillSocialMother: {
    width: '33.3%',
  },
  verifiedHint: {
    ...typeScale.bodySm,
    color: colors.successText,
    marginTop: -spacing.sm,
  },
```

- [ ] **Step 8: Run the step 1 tests to verify they pass**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`
Expected: PASS, both the existing and the new tests.

- [ ] **Step 9: Write the failing step 3 tests**

Create `apps/mobile/src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
}));

type Opts<T> = { onSuccess?: (v: T) => void; onError?: (e: { message: string }) => void };
const mockSendOtp = jest.fn((_v: unknown, o: Opts<unknown>) => o.onSuccess?.({ confirm: jest.fn() }));
const mockSendLinkCode = jest.fn((_v: unknown, o: Opts<unknown>) =>
  o.onSuccess?.({ verificationId: 'vid', autoVerified: false, code: null }),
);
const mockConfirmPhone = jest.fn().mockResolvedValue(undefined);
const mockLinkPhone = jest.fn().mockResolvedValue(undefined);
const mockRegister = jest.fn().mockResolvedValue({ id: 1 });
jest.mock('@mobile/hooks/useAuth', () => ({
  useSendPhoneOtp: () => ({ mutate: mockSendOtp, isPending: false }),
  useSendPhoneLinkCode: () => ({ mutate: mockSendLinkCode, isPending: false }),
  useConfirmPhoneAndLink: () => ({ mutateAsync: mockConfirmPhone, isPending: false }),
  useLinkPhoneToCurrentUser: () => ({ mutateAsync: mockLinkPhone, isPending: false }),
  useRegisterProfile: () => ({ mutateAsync: mockRegister, isPending: false }),
}));
jest.mock('@mobile/hooks/useReferrals', () => ({
  useRedeemReferralCode: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@mobile/components/ReferralCodeField', () => () => null);
jest.mock('@mobile/lib/storage', () => ({ uploadImageToFirebase: jest.fn() }));
const mockAbandon = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/pendingLink', () => ({
  abandonSocialSignUpForLink: (...args: unknown[]) => mockAbandon(...args),
}));

import RegistrationStep3Screen from '@mobile/screens/auth/RegistrationStep3Screen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

function seedMotherDraft(extra: Record<string, unknown>) {
  useRegistrationDraftStore.setState({
    role: 'parent',
    firstName: 'Mona',
    lastName: 'Adel',
    email: 'mona@gmail.com',
    countryCode: '+20',
    phone: '1234567891',
    dob: '05/10/1990',
    latitude: 30.04,
    longitude: 31.23,
    ...extra,
  });
}

function renderScreen() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrationStep3Screen />
    </QueryClientProvider>,
  );
}

function completeSetup() {
  fireEvent.changeText(screen.getByTestId('registerStep3.code'), '111111');
  fireEvent.press(screen.getByText('I agree to Terms of Service and Privacy Policy'));
  fireEvent.press(screen.getByText('Complete setup'));
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
});

it('phone wizard: confirms, links the password, and registers with the email token', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  renderScreen();
  expect(mockSendOtp).toHaveBeenCalledTimes(1);

  completeSetup();

  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
  expect(mockConfirmPhone).toHaveBeenCalledWith(
    expect.objectContaining({ code: '111111', email: 'mona@gmail.com', password: 'Passw0rd!' }),
  );
  expect(mockRegister.mock.calls[0][0]).toMatchObject({ emailVerificationToken: 'tok', phone: '+201234567891' });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/notification-permission', params: { role: 'parent' } });
});

it('Google wizard: links the phone onto the signed-in account and registers without a token', async () => {
  seedMotherDraft({ authProvider: 'google' });
  renderScreen();
  expect(mockSendLinkCode).toHaveBeenCalledWith({ phone: '+201234567891', forceResend: false }, expect.anything());
  expect(mockSendOtp).not.toHaveBeenCalled();

  completeSetup();

  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
  expect(mockLinkPhone).toHaveBeenCalledWith({
    challenge: { verificationId: 'vid', autoVerified: false, code: null },
    code: '111111',
    phone: '+201234567891',
  });
  expect(mockRegister.mock.calls[0][0]).not.toHaveProperty('emailVerificationToken');
});

it('Google wizard: a number that already has an account starts the collision flow', async () => {
  seedMotherDraft({ authProvider: 'google' });
  mockLinkPhone.mockRejectedValueOnce({
    field: 'phone',
    message: 'This phone number already has an account.',
    code: 'auth/credential-already-in-use',
  });
  renderScreen();

  completeSetup();

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in'));
  expect(mockAbandon).toHaveBeenCalledWith('+201234567891');
  expect(mockRegister).not.toHaveBeenCalled();
});
```

If the terms label is split into nested `<Text>` nodes that RNTL does not join, press it with `screen.getByText(/I agree to/)` instead.

- [ ] **Step 10: Run it to verify it fails**

Run: `cd /d/Projects/nanny-app/apps/mobile && npx jest src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx`
Expected: FAIL. The screen doesn't use `useSendPhoneLinkCode`, `mutateAsync` or `abandonSocialSignUpForLink` yet.

- [ ] **Step 11: Rewrite step 3's auth half**

In `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx`:

Replace the `useAuth` import and add the rest:

```typescript
import {
  useConfirmPhoneAndLink,
  useLinkPhoneToCurrentUser,
  useRegisterProfile,
  useSendPhoneLinkCode,
  useSendPhoneOtp,
  type PhoneLinkChallenge,
} from '@mobile/hooks/useAuth';
import type { MappedAuthError } from '@mobile/lib/authErrors';
import { abandonSocialSignUpForLink } from '@mobile/lib/pendingLink';
```

Above the component, add:

```typescript
/**
 * What the code on this screen is checked against. The phone wizard signs in
 * *with* the phone (then links the password onto that account); a Google/Apple
 * wizard is already signed in and links the phone *onto* that account.
 */
type PhoneChallenge =
  | { kind: 'sign-in'; confirmation: PhoneConfirmation }
  | { kind: 'link'; link: PhoneLinkChallenge };
```

Inside the component:

Replace the hook calls and the `confirmation` state:

```typescript
  const isSocial = draft.authProvider !== 'phone';

  const sendOtp = useSendPhoneOtp();
  const sendLinkCode = useSendPhoneLinkCode();
  const confirmPhone = useConfirmPhoneAndLink();
  const linkPhone = useLinkPhoneToCurrentUser();
  const registerProfile = useRegisterProfile();
  const redeemReferral = useRedeemReferralCode();
```

```typescript
  // Firebase's handle on the SMS it sent; the code is checked against it.
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
```

Replace `sendCode` with:

```typescript
  const sendCode = useCallback(
    (forceResend: boolean) => {
      setFormError(null);
      const onError = (err: MappedAuthError) => setFormError(err.message);
      if (isSocial) {
        sendLinkCode.mutate(
          { phone: phoneE164, forceResend },
          {
            onSuccess: (link) => {
              setChallenge({ kind: 'link', link });
              // Android read the SMS itself — fill the boxes in for her.
              if (link.code) setOtp(link.code);
              setSecondsLeft(RESEND_SECONDS);
            },
            onError,
          },
        );
      } else {
        sendOtp.mutate(
          { phone: phoneE164, forceResend },
          {
            onSuccess: (confirmation) => {
              setChallenge({ kind: 'sign-in', confirmation });
              setSecondsLeft(RESEND_SECONDS);
            },
            onError,
          },
        );
      }
    },
    // The mutation objects are new every render; the mutations are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phoneE164, isSocial],
  );

  // Android verified the number without an SMS at all: there is no code to type.
  const instantlyVerified =
    challenge?.kind === 'link' && challenge.link.autoVerified && !challenge.link.code;
```

Replace `handleCompleteSetup` entirely with:

```typescript
  async function handleCompleteSetup() {
    if (!challenge) {
      setFormError("We haven't sent your code yet. Tap resend to try again.");
      return;
    }
    if (!instantlyVerified && otp.length !== OTP_LENGTH) {
      setFormError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    if (!termsAccepted) return;
    setFormError(null);

    const dobIso = dobToIso(draft.dob);
    if (!dobIso) {
      setFormError('Date of birth is invalid. Please go back and fix it.');
      return;
    }

    // Step 2 blocks Continue without a pin, but guard anyway — the backend
    // requires coordinates.
    const { latitude, longitude } = draft;
    if (latitude === null || longitude === null) {
      setFormError('Home location is missing. Please go back and set it on the map.');
      return;
    }

    const localRole = draft.role ?? 'parent';
    // Mobile uses 'parent' / 'nanny'; backend enum is 'MOTHER' / 'NANNY'.
    const apiRole = localRole === 'parent' ? 'MOTHER' : 'NANNY';

    // One address: the real one — proved on step 2 by the phone wizard, or by
    // Google/Apple for a social sign-up. It is `users.email`, and for the phone
    // wizard also the Firebase password credential.
    const profileEmail = draft.email.trim().toLowerCase();

    // A social sign-up has no token: Firebase verified its address, and the
    // backend checks that instead.
    const emailVerificationToken = draft.emailVerificationToken;
    if (!isSocial && !emailVerificationToken) {
      setFormError('Your email is not verified. Please go back and confirm the code.');
      return;
    }

    // 1. Put the verified phone on the Firebase account.
    try {
      if (challenge.kind === 'sign-in') {
        await confirmPhone.mutateAsync({
          confirmation: challenge.confirmation,
          code: otp,
          email: profileEmail,
          password: draft.password,
        });
      } else {
        await linkPhone.mutateAsync({ challenge: challenge.link, code: otp, phone: phoneE164 });
      }
    } catch (error) {
      const err = error as MappedAuthError;
      if (isSocial && err.code === 'auth/credential-already-in-use') {
        // Collision B: this number belongs to an account that already exists.
        await abandonSocialSignUpForLink(phoneE164);
        router.replace('/(auth)/sign-in');
        return;
      }
      setFormError(err.message);
      return;
    }

    patch({ termsAcceptedAt: Date.now() });

    // 2. Nannies must supply their ID (both sides for a national ID, front
    // only for a passport). Uploaded now that the account is signed in
    // (uploadImageToFirebase needs the uid) and before the profile is saved,
    // so the URLs go out with the register request. The profile photo
    // uploads alongside it for the same reason.
    let idDocumentFrontUrl: string | undefined;
    let idDocumentBackUrl: string | undefined;
    let avatarUrl: string | undefined;
    const idDocumentType = draft.idDocumentType ?? undefined;
    if (apiRole === 'NANNY') {
      const needsBack = draft.idDocumentType != null && idTypeRequiresBack(draft.idDocumentType);
      if (!draft.idDocumentType || !draft.idFrontUri || (needsBack && !draft.idBackUri)) {
        setFormError('Your ID is missing. Please go back and upload it.');
        return;
      }
      if (!draft.photoUri) {
        setFormError('Your profile photo is missing. Please go back and add it.');
        return;
      }
      try {
        setIsUploadingId(true);
        idDocumentFrontUrl = await uploadImageToFirebase(draft.idFrontUri, 'nanny-ids');
        if (needsBack && draft.idBackUri) {
          idDocumentBackUrl = await uploadImageToFirebase(draft.idBackUri, 'nanny-ids');
        }
        avatarUrl = await uploadImageToFirebase(draft.photoUri, 'avatars');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Could not upload your ID. Please try again.');
        return;
      } finally {
        setIsUploadingId(false);
      }
    }

    // 3. Create the application account. Idempotent on the backend, so
    // tapping Complete setup again after a failure is a safe retry.
    try {
      await registerProfile.mutateAsync({
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: profileEmail,
        // Spent server-side inside the register transaction — this is what
        // makes a phone sign-up start out with a verified address.
        ...(emailVerificationToken ? { emailVerificationToken } : {}),
        phone: phoneE164,
        dateOfBirth: dobIso,
        role: apiRole,
        termsAcceptedVersion: TERMS_VERSION,
        address: draft.address || undefined,
        latitude,
        longitude,
        idDocumentType,
        idDocumentFrontUrl,
        idDocumentBackUrl,
        ...(apiRole === 'NANNY' && {
          avatarUrl,
          bio: draft.bio,
          yearsOfExperience: draft.yearsOfExperience
            ? parseInt(draft.yearsOfExperience, 10)
            : undefined,
          ageRanges: draft.ageRanges,
          availabilityType: draft.availabilityType ?? undefined,
          schedule: draft.schedule ?? undefined,
          certificationIds: draft.certificationIds,
          skillIds: draft.skillIds,
        }),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save your profile.');
      return;
    }

    // 4. Redeem any referral code now that the account exists. Deliberately
    // non-blocking: a failed redeem must never strand her mid-onboarding.
    const code = referralCode.trim();
    if (apiRole === 'MOTHER' && code) {
      try {
        await redeemReferral.mutateAsync(code);
      } catch {
        // Swallowed on purpose — see above.
      }
    }
    resetDraft();
    router.replace({ pathname: '/(auth)/notification-permission', params: { role: localRole } });
  }
```

Replace `isSubmitting` / `canSubmit` with:

```typescript
  const isSubmitting =
    confirmPhone.isPending || linkPhone.isPending || isUploadingId || registerProfile.isPending;
  const canSubmit =
    challenge !== null &&
    (instantlyVerified || otp.length === OTP_LENGTH) &&
    termsAccepted &&
    !isSubmitting;
  const resendDisabled = secondsLeft > 0 || sendOtp.isPending || sendLinkCode.isPending;
```

In the JSX:
- Show `Sending code…` when `sendOtp.isPending || sendLinkCode.isPending`.
- Replace the subtitle `<Text>` with:

```tsx
          <Text style={styles.subtitle}>
            {instantlyVerified ? (
              'Your number was verified automatically.'
            ) : (
              <>
                {`Enter the ${OTP_LENGTH}-digit code we sent to `}
                <Text style={styles.phoneHighlight}>{phoneDisplay}</Text>
              </>
            )}
          </Text>
```

- Render the `OtpCodeInput` only when `!instantlyVerified`.
- Change the Complete-setup `title` so the first branch reads `confirmPhone.isPending || linkPhone.isPending ? 'Verifying…'`.
- Change `onPress={handleCompleteSetup}` to `onPress={() => void handleCompleteSetup()}`.

Remove the now-unused `confirmation` state and any unused import.

- [ ] **Step 12: Run the step 3 tests, the whole mobile suite, typecheck**

```bash
cd /d/Projects/nanny-app/apps/mobile && npx jest src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx && cd ../.. && pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test
```

Expected: PASS and all green.

- [ ] **Step 13: Commit**

```bash
git add apps/mobile/src/hooks/useAuth.ts apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx apps/mobile/src/screens/auth/styles/registration-step1-screen.styles.ts apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx apps/mobile/src/hooks/__tests__/useAuth.phoneLink.test.tsx apps/mobile/src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx apps/mobile/src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx
git commit -m "feat(auth): the Google/Apple sign-up wizard

Step 1 fixes the provider-verified email and skips the email-code and
password steps. Step 3 links the phone onto the signed-in account instead of
signing in with it, and registers without a token. A taken phone or email,
found at either step, starts the collision flow.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Device E2E — Google sign-up, sign-in, and collision B

Use the `mobile-e2e-lab` skill for everything about bringing the lab up and running flows. Its five traps and the `mobile-device-lab` memory apply.

**Files:**
- Modify: `apps/mobile/e2e/accounts.mjs`, `apps/mobile/e2e/run.mjs`, `apps/mobile/e2e/scripts/advance.js`, `apps/mobile/e2e/README.md`
- Modify: `apps/backend/test/e2e/seed-mobile.ts`
- Create: `apps/mobile/e2e/flows/c11-google-sign-up.yaml`, `apps/mobile/e2e/flows/c12-google-collision.yaml`

**Interfaces:**
- Consumes: the E2E Google picker (testID `e2eGooglePicker.email`, button `Use this Google account`), `Continue with Google`, the banner copy, and `Verified by Google`.
- Produces: the advance step `emulator-providers`. Env `OTP_PHONE` → `output.providers` (a comma-joined string) and `output.hasGoogle` (`'true'`/`'false'`).

- [ ] **Step 1: Add the accounts**

Append to `apps/mobile/e2e/accounts.mjs`, after `REGISTRATION_NANNY`:

```javascript
/**
 * The Google sign-up C11 drives through the E2E Google picker (lib/socialAuth):
 * the picker hands the Auth emulator an unsigned Google identity for `email`,
 * so no real Google account is involved. Throwaway like REGISTRATION — the
 * seeder wipes it, by email and phone, before each run.
 */
export const SOCIAL_REGISTRATION = {
  phone: '+201100000007',
  email: 'e2e-google-reg@nannyapp.test',
  role: 'MOTHER',
};

/**
 * The Google identity C12 signs up with before finding that the seeded
 * mother's phone is taken. It never gets a row; the seeder deletes any
 * Google-only Firebase account a crashed run left under this address, and
 * unlinks it from the mother, where the previous run connected it.
 */
export const SOCIAL_COLLISION = {
  email: 'e2e-google-collide@nannyapp.test',
};
```

- [ ] **Step 2: Pass them through `run.mjs`**

Add `SOCIAL_COLLISION` and `SOCIAL_REGISTRATION` to the `accounts.mjs` import list.

Extend `E2E_MOBILE_WIPE` in the seeder invocation:

```javascript
        E2E_MOBILE_WIPE: JSON.stringify([
          { phone: REGISTRATION.phone, role: REGISTRATION.role, email: REGISTRATION.email },
          {
            phone: REGISTRATION_NANNY.phone,
            role: REGISTRATION_NANNY.role,
            email: REGISTRATION_NANNY.email,
          },
          // C11 signs up with Google from scratch; C12's throwaway Google
          // account has no phone, only the address.
          { phone: SOCIAL_REGISTRATION.phone, role: SOCIAL_REGISTRATION.role, email: SOCIAL_REGISTRATION.email },
          { email: SOCIAL_COLLISION.email },
        ]),
```

Update the comment above it to say "two mothers (C2/C7, C11) … and C12's Google identity".

In `runFlow`'s `params`, after the `REGISTRATION_NANNY_*` entries, add:

```javascript
    // Google sign-up (C11): the address typed into the E2E Google picker, and
    // the number the social wizard links onto that Google account.
    SOCIAL_REGISTRATION_EMAIL: SOCIAL_REGISTRATION.email,
    SOCIAL_REGISTRATION_PHONE: localDigits(SOCIAL_REGISTRATION.phone),
    SOCIAL_REGISTRATION_PHONE_E164: SOCIAL_REGISTRATION.phone,
    // Collision B (C12): a new Google identity that types the seeded mother's
    // number, so it must end up linked onto her account.
    SOCIAL_COLLISION_EMAIL: SOCIAL_COLLISION.email,
```

- [ ] **Step 3: Teach the seeder about Google identities**

In `apps/backend/test/e2e/seed-mobile.ts`, in `ensureFirebaseUser`, replace:

```typescript
    const existing = await firebaseAuth.getUserByEmail(email);
    // Reset the password (and re-link the phone): a half-provisioned account
    // from an earlier run would otherwise fail sign-in with a stale credential.
    await firebaseAuth.updateUser(existing.uid, fields);
    return existing.uid;
```

with:

```typescript
    const existing = await firebaseAuth.getUserByEmail(email);
    // Reset the password (and re-link the phone): a half-provisioned account
    // from an earlier run would otherwise fail sign-in with a stale credential.
    // And drop a Google identity C12 linked last run — left on, it would sign
    // straight into this account instead of reaching the collision it tests.
    const hasGoogle = existing.providerData.some((p) => p.providerId === 'google.com');
    await firebaseAuth.updateUser(
      existing.uid,
      hasGoogle ? { ...fields, providersToUnlink: ['google.com'] } : fields,
    );
    return existing.uid;
```

Change `wipeAccount` to accept an email-only spec:

```typescript
async function wipeAccount(spec: { phone?: string; role?: string; email: string }): Promise<void> {
  const email = spec.email;

  // Look the DB row up by phone, not email: a run that crashed before the
  // email-verification step never linked one, and phone is the one identifier
  // guaranteed to be on the row from registration's first step. An email-only
  // spec (C12's Google identity) never has a row.
  const user = spec.phone ? await prisma.user.findUnique({ where: { phone: spec.phone } }) : null;
```

Keep the rest of the row-tagging block as is. Build the Firebase lookup list conditionally:

```typescript
  const lookups = [() => firebaseAuth.getUserByEmail(email)];
  if (spec.phone) {
    const phone = spec.phone;
    lookups.push(() => firebaseAuth.getUserByPhoneNumber(phone));
  }
  for (const lookup of lookups) {
```

Change the final log line to `console.log(\`[seed-mobile] wipe      ${spec.phone ?? '(no phone)'}  (${email})\`);`, and update the `main()` parsing type for `E2E_MOBILE_WIPE` to `{ phone?: string; role?: string; email: string }[]`.

Typecheck: `pnpm --filter=@nanny-app/backend typecheck`.

- [ ] **Step 4: Add the `emulator-providers` advance step**

In `apps/mobile/e2e/scripts/advance.js`, add after `phoneOtp`:

```javascript
/**
 * Which sign-in methods the emulator account behind OTP_PHONE carries — the
 * proof a collision really linked Google onto the existing account, which no
 * screen shows. Admin lookup through the emulator's `Bearer owner` token.
 *
 *   - runScript:
 *       file: ../scripts/advance.js
 *       env:
 *         ADVANCE: emulator-providers
 *         OTP_PHONE: ${MOTHER_PHONE_E164}
 *   - assertTrue: ${output.hasGoogle == 'true'}
 */
function emulatorProviders() {
  var url =
    AUTH_EMULATOR_URL +
    '/identitytoolkit.googleapis.com/v1/projects/' +
    AUTH_PROJECT_ID +
    '/accounts:lookup';
  var res = http.post(url, {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ phoneNumber: [OTP_PHONE] }),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error('accounts:lookup → ' + res.status + ' ' + res.body);
  }
  var users = json(res.body).users || [];
  if (users.length !== 1) {
    throw new Error('Expected one account for ' + OTP_PHONE + ', found ' + users.length + ': ' + res.body);
  }
  var ids = (users[0].providerUserInfo || []).map(function (p) {
    return p.providerId;
  });
  output.providers = ids.join(',');
  output.hasGoogle = ids.indexOf('google.com') >= 0 ? 'true' : 'false';
}
```

Register it in `STEPS` as `'emulator-providers': emulatorProviders,`.

- [ ] **Step 5: Write `c11-google-sign-up.yaml`**

Create `apps/mobile/e2e/flows/c11-google-sign-up.yaml`:

```yaml
# C11 — a mother signs up with Google, then signs in with Google again.
#
# Google's own sheet needs a real Google account on the device, so under the
# Auth emulator "Continue with Google" opens the E2E picker instead
# (lib/socialAuth): the address typed there becomes an unsigned Google
# identity the emulator accepts. Everything after that is the production path
# — signInWithCredential, the /auth/me 404 that marks a new person, the social
# wizard (no email-code or password step), the phone linked onto the Google
# account, and POST /auth/register with no email token.
#
# The second half signs out and comes back through "Welcome back" with the
# same Google identity: a 200 from /auth/me, straight home.
appId: com.nannyapp.mobile
---
- runFlow: _launch.yaml

- tapOn: 'Get Started'
- extendedWaitUntil:
    visible: 'Create your account'
    timeout: 30000

# Google needs a role on this screen; the button is disabled until one is picked.
- tapOn: "I'm a mother"
- tapOn: 'Continue with Google'

- extendedWaitUntil:
    visible: 'Choose a test Google account'
    timeout: 30000
- tapOn:
    id: 'e2eGooglePicker.email'
- inputText: ${SOCIAL_REGISTRATION_EMAIL}
- hideKeyboard
- tapOn: 'Use this Google account'

# ── Step 1 of 3 — Google supplied the name and a verified, fixed email ─────
- extendedWaitUntil:
    visible: 'STEP 1 OF 3.*'
    timeout: 60000
- assertVisible: ${SOCIAL_REGISTRATION_EMAIL}
- assertVisible: 'Verified by Google'

- tapOn: 'Add photo'
- extendedWaitUntil:
    visible: 'Change photo'
    timeout: 30000

- tapOn: '100 000 0000'
- inputText: ${SOCIAL_REGISTRATION_PHONE}
- hideKeyboard
- scrollUntilVisible:
    element:
      text: 'Select your date of birth'
    direction: DOWN
    timeout: 20000
- tapOn: 'Select your date of birth'
- tapOn: 'OK'
- tapOn: 'Continue'

# No email-code screen, no password screen: straight to location.
- extendedWaitUntil:
    visible: 'Where are you based?'
    timeout: 30000
- tapOn:
    point: '50%,44%'
- tapOn: 'Continue'

# ── Final step — the phone is linked onto the Google account ───────────────
- extendedWaitUntil:
    visible: 'Verify your phone number'
    timeout: 30000
- extendedWaitUntil:
    visible: 'Resend in.*'
    timeout: 30000
- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: phone-otp
      OTP_PHONE: ${SOCIAL_REGISTRATION_PHONE_E164}
- assertTrue: ${output.otp != null}
- tapOn:
    id: 'registerStep3.code.boxes'
- inputText: ${output.otp}
- hideKeyboard
- tapOn: 'I agree to.*'
- tapOn: 'Complete setup'

- extendedWaitUntil:
    visible: 'Stay in the loop'
    timeout: 60000
- tapOn: 'Not now'
- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000

# ── Sign out, then back in with the same Google identity ───────────────────
- tapOn: 'Account'
- scrollUntilVisible:
    element:
      text: 'Sign out'
    direction: DOWN
    centerElement: true
    timeout: 30000
- tapOn: 'Sign out'
- extendedWaitUntil:
    visible: 'Care you can trust'
    timeout: 30000

- tapOn: 'Get Started'
- extendedWaitUntil:
    visible: 'Create your account'
    timeout: 30000
- tapOn: 'Sign in'
- extendedWaitUntil:
    visible: 'Welcome back'
    timeout: 30000
- tapOn: 'Continue with Google'
- extendedWaitUntil:
    visible: 'Choose a test Google account'
    timeout: 30000
- tapOn:
    id: 'e2eGooglePicker.email'
- inputText: ${SOCIAL_REGISTRATION_EMAIL}
- hideKeyboard
- tapOn: 'Use this Google account'

- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000
```

- [ ] **Step 6: Write `c12-google-collision.yaml`**

Create `apps/mobile/e2e/flows/c12-google-collision.yaml`:

```yaml
# C12 — collision B: a Google sign-up that turns out to belong to an existing
# account.
#
# A new Google identity starts the social wizard and types the seeded mother's
# phone. Step 1's availability check finds the number taken, so the app deletes
# the throwaway Google account it just made, keeps the credential, and sends
# her to "Welcome back" with the number prefilled and a banner explaining why.
# Signing in by SMS proves she owns the account; only then is the Google
# identity linked onto it. The last step asks the emulator directly, because
# "linked" is exactly what a screen cannot show.
appId: com.nannyapp.mobile
---
- runFlow: _launch.yaml

- tapOn: 'Get Started'
- extendedWaitUntil:
    visible: 'Create your account'
    timeout: 30000
- tapOn: "I'm a mother"
- tapOn: 'Continue with Google'
- extendedWaitUntil:
    visible: 'Choose a test Google account'
    timeout: 30000
- tapOn:
    id: 'e2eGooglePicker.email'
- inputText: ${SOCIAL_COLLISION_EMAIL}
- hideKeyboard
- tapOn: 'Use this Google account'

- extendedWaitUntil:
    visible: 'STEP 1 OF 3.*'
    timeout: 60000
- tapOn: 'Add photo'
- extendedWaitUntil:
    visible: 'Change photo'
    timeout: 30000
# The seeded mother's number — already an account.
- tapOn: '100 000 0000'
- inputText: ${MOTHER_PHONE}
- hideKeyboard
- scrollUntilVisible:
    element:
      text: 'Select your date of birth'
    direction: DOWN
    timeout: 20000
- tapOn: 'Select your date of birth'
- tapOn: 'OK'
- tapOn: 'Continue'

# ── Sent to sign in, with the reason and the number already there ──────────
- extendedWaitUntil:
    visible: 'You already have an account. Sign in with your phone once to connect Google.'
    timeout: 60000
- tapOn: 'Send code'
- extendedWaitUntil:
    visible: "Didn't get a code?"
    timeout: 60000
- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: phone-otp
      OTP_PHONE: ${MOTHER_PHONE_E164}
- assertTrue: ${output.otp != null}
- tapOn:
    id: 'signIn.code.boxes'
- inputText: ${output.otp}
- hideKeyboard
- tapOn: 'Sign in'

- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000

# ── The proof: Google now hangs off her account ────────────────────────────
- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: emulator-providers
      OTP_PHONE: ${MOTHER_PHONE_E164}
- assertTrue: ${output.hasGoogle == 'true'}
```

- [ ] **Step 7: Rebuild the debug app with the new native modules**

The new packages are native, so Metro alone cannot deliver them. Apply the config plugins and copy the new `google-services.json` into `android/app`, then rebuild:

```bash
cd /d/Projects/nanny-app/apps/mobile && npx expo prebuild --platform android --no-install
```

Then boot the lab emulator and build via `node e2e/build.mjs` (per the skill). Expected: `app-debug.apk` built and installed.

If prebuild warns about overwriting local native changes, stop and report; do not pass `--clean`.

- [ ] **Step 8: Run the two flows twice, then the registration regressions**

Bring up the lab per the `mobile-e2e-lab` skill: test stack, `start:test` backend, `e2e:metro` fully built, emulator Wi-Fi off. Then run:

```bash
cd /d/Projects/nanny-app/apps/mobile && node e2e/run.mjs c11 c12 > "$SCRATCH/e2e-social-1.log" 2>&1
cd /d/Projects/nanny-app/apps/mobile && node e2e/run.mjs c11 c12 > "$SCRATCH/e2e-social-2.log" 2>&1
cd /d/Projects/nanny-app/apps/mobile && node e2e/run.mjs c02 a10 smoke > "$SCRATCH/e2e-regress.log" 2>&1
```

`$SCRATCH` is the session scratchpad. Never pipe `run.mjs` through `grep`.

Expected: `2/2 flows passed` on both runs, and `3/3` on the regressions.

On failure, read the Maestro screenshot under `~/.maestro/tests/<ts>/<flow>/screenshots/` and fix the selector or app code. Re-run until two consecutive greens.

Report any deviation from the flow text above, e.g. a label that needed `.*`.

If `signInWithCredential` against the emulator rejects the JSON claim set from the native Android SDK, switch the seam to an unsigned JWT and re-run. The seam is `socialAuth.ts` `getE2eGoogleCredential`. The JWT is `base64url('{"alg":"none","typ":"JWT"}') + '.' + base64url(claims) + '.'`. Update the socialAuth test to match, and record which form the emulator accepted.

- [ ] **Step 9: Document the flows**

In `apps/mobile/e2e/README.md`, add a section headed "Google sign-in (C11, C12)" covering:
- The E2E Google picker seam: what it is, when it mounts, and why a real Google sheet can't run in the lab.
- `SOCIAL_REGISTRATION` is wiped each run. `SOCIAL_COLLISION` has no row, and the seeder unlinks `google.com` from seeded accounts.
- The `emulator-providers` advance step.
- Apple has no device coverage (iOS only, no iOS lab); it is on the manual matrix in the spec.
- A new native module means `expo prebuild --platform android --no-install` plus `e2e/build.mjs` before flows can run.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/e2e/accounts.mjs apps/mobile/e2e/run.mjs apps/mobile/e2e/scripts/advance.js apps/mobile/e2e/README.md apps/mobile/e2e/flows/c11-google-sign-up.yaml apps/mobile/e2e/flows/c12-google-collision.yaml apps/backend/test/e2e/seed-mobile.ts
```

If Step 8 changed `socialAuth.ts` or its test, stage those files by name too. Then commit:

```bash
git commit -m "test(e2e): Google sign-up, Google sign-in, and collision B on device

The E2E picker stands in for Google's sheet against the Auth emulator; the
rest is the production path. C12 proves through the emulator that Google
really ended up on the existing account.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs and final verification

**Files:**
- Modify: `apps/mobile/CLAUDE.md`
- Modify: `Docs/superpowers/specs/2026-09-23-social-auth-google-apple-design.md` (status line and any measured findings)

- [ ] **Step 1: Document the mobile side**

In `apps/mobile/CLAUDE.md`, under **Known Gotchas**, add:

```markdown
**Google and Apple sign-in**
- Google Sign-In only works on builds signed with a key whose SHA-1 is registered on the
  Firebase Android app. The debug keystore (`android/app/debug.keystore`) and the release key
  are both registered; a new signing key needs its SHA-1 added, then google-services.json
  re-downloaded.
- `extra.googleWebClientId` is read from google-services.json at config time — never hardcode it.
- Apple is iOS-only (`lib/socialAuth.ts` `isAppleSignInAvailable`).
- Under the Auth emulator, "Continue with Google" opens an E2E-only picker instead of Google's
  sheet (`E2eGooglePickerHost`); see e2e/README.md.
- `pendingLinkStore` links whatever it holds on the next successful sign-in, so only a real
  collision may put a credential there. Never persist it.
```

- [ ] **Step 2: Record what implementation measured**

In the spec:
- Change `**Status:**` to `Implemented on \`feat/social-auth\`, pending rollout`.
- Under Collision B step 4, note whether the reused-credential fallback was observed to be needed. The emulator reuse succeeds; Apple is unmeasured until TestFlight.
- Record the E2E token format the emulator accepted (JSON or unsigned JWT), and whether the backend A24 unverified-email case held.

- [ ] **Step 3: Full verification**

```bash
cd /d/Projects/nanny-app
pnpm --filter=@nanny-app/shared typecheck && pnpm --filter=@nanny-app/shared test
pnpm --filter=@nanny-app/backend typecheck && pnpm --filter=@nanny-app/backend test:unit
pnpm --filter=@nanny-app/backend test:integration
pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test
```

The integration run needs the test stack up. Expected: all green. Report the counts:
- backend unit ≥ 955
- integration ≥ 164
- mobile ≥ 233 plus the new tests
- shared ≥ 54

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/CLAUDE.md Docs/superpowers/specs/2026-09-23-social-auth-google-apple-design.md
git commit -m "docs(auth): Google and Apple sign-in gotchas and measured findings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand the manual matrix to the owner**

Real Google and Apple logins against live Firebase cannot be automated. Report the spec's **Manual matrix** table verbatim as the owner's pre-rollout checklist. Those checks need:
- an Android build (debug is fine now that its SHA-1 is registered);
- an iOS TestFlight build from this branch.
