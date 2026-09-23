# Sign in with Google and Apple

**Date:** 2026-09-23
**Status:** Designed, not started — branch `feat/social-auth` (off `feat/phone-first-auth`)
**Builds on:** [Phone-first auth with Firebase-owned password reset](2026-09-23-phone-first-auth-firebase-reset-design.md)

---

## Why

Parents and nannies expect a one-tap door. Every existing door stays: phone +
SMS code (the default), email + password (secondary), and password reset by
Firebase's email link or by SMS. Google and Apple are added beside them, all
on the same Firebase project (`nanny-now-d8518`) and the same
`firebase_uid → users.id` identity model.

## Decisions

| Question | Decision |
|---|---|
| What a brand-new social user completes | The rest of the wizard, **phone verified and linked**. The provider supplies name + a verified email, so the email-code and password steps are skipped. Phone stays everyone's identity, so SMS sign-in and SMS reset work for social users too. |
| When a social identity collides with an existing account | **Link in-flow**: keep the Google/Apple credential, have the user sign in the usual way once, then link. No "Connected accounts" settings screen. |
| Where Apple appears | **iOS only** (the native sheet). App Store rules require it once Google is offered on iOS. Android shows Google only. |
| How the credential is obtained | **Native SDKs**: `@react-native-google-signin/google-signin` and `expo-apple-authentication`, handed to RNFB `auth().signInWithCredential()`. |
| Button placement | "Continue with Google" / "Continue with Apple" on **Welcome back** (`/(auth)/sign-in`) and **Create your account** (`/(auth)/role-selection`), under an "or" divider. |
| A social user's email | The address the provider verified, **read-only**. Apple's private-relay address is accepted — it forwards, so receipts still arrive. |

### Firebase behaviour this relies on

Read from the live project on 2026-09-23 (Identity Toolkit admin config, read-only):

- `signIn.allowDuplicateEmails: false` — **one account per email address**.
- `emailPrivacyConfig.enableImprovedEmailPrivacy: true` — email-enumeration
  protection. `fetchSignInMethodsForEmail` returns nothing, so the app can never
  ask Firebase which method an address uses.
- `google.com` enabled; `apple.com` **not yet enabled**.

With one-account-per-email, [Firebase's trusted-provider rules](https://firebase.google.com/docs/auth/users)
decide what happens when a social sign-in meets an existing account. Accounts
registered through the phone-first wizard hold a verified email.

- **Google with an @gmail.com address that matches** (Google is trusted for
  gmail) → Firebase **links automatically** and signs into the existing uid.
- **Apple sharing the real, matching address** (Apple is always trusted) →
  links automatically.
- **Google with a non-gmail address that matches** (e.g. Workspace) →
  `auth/account-exists-with-different-credential`. Nobody is signed in.
- **Apple with "Hide my email"**, or any provider address that matches nothing →
  a **new** uid. Its owner's phone (or `users.email`) then collides with the
  existing account during the wizard.

## Signing in (`apps/mobile`)

### New units

- **`src/lib/socialAuth.ts`**
  - Exports `getGoogleCredential()` and `getAppleCredential()`. Each resolves
    `{ provider, credential, profile: { firstName, lastName, email } }`, or
    `null` when the user cancels the native sheet.
  - Google: `GoogleSignin.configure({ webClientId })` once, then
    `GoogleSignin.signIn()`, then `auth.GoogleAuthProvider.credential(idToken)`.
  - Apple: generate a random raw nonce and pass `sha256(rawNonce)` (via
    `expo-crypto`) to `AppleAuthentication.signInAsync({ requestedScopes:
    [FULL_NAME, EMAIL], nonce })`. Then
    `auth.AppleAuthProvider.credential(identityToken, rawNonce)`.
  - Apple returns the name **only on the first authorization**. Capture it then;
    on later sign-ins the name fields may be blank.
  - Owns the E2E seam (see Testing).
- **`src/components/auth/SocialAuthButtons.tsx`**
  - Google's button on both platforms. Apple's official
    `AppleAuthenticationButton` on iOS only, and only when
    `AppleAuthentication.isAvailableAsync()` is true.
  - Takes an optional `role` so "Create your account" can pass the selection.
- **`src/hooks/useSocialSignIn.ts`**
  1. Get the credential; if cancelled, do nothing.
  2. Call `auth().signInWithCredential(credential)`.
  3. Call `GET /auth/me`:
     - **200** — an existing account (including the auto-linked cases above).
       Call `router.replace('/')`.
     - **404** — a new person. The Firebase account is **kept**: this is not a
       phone orphan. Seed the registration draft with `authProvider`, name,
       email and `socialCredential`, which is held so that collision B can
       reuse it. Go to `/(auth)/register-step-1` if a role was passed,
       otherwise to `/(auth)/role-selection`.
       - The credential goes on the **draft**, not into `pendingLinkStore`.
         Anything in that store is linked on the next successful sign-in, so
         only an actual collision may put a credential there.
  4. On `auth/account-exists-with-different-credential`, run
     [collision A](#collision-a--at-sign-in).
  5. Map any other error with `mapFirebaseAuthError`, which gains
     `account-exists-with-different-credential`, `user-disabled`, and a generic
     "Google/Apple sign-in failed" for SDK errors.
- **`src/store/pendingLinkStore.ts`**
  - An in-memory Zustand store holding
    `{ provider, credential, phoneHint? } | null`, with `set` and `clear`.
  - **Never persisted.** The credential is a live ID token, so it must never
    reach disk.
  - Whatever it holds is linked on the next successful sign-in, so it is
    cleared eagerly:
    - after any link attempt, whether it succeeds or fails;
    - when a new social attempt starts;
    - when the banner's "Not now" is tapped;
    - by `useSignOut`.

### Existing code touched

- **`useSignOut`**: also calls `GoogleSignin.signOut()` (best-effort, errors
  swallowed), so the next Google tap shows the account picker again.
- **`discardPhoneOnlyAccount`** (`useAuth.ts`), used by `useConfirmPhoneSignIn`
  and `useConfirmPhoneAndResetPassword`:
  - Deletes the Firebase user **only when `providerData` is exactly
    `['phone']`**; otherwise it only signs out.
  - Without this, a social user whose `/auth/register` failed *after* step 3
    linked the phone would be **deleted, Google/Apple identity included**, on
    their next SMS sign-in. This was ledger item M4.
- **`app/index.tsx`**: unchanged. The orphan sign-out still applies. A social
  user who abandons the wizard is signed out on next launch and taps Google
  again to resume, as with the phone wizard; Firebase reuses the leftover
  Google-only uid.

## The social sign-up wizard

**Draft:** `registrationDraftStore` gains two fields:
- `authProvider: 'phone' | 'google' | 'apple'`, defaulting to `'phone'`. Every
  branch below keys off it; the phone wizard is untouched.
- `socialCredential`. The store is in-memory only (no `persist`), which is
  already required for `password`.

**Route order:**

| Wizard | Route |
|---|---|
| Phone (today) | role-selection → step-1 → register-email → register-create-password → (mother) step-2 / (nanny) nanny-location → nanny-id → nanny-details → step-3 |
| Social | role-selection → step-1 → (mother) step-2 / (nanny) nanny-location → nanny-id → nanny-details → step-3 |

**Step 1 (`RegistrationStep1Screen`)**
- First and last name are prefilled and editable.
- Email is prefilled and **read-only**, with the hint "Verified by Google" or
  "Verified by Apple".
- Phone, date of birth and photo are unchanged.
- `/auth/availability` still runs. For a social draft, a **taken phone or email
  starts [collision B](#collision-b--during-social-sign-up)** instead of the
  inline error.
- Continue routes past the email and password screens.

**Step 3 (`RegistrationStep3Screen`)** — the user is already signed in as the
Google/Apple account, so the phone is **linked**, not signed into. A new hook,
`useConfirmPhoneAndLinkToCurrentUser`:

1. Send the code with `auth().verifyPhoneNumber(e164)`. This does not sign
   anyone in (`signInWithPhoneNumber` would).
2. Link with `PhoneAuthProvider.credential(verificationId, code)`, then
   `currentUser.linkWithCredential(...)`.
3. Refresh the ID token (`getIdToken(true)`) so it carries `phone_number` for
   `isPhoneVerified`.
4. Call `POST /auth/register` with no `emailVerificationToken`.

Error handling:
- **`auth/credential-already-in-use`**: the number belongs to another account,
  so run collision B.
- **`auth/provider-already-linked`** (a retry): if the linked number is this
  number, continue to register. If it's a different number, `unlink('phone')`
  and link the new one, mirroring the phone wizard's password relink (I4).

## Backend (`apps/backend`)

- **`packages/shared/src/auth.ts`**: `RegisterRequestSchema.emailVerificationToken`
  becomes `.optional()`.
- **`registerUser`** (`auth.service.ts`):
  - **Token present:** exactly today's behaviour. `consumeVerificationToken`
    runs inside the transaction.
  - **Token absent:** require the decoded Firebase token's
    `email_verified === true` **and** its `email` equal to `body.email`,
    compared trimmed and lower-cased on both sides.
    Otherwise respond `400 'Please verify your email address before finishing
    sign-up.'`
  - Why that is proof: only Firebase sets `email_verified`, after Google, Apple
    or its own verification flows. The phone wizard's linked email/password
    credential is unverified at registration time, so the phone path still has
    to present a token.
  - Either path writes `isEmailVerified: true` and `emailVerifiedAt`.
  - The best-effort `updateUser(uid, { emailVerified: true })` is harmless for
    social users, who already have it.
- **No new endpoints.** `/auth/me`, `/auth/availability` and the verify-email
  gate are unchanged. Social users are never routed to the gate, because they
  register verified.

After sign-up a social user can:
- sign in with Google/Apple **or** by SMS; both reach the same uid.
- not use email + password at first, because there's no password provider.
  "Forgot password" fixes that: Firebase's reset adds the password provider.
  This needs no code.

## Collisions: linking in-flow

**Rule: a Google/Apple identity is linked to an existing account only after the
user proves ownership of that account**, by SMS code or password. The pending
credential proves they own the Google/Apple identity; the sign-in proves they
own the account.

The banner copy is the same in both cases: "You already have an account. Sign
in with your phone once to connect Google" (or Apple).

### Collision A — at sign-in

Trigger: `auth/account-exists-with-different-credential`.

1. Nobody was signed in, so the credential is unspent. Put it in `pendingLinkStore`.
2. Go to `/(auth)/sign-in` with the banner.
3. After a successful SMS sign-in (a 200 from `/auth/me` in
   `useConfirmPhoneSignIn`), call `currentUser.linkWithCredential(pending)`,
   clear the store, then go to `router.replace('/')`. `useSignInWithEmail`
   success does the same.
4. If the link fails, the user stays signed in; clear the store and show a
   `noticeDialog`: "You're signed in, but we couldn't connect Google. Try
   Continue with Google next time." Sign-in is never blocked by a failed link.

### Collision B — during social sign-up

Triggers: step 1 availability reports the phone or email taken, or step 3 gets
`credential-already-in-use`.

1. The signed-in user is the Google/Apple-only account just created, with no
   row. **Delete it** (`currentUser.delete()`; the sign-in is recent, so no
   re-auth is needed).
   - Guard: every `providerData` entry is `google.com` or `apple.com`, and
     `/auth/me` has returned 404. If the guard fails, sign out instead.
   - Deleting frees the Google/Apple identity. Otherwise the later link fails
     with `credential-already-in-use`.
2. Move the draft's `socialCredential` into `pendingLinkStore`, with
   `phoneHint` set to the number from step 1, and reset the draft.
3. Go to `/(auth)/sign-in` with the banner and the phone field prefilled from
   `phoneHint`.
4. After SMS sign-in, link as in collision A.
   - **If Firebase rejects the reused credential** (the token was already spent
     once, which matters for Apple's nonce-bound token), run the provider sheet
     **once more** and link the fresh credential.
   - Whether this fallback is ever needed is to be measured during
     implementation. Keep it either way; it is the safe path.

This also covers **legacy accounts** whose Firebase email is still the phone
placeholder: Google creates a new uid, step 1 finds the real address taken in
`users`, and collision B links Google onto the old account.

## Native configuration

- **Dependencies** (`apps/mobile`): `@react-native-google-signin/google-signin`
  and `expo-apple-authentication`, plus `expo-crypto` if it isn't already present.
- **`app.config.ts`:**
  - Add `ios.usesAppleSignIn: true`. EAS enables the Sign in with Apple
    capability on the App ID at build time.
  - Add `['@react-native-google-signin/google-signin', { iosUrlScheme }]` to
    `plugins`. `iosUrlScheme` is read at config time from
    `GoogleService-Info.plist`'s `REVERSED_CLIENT_ID`.
  - Add `extra.googleWebClientId`, read at config time from the `oauth_client`
    entry with `client_type: 3` in `google-services.json`.
  - Both IDs therefore come from the files Firebase issues. Nothing is
    hardcoded, and they cannot drift.
- **`google-services.json` / `GoogleService-Info.plist`:** replace them with the
  versions downloaded after enabling Google, which carry the OAuth clients and
  `REVERSED_CLIENT_ID`. Swap once, after the debug SHA-1 is added (console
  task 1).

### Console tasks (owner)

1. Firebase → Project settings → Android app → **add the debug SHA-1**
   `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (from
   `apps/mobile/android/app/debug.keystore`). Also add the Play App Signing
   SHA-1 if the app ships through Play. Then download `google-services.json`
   again.
   - Only `45:76:0A:96:…` (presumably the EAS release key) is registered today,
     so Google sign-in fails on local and debug builds.
2. Firebase → Authentication → Sign-in method → **enable Apple**. Native iOS
   needs no Services ID or key.
3. Google Cloud → OAuth consent screen: app name, support email, and publishing
   status **In production**. In "Testing", only listed test users can sign in.

## Testing

### Unit and integration

- **Mobile** (jest-expo + RNTL, native modules mocked):
  - `useSocialSignIn`: 200 / 404 / account-exists / cancel / SDK error.
  - Collision B's delete guard: social-only providers delete; any other
    provider signs out.
  - `discardPhoneOnlyAccount`: phone-only deletes; phone + google signs out.
  - Step 3 link branches: success, `credential-already-in-use`, and
    `provider-already-linked` with the same and with a different number.
  - `pendingLinkStore` is linked after SMS sign-in and after email sign-in; a
    failed link still lands the user home.
  - `SocialAuthButtons` hides Apple on Android and when it is unavailable.
  - The social wizard skips the email and password screens; the email field is
    read-only.
- **Backend unit:** `registerUser` without a token.
  - Verified and matching → created.
  - `email_verified: false` → 400.
  - Mismatched email → 400.
  - The token path is unchanged.
- **Backend integration** (Auth emulator): create a Google-provider user with
  the emulator's `signInWithIdp` and an unsigned fake Google ID token, which the
  emulator accepts.
  - `POST /auth/register` without a token → 201 and `isEmailVerified: true`.
  - A fake token with `email_verified: false` → 400.

### Device E2E (Android emulator, Auth emulator)

**The seam:** when `extra.firebaseAuthEmulatorHost` is set,
`getGoogleCredential()` opens an **E2E-only picker** with one email field
instead of Google's sheet. It builds
`GoogleAuthProvider.credential(<unsigned fake ID token>)` for that address,
which the emulator accepts. The gating matches the photo-picker seam
(`lib/e2eImage`), so a real build never shows it.

Flows (in `apps/mobile/e2e/flows`):

1. **Google sign-up, mother:** role → Google → step 1 prefilled with the email
   read-only → no email or password screens → location → phone code → home.
2. **Google sign-in, existing account:** the seeder links a Google identity
   onto a seeded account; Google → home.
3. **Collision B:** Google sign-up using a seeded account's phone → banner →
   SMS sign-in with the phone prefilled → home. An `advance.js` step asserts
   the account's providers now include `google.com`.

Each flow is run twice, per the lab rule.

### Manual matrix (not automatable)

Real Google and Apple logins against live Firebase need real accounts and
sheets that Maestro cannot drive, and Apple needs iOS. Before rollout:

| Platform | Case | Expected |
|---|---|---|
| Android (debug + release) | Gmail that has an account | Auto-linked, home |
| Android | New Gmail | Social wizard → home |
| Android | Workspace address that has an account | Collision A → SMS → linked |
| iOS TestFlight | Google, same three cases | As above |
| iOS TestFlight | Apple, sharing the real address | Auto-linked, home |
| iOS TestFlight | Apple, Hide my email, existing phone | Collision B → SMS → linked |
| Both | Sign out, then Google again | Account picker shows |

## Rollout

1. **Backend first.** The optional token is backward-compatible, so it can
   deploy with (or before) phone-first auth.
2. **The buttons arrive only with a new binary** (native dependencies). Ship
   social auth in the **same build** as phone-first auth, so testers get one
   binary.
3. Complete the console tasks before the build that testers receive.

## Out of scope

- **Apple token revocation on account deletion.** App Store guideline 5.1.1(v)
  requires calling `auth().revokeToken(authorizationCode)` when an Apple-linked
  account is deleted. There is **no in-app account deletion yet** (AUTH-14 is
  not built), so it belongs with that feature, which must include it.
- A "Connected accounts" settings screen (link or unlink providers).
- Apple on Android, and any other provider.
