# Sign in with Google and Apple

**Date:** 2026-09-23
**Status:** Implemented on `feat/social-auth`, pending rollout
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
| A social user's email | The address on the Firebase account the provider signed in to (the one the backend checks), **read-only**, and only when Firebase marks it verified. Apple's private-relay address (`@privaterelay.appleid.com`) is accepted, but Apple forwards to it **only mail from senders registered with Apple** (Apple Developer → Sign in with Apple for Email Communication, with SPF and ideally DKIM). Until the backend's `EMAIL_FROM` and Firebase's reset-mail sender are registered, receipts and Forgot-password mail to a relay address are dropped — see [console task 4](#console-tasks-owner). |

### Firebase behaviour this relies on

Read from the live project on 2026-09-23 (Identity Toolkit admin config, read-only):

- `signIn.allowDuplicateEmails: false` — **one account per email address**.
- `emailPrivacyConfig.enableImprovedEmailPrivacy: true` — email-enumeration
  protection. `fetchSignInMethodsForEmail` returns nothing, so the app can never
  ask Firebase which method an address uses.
- `google.com` enabled; `apple.com` **not yet enabled** at the time of that
  read — since enabled (owner confirmed 2026-09-23; see console tasks).

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
  - Takes `disabled`, which "Create your account" sets until a role is picked.
    Apple's official button has no disabled look, so while disabled it is not
    rendered; the line "Choose mother or nanny first to continue with Apple."
    stands in for it (iOS with Apple available only). Found in the final
    review: before, the button looked tappable and silently did nothing.
  - Awaits `mutateAsync` rather than calling `mutate` with per-call callbacks: on
    "Create your account", picking a role switches the screen to social mode and
    can unmount these buttons mid sign-in, which would otherwise drop the
    callback and strand the flow. Found on-device (device-run bug fix).
- **`src/hooks/useSocialSignIn.ts`**
  1. Get the credential; if cancelled, do nothing.
  2. Call `auth().signInWithCredential(credential)`.
  3. Call `GET /auth/me`:
     - **200** — an existing account (including the auto-linked cases above).
       Reset the registration draft, then `router.replace('/')`.
     - **404** — a new person. The Firebase account is **kept**: this is not a
       phone orphan. Seed the registration draft with `authProvider`, name,
       email, `socialCredential` (held so that collision B can reuse it) and
       `socialUid` — `auth().currentUser.uid`, the account this sign-up
       created. Go to `/(auth)/register-step-1` if a role was passed,
       otherwise to `/(auth)/role-selection`.
       - The credential goes on the **draft**, not into `pendingLinkStore`.
         Anything in that store is linked on the next successful sign-in, so
         only an actual collision may put a credential there.
       - The email is the **Firebase account's** (`currentUser.email`), which
         is what the backend compares against the ID token; the provider
         profile's address is only the fallback (Apple shares it on the first
         authorization only). No address at all → sign out, "Sign up with
         your phone number instead."
       - If `currentUser.emailVerified` is `false`, sign out and refuse up
         front ("Your Google account's email isn't verified. Sign up with your
         phone number instead.", or Apple), rather than let the wizard fail at
         `/auth/register`'s verified-email check.
     - **Anything else** — sign out (best-effort) and show "Could not sign you
       in", so the user is never left signed in to Firebase on an auth screen.
  4. On `auth/account-exists-with-different-credential`, run
     [collision A](#collision-a--at-sign-in), and reset the draft.
  - Every outcome but a new person resets the draft, and so does every
    sign-out path here: a social draft from an earlier attempt belongs to an
    account that is no longer signed in (possibly someone else's, on a shared
    device), and would otherwise keep "Create your account" in its signed-in
    mode or hand its credential to the next collision. Final-review fix.
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
    - by `useSignOut`, and before every other sign-out the social flow makes
      ("Use a different sign-up method", collision B's refusal branch);
    - when an email sign-in finds no account behind the password (below).

### Existing code touched

- **`useSignOut`**: also calls `GoogleSignin.signOut()` (best-effort, errors
  swallowed), so the next Google tap shows the account picker again. It
  clears `pendingLinkStore` **and resets the registration draft** before the
  sign-out call, so neither survives into the next person's session.
- **`useConfirmPhoneSignIn`** and **`useSignInWithEmail`**: reset the
  registration draft once signed in — any social sign-up under way belonged to
  another session. The collision credential lives in `pendingLinkStore`, not
  the draft, so linking after the reset still works.
- **`useSignInWithEmail`** now owns the collision link for the email door, and
  gates it like the SMS door: after `signInWithEmailAndPassword` it calls
  `/auth/me`, links only on a **200**, and otherwise drops the parked
  credential unlinked. A password alone is not proof — a phone wizard
  abandoned after its password step leaves a row-less account that signs in
  fine. The sign-in itself still resolves and the root router signs a
  row-less account out, as before. `EmailSignInScreen` just navigates.
  Final-review fix.
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

**Draft:** `registrationDraftStore` gains three fields:
- `authProvider: 'phone' | 'google' | 'apple'`, defaulting to `'phone'`. Every
  branch below keys off it; the phone wizard is untouched.
- `socialCredential`. The store is in-memory only (no `persist`), which is
  already required for `password`.
- `socialUid: string | null` — the uid `useSocialSignIn` saw the 404 for, i.e.
  the account this sign-up created. Collision B deletes, and parks a
  credential for, only that account; step 3 links a phone onto no other.
  Added in the final review, after a stale draft was shown to be able to
  park its credential for whoever signed in next.

**Role selection (`RoleSelectionScreen`) in social mode** hides the social
buttons (the user is already signed in with one) and shows a text link, **"Use
a different sign-up method"**, instead. `useLeaveSocialSignUp` clears
`pendingLinkStore`, signs out of Firebase and of Google on the device —
**never deletes** — and resets the draft, which puts the screen back in its
phone mode with the social buttons showing. The throwaway account is left
row-less, like an abandoned wizard; continuing with the same identity later
reuses it. Final-review fix for a dead end: someone who met "new person" via
Google and wanted to sign up by phone was otherwise stuck in social mode.

**Route order:**

| Wizard | Route |
|---|---|
| Phone (today) | role-selection → step-1 → register-email → register-create-password → (mother) step-2 / (nanny) nanny-location → nanny-id → nanny-details → step-3 |
| Social | role-selection → step-1 → (mother) step-2 / (nanny) nanny-location → nanny-id → nanny-details → step-3 |

The social wizard is shorter than the phone wizard, so its progress indicator counts its own steps
rather than reusing the phone wizard's: mother `1/3 → 2/3 → final`; nanny
`1/5 → 2/5 → 3/5 → 4/5 → final`.

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
Google/Apple account, so the phone is **linked**, not signed into. The code is
sent by `useSendPhoneLinkCode` and linked by `useLinkPhoneToCurrentUser`:

0. Refuse ("Your session ended. Please continue with Google or Apple again.")
   unless the signed-in uid is the draft's `socialUid`, passed in as a
   mutation variable. Step 1 below can `unlink('phone')`, so running it on any
   other account — say, a registered one signed in on this device since —
   would strip that account's own number. Final-review fix.
1. Before spending the code, check the account's current phone. Android's
   instant verification hands back a **single-use** native credential, so the
   credential is only worth spending once: if the current phone already
   matches, skip the link and go straight to register; if it's a different
   number, `unlink('phone')` then link the new one, once.
2. Send the code with `auth().verifyPhoneNumber(e164)`. This does not sign
   anyone in (`signInWithPhoneNumber` would).
3. Link with `PhoneAuthProvider.credential(verificationId, code)`, then
   `currentUser.linkWithCredential(...)`.
4. Refresh the ID token (`getIdToken(true)`) so it carries `phone_number` for
   `isPhoneVerified`.
5. Call `POST /auth/register` with no `emailVerificationToken`.

Error handling:
- **`auth/credential-already-in-use`**: the number belongs to another account,
  so run collision B.
- **`auth/provider-already-linked`** (a retry): if the linked number is this
  number, continue to register. If it's a different number, `unlink('phone')`
  and link the new one, mirroring the phone wizard's password relink (I4).
- A link that fails **after** an instantly-verified (auto-retrieved) credential
  was already consumed clears the challenge, so the user resends the code
  rather than retrying a credential that Android has already spent.

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
   does the same, but only once its own `/auth/me` returns 200 (the check
   used to be missing on the email door; final-review fix).
4. If the link fails, the user stays signed in; clear the store and show a
   `noticeDialog`: "You're signed in, but we couldn't connect Google. Try
   Continue with Google next time." Sign-in is never blocked by a failed link.
   - **`auth/provider-already-linked`** is a failure, not a retry trigger here:
     the account already holds a different identity from that provider, so the
     notice is shown as above.
   - The provider sheet is re-asked (collision B's fallback, below) only on
     `auth/invalid-credential` or `auth/missing-or-invalid-nonce` — the codes
     that mean the credential itself was spent or malformed, not that linking
     is impossible. Review-approved during implementation.

**Known gap (follow-up, not handled):** if the address is held by a
**row-less** phone+password leftover — a phone wizard abandoned after its
password step, with a Workspace address — collision A loops. Neither door can
prove that account (SMS sign-in gets a 404 and is refused; the email door's
`/auth/me` also 404s, so nothing is linked and the root router signs out), and
one-account-per-email keeps Google from creating a new account for the address,
so "Continue with Google" leads back to the banner every time. Signing up
again by phone with that number is the likely way out (the phone wizard
re-confirms into the leftover uid and relinks its password — unverified for
this case), but nothing in this flow points there. Recorded in the final
review as a follow-up.

### Collision B — during social sign-up

Triggers: step 1 availability reports the phone or email taken, or step 3 gets
`credential-already-in-use`.

1. The signed-in user is the Google/Apple-only account just created, with no
   row. **Delete it** (`currentUser.delete()`).
   - Guard, in two parts:
     - **This sign-up's own account:** the signed-in uid equals the draft's
       `socialUid` (recorded only when `/auth/me` returned 404), and the draft
       is social (`authProvider` is `google`/`apple`) with a
       `socialCredential`. If not — nobody signed in, or someone else — the
       draft is stale: sign out, **park nothing**, reset the draft. The
       draft-is-social half was review-approved during implementation (it
       keeps a stray phone-wizard draft from ever hitting delete); the uid
       half is a final-review fix, since a stale credential (possibly
       another person's, on a shared device) could otherwise be parked and
       linked onto whoever signed in next by SMS.
     - **Still social-only:** every `providerData` entry is `google.com` or
       `apple.com`. If not, sign out instead of deleting (the credential is
       still parked).
   - `delete()` needs a recent sign-in (about five minutes), and a collision
     at step 3 comes after the whole wizard — the nanny path always takes
     longer. On `auth/requires-recent-login`, re-authenticate with the draft's
     `socialCredential` (`reauthenticateWithCredential`) and delete **once**
     more; if that fails too, sign out as the last resort. Final-review fix:
     before it, a step-3 collision almost always fell back to signing out.
   - Deleting frees the Google/Apple identity. Otherwise the later link fails
     with `credential-already-in-use` ("Couldn't connect Google").
2. Move the draft's `socialCredential` into `pendingLinkStore`, with
   `phoneHint` set to the number from step 1, and reset the draft.
3. Go to `/(auth)/sign-in` with the banner and the phone field prefilled from
   `phoneHint`.
4. After SMS sign-in, link as in collision A.
   - **If Firebase rejects the reused credential** with `auth/invalid-credential`
     or `auth/missing-or-invalid-nonce` (the token was already spent once, which
     matters for Apple's nonce-bound token), run the provider sheet **once
     more** and link the fresh credential. Any other failure (e.g.
     `auth/provider-already-linked`) is the collision-A failure path instead —
     the user stays signed in and sees the notice.
   - **Measured:** on the Auth emulator, reusing the Google credential after
     deleting the throwaway account linked cleanly both times the flow was run
     (`c12-google-collision.yaml` green on both runs, `google.com` present on
     the seeded mother afterward) — the fallback was never exercised. Kept
     anyway as the safe path; Apple's nonce-bound reuse is unmeasured until
     TestFlight, where the fallback matters most.

This also covers **legacy accounts** whose Firebase email is still the phone
placeholder: Google creates a new uid, step 1 finds the real address taken in
`users`, and collision B links Google onto the old account.

## Native configuration

- **Dependencies** (`apps/mobile`): `@react-native-google-signin/google-signin`
  and `expo-apple-authentication`, plus `expo-crypto` if it isn't already present.
- **`app.config.ts`:**
  - Add `ios.usesAppleSignIn: true`. EAS enables the Sign in with Apple
    capability on the App ID at build time.
  - Add `'@react-native-google-signin/google-signin'` to `plugins`, with no
    options. When `ios.googleServicesFile` is set, the plugin reads
    `REVERSED_CLIENT_ID` from the plist itself; `iosUrlScheme` is only for
    projects that don't use Firebase.
  - Add `extra.googleWebClientId`, read at config time from the `oauth_client`
    entry with `client_type: 3` in `google-services.json`.
  - Both IDs therefore come from the files Firebase issues. Nothing is
    hardcoded, and they cannot drift.
- **`google-services.json` / `GoogleService-Info.plist`:** replaced with the
  versions downloaded after enabling Google, which carry the OAuth clients and
  `REVERSED_CLIENT_ID`. The committed `google-services.json` carries an
  Android OAuth client for **both** registered signing keys: `45:76:0A:96:…`
  (the EAS release key) and the debug key `5E:8F:16:06:…`.

### Console tasks (owner)

Status as of 2026-09-23 (owner confirmed): tasks 1–3 **done**; task 4 open.

1. **Done.** Firebase → Project settings → Android app → debug SHA-1
   `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (from
   `apps/mobile/android/app/debug.keystore`) added beside the EAS release key's
   `45:76:0A:96:…`, and `google-services.json` downloaded again.
   - **Still required before any Play Store build:** the **Play App Signing**
     SHA-1 (Play Console → App integrity). Play re-signs the app with its own
     key, so without that SHA-1 registered Google sign-in fails for every
     Play-installed user, even though it works on EAS and debug builds.
     Re-download `google-services.json` after adding it.
2. **Done.** Firebase → Authentication → Sign-in method → Apple enabled.
   Native iOS needs no Services ID or key.
3. **Done.** Google Cloud → OAuth consent screen: app name, support email, and
   publishing status **In production**. (In "Testing", only listed test users
   can sign in.)
4. **Open — Apple private email relay.** Apple forwards mail to
   `@privaterelay.appleid.com` addresses only from registered senders; mail
   from anyone else is dropped. Before Apple sign-in reaches testers, in Apple
   Developer → Certificates, Identifiers & Profiles → **Sign in with Apple for
   Email Communication**, register every sender that mails users:
   - the backend's `EMAIL_FROM` — which, with the Gmail shortcut, defaults to
     the `GMAIL_USER` address (`apps/backend/src/lib/config.ts`, the Gmail
     branch of the mail config) — for receipts and codes;
   - Firebase's password-reset sender, `noreply@nanny-now-d8518.firebaseapp.com`
     (or the custom domain, if one is set under Authentication → Templates),
     for Forgot password.

   Apple requires each sending domain to pass **SPF** (DKIM recommended); check
   the result on that page after registering. A Gmail sender may not pass,
   because the domain is Google's, not ours — plan on a custom sending domain
   (e.g. `no-reply@<our domain>` through an SMTP provider we control) if it
   doesn't. Until this is done, a user who chose "Hide my email" gets no
   receipts and no Forgot-password mail.

## Testing

### Unit and integration

- **Mobile** (jest-expo + RNTL, native modules mocked):
  - `useSocialSignIn`: 200 / 404 / account-exists / cancel / SDK error; the
    404 records `socialUid`; 200 and account-exists reset a stale draft; a
    non-404 `/auth/me` error signs out; the Firebase account's email wins over
    the profile's; an unverified email is refused up front.
  - `useLeaveSocialSignUp`: signs out, never deletes, resets the draft.
  - Collision B's delete guard: social-only providers delete; any other
    provider signs out; a uid other than `socialUid`, no user, or no
    `socialUid` signs out and parks nothing; `requires-recent-login`
    re-authenticates with the social credential and deletes once more.
  - Step 3 refuses an account other than `socialUid`.
  - The draft is reset by `useSignOut` and by SMS and email sign-in; the email
    door links only after `/auth/me` 200.
  - `discardPhoneOnlyAccount`: phone-only deletes; phone + google signs out.
  - Step 3 link branches: success, `credential-already-in-use`, and
    `provider-already-linked` with the same and with a different number.
  - `pendingLinkStore` is linked after SMS sign-in and after email sign-in; a
    failed link still lands the user home.
  - `SocialAuthButtons` hides Apple on Android and when it is unavailable, and
    swaps it for the "choose mother or nanny" hint while disabled.
  - Role selection offers "Use a different sign-up method" in social mode
    only, and it returns the screen to phone mode.
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
  - **Measured (A24):** the Auth emulator honoured `email_verified: false` on
    an unsigned Google IdP claim, so this 400 case holds on the emulator with
    no contingency needed.

### Device E2E (Android emulator, Auth emulator)

**The seam:** when `extra.firebaseAuthEmulatorHost` is set,
`getGoogleCredential()` opens an **E2E-only picker** with one email field
instead of Google's sheet. It builds
`GoogleAuthProvider.credential(JSON.stringify(claims))` for that address — a
raw JSON claim set, not an unsigned JWT. The gating matches the photo-picker
seam (`lib/e2eImage`), so a real build never shows it.

**Measured token format:** the Auth emulator accepted that raw JSON claim set
straight from the native Android SDK; the unsigned-JWT fallback this design
originally anticipated was not needed.

Flows (in `apps/mobile/e2e/flows`):

1. **Google sign-up, then sign-in again, mother:**
   - Sign up: role → Google → step 1 prefilled with the email read-only → no
     email or password screens → location → phone code → home.
   - Then: sign out → Welcome back → Google with the same identity → home.
     This covers the existing-account door (a 200 from `/auth/me`) without a
     seeder-linked identity.
2. **Collision B:** Google sign-up using a seeded account's phone → banner →
   SMS sign-in with the phone prefilled → home. An `advance.js` step asserts
   the account's providers now include `google.com`.
   - The seeder unlinks `google.com` from seeded accounts on every run, so the
     second run starts clean.

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
| iOS TestFlight | Apple, Hide my email, brand-new user → finish the wizard | Registered (proves Firebase marks Apple relay addresses `email_verified`) |
| Android/iOS | Google Workspace address, brand-new user → finish the wizard | Registered |
| Both | Sign out, then Google again | Account picker shows |

## Rollout

1. **Backend first.** The optional token is backward-compatible, so it can
   deploy with (or before) phone-first auth.
2. **The buttons arrive only with a new binary** (native dependencies). Ship
   social auth in the **same build** as phone-first auth, so testers get one
   binary.
3. Complete the console tasks before the build that testers receive: task 4
   (Apple's email relay) before any iOS tester signs in with Apple, and the
   Play App Signing SHA-1 (task 1) before any Play Store build.

## Out of scope

- **Apple token revocation on account deletion.** App Store guideline 5.1.1(v)
  requires calling `auth().revokeToken(authorizationCode)` when an Apple-linked
  account is deleted. There is **no in-app account deletion yet** (AUTH-14 is
  not built), so it belongs with that feature, which must include it.
- A "Connected accounts" settings screen (link or unlink providers).
- Apple on Android, and any other provider.
