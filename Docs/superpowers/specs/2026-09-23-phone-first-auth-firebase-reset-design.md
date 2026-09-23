# Phone-first auth with Firebase-owned password reset

**Date:** 2026-09-23
**Status:** Implemented on `feat/phone-first-auth`, pending rollout

---

## Why

Today every account carries a synthesized credential address —
`<digits>@phone.nannyapp.local` (`phoneToPlaceholderEmail` in
`apps/mobile/src/lib/validation.ts`) — linked onto the phone-verified Firebase
user, so that "phone + password" sign-in can exist at all. Firebase has no
phone+password provider: a password lives only on the email provider, keyed by
an email, so the app fakes a phone identity by typing the number into an
address Firebase will accept.

That trick has one consequence we can no longer live with: **Firebase can only
mail the address it holds**, and the address it holds is undeliverable. Every
recovery path therefore has to be built and operated by us, on an SMTP provider
we do not intend to keep.

It also produced a real incident. On 2026-09-21 a user's Firebase account was
deleted while its `users` row survived. Sign-in reported "Incorrect phone number
or password" (Firebase answers `auth/invalid-credential` for both "wrong
password" and "no such account" when email-enumeration protection is on), and
*Forgot password* silently minted a **new phone-only Firebase account** instead
of recovering the old one — `updatePassword` succeeded against an account with
no email provider, so nothing sign-in checks was changed. `/auth/me` then 404'd
and the root gate signed the user out without explanation.

## Decision

Put the **real, verified email** on the Firebase account and let Firebase own
password-reset mail. Sign-in becomes **phone + SMS code by default**, with
email + password as the secondary door.

Non-goals, explicitly:

- **Registration email verification stays ours.** Our OTP proves an address
  *before* the Firebase account exists; `sendEmailVerification` cannot, and a
  link-click cannot gate a wizard step.
- **Deep links are out of scope.** The reset link lands on Firebase's hosted
  page. In-app `confirmPasswordReset` needs App/Universal Links on a domain we
  own; worth doing later, not needed to ship this.
- **Receipts and OTP mail are unaffected.** Firebase has no general-purpose
  send, so the SMTP-provider migration is a separate concern.

### The four doors

| Door | Mechanism | Who uses it |
|---|---|---|
| **Phone + SMS code** (default) | `signInWithPhoneNumber` → `confirm` | everyone, normally |
| Email + password | `signInWithEmailAndPassword(realEmail, password)` | secondary; from a link on the sign-in screen |
| Reset by email | `sendPasswordResetEmail(realEmail)` — Firebase's own mail | forgot password |
| Reset by SMS | phone confirm → `updatePassword` (today's flow) | no access to the email |

The SMS door is what makes the migration safe. A legacy account whose Firebase
email is still a placeholder cannot be signed into by email, but it can by SMS —
and the root gate already forces those accounts onto `VerifyEmailScreen`, which
is where the backend swaps the Firebase address to the real one. The fleet
converges without anyone being locked out.

### Accepted costs

- Every sign-in sends a real SMS (~$0.01–0.05 in EG after the free tier).
  Sessions persist, so this is per device, not per launch.
- Every user now exercises the phone-auth path that only registration exercised
  before, including the iOS reCAPTCHA fallback noted in the release runbook.
  Both argue for keeping the email door genuinely usable.

---

## Screens (`apps/mobile`)

**`SignInScreen`** — phone + country code as now; CTA "Send code" →
`signInWithPhoneNumber` → OTP pane → signed in → `router.replace('/')`. Below
it, *Sign in with email and password instead* → **`EmailSignInScreen`** (new,
`/(auth)/sign-in-email`): email, password, "Forgot password?".

**`ForgotPasswordScreen`** — reached from the email door, so it opens on a
channel choice:

- *Email me a reset link* → asks for the address → `sendPasswordResetEmail` →
  "If an account exists for that address, the link is on its way." (Enumeration
  protection means Firebase does not tell us either way, so the copy must not
  claim delivery.) The user sets the password on Firebase's hosted page and
  returns to the email door.
- *Text me a code instead* → today's two-phase flow, unchanged apart from the
  guard below.

**`RegistrationStep3Screen`** — one line (`:148`): link the credential with the
real, already-verified email instead of `phoneToPlaceholderEmail(phoneE164)`.
The wizard still sets a password; it is the email door's key and the thing reset
resets.

**`VerifyEmailScreen`** — unchanged on screen; its backend call now also swaps
the Firebase address. That swap revokes the caller's own session (see Session
revocation, under Edge cases), so `useVerifiedEmailSubmit` calls
`signInWithCustomToken` with the token the backend returns, rather than
`user.reload()` — there is no live session left to reload. The screen itself
stays thin: the hook reports where to go (home, or back to sign-in if the
re-sign-in itself failed), not how it got there.

`phoneToPlaceholderEmail` is deleted from `validation.ts` so nothing can regrow
the dependency.

---

## Backend (`apps/backend/src/services/auth.service.ts`)

1. **`registerUser`** — after the row is created,
   `firebaseAuth.updateUser(uid, { emailVerified: true })`, best-effort: a
   failure is logged and never fails the registration itself. We proved the
   address with our own OTP; Firebase's copy should not disagree.

2. **`setVerifiedEmail`** — the migration path for legacy accounts. Order
   matters:

   1. check the address is not taken (existing `assertEmailAvailable`),
   2. check the verification token is real — spendable, unexpired, issued for
      this exact address — without spending it
      (`assertVerificationTokenIsValid`, read-only),
   3. `firebaseAuth.updateUser(uid, { email, emailVerified: true })`,
   4. consume the token, then write the row — two sequential statements, not
      one wrapping transaction (unlike `registerUser`'s create, which does use
      `prisma.$transaction`). That's why the paragraph below matters: a DB
      write failure after Firebase has already moved leaves the two out of
      sync until the retry below self-heals it.

   The read-only token check goes *before* Firebase, not after: without it, a
   garbage or foreign token would move the account to an unproven address (and
   revoke the caller's own session) only to 400 once the spend noticed —
   letting any signed-in user squat an arbitrary address on their own Firebase
   account. Firebase still goes before the spend because a failure there —
   `auth/email-already-exists`, mapped to the existing "An account with this
   email already exists." conflict — must leave the token unspent. If the DB
   write fails after Firebase succeeded, the user lands back on
   `VerifyEmailScreen` and re-runs it; `updateUser` with the same address is a
   no-op, so it self-heals.

3. **`prisma/migrate-firebase-emails.ts`** — one-off, dry-run by default. For
   every live user with `isEmailVerified = true` whose Firebase account's email
   differs from `users.email`, update it. Reports — but does not touch —
   accounts still on a placeholder; those convert themselves via the verify
   screen.

No other production code reads the credential address. The remaining
`phoneToPlaceholderEmail` references are fixtures (`prisma/seed-demo.ts`,
`test/e2e/seed-mobile.ts`, `apps/mobile/e2e/accounts.mjs`,
`src/__integration__/journeys/a14-mother-email-gate.test.ts`) and move to real
addresses.

---

## Edge cases

**The orphan guard (the 2026-09-21 incident class).** With SMS as the default
door, "I tapped Sign in but never registered" becomes a common path, and
Firebase mints a phone-only account the moment the code is confirmed. Both SMS
paths therefore check, in the screen that owns them:

- **SMS sign-in** — after `confirm(code)`, fetch `/auth/me`. On 404 →
  `user.delete()` (a client may delete the account it just created) → "We
  couldn't find an account for that number — sign up first." No stray account,
  no silent sign-out.
- **SMS reset** — after `confirm(code)`, if the signed-in user has no `email`,
  the confirm minted a fresh account rather than landing on a real one → same
  delete and message, instead of "resetting" a password nothing can use.

The root gate's orphan handling stays **sign-out only**: a wizard interrupted
mid-flight has a Firebase account with no DB row yet, and deleting it on the
next launch would destroy work in progress.

**Session revocation.** Changing an account's Firebase email — a Firebase
console edit, or `setVerifiedEmail`'s own swap for a legacy account — is a
"major account change" that revokes every existing session for that uid
(Firebase bumps `tokensValidAfterTime`), including the ID token the request
that triggered it was authenticated with. `POST /auth/email` mints a Firebase
custom token right after the swap and returns it alongside the profile; the
mobile client trades it for a fresh session via `signInWithCustomToken` so the
gate reads as seamless rather than as a surprise sign-out. A response with no
`customToken` — the idempotent no-op path outside its short recovery window
(or inside the window but without a fresh, spendable verification token for
that address — the mint checks and consumes one first, the same predicate as
the real swap, so being inside the window is not by itself enough), or an
older backend deployed before this field existed — means nothing was
revoked, so the client keeps its current session rather than treating a
missing token as a failure. If the exchange itself fails when a token *is*
present, the gate has still succeeded server-side — the app signs out fully
and sends her back to the phone sign-in door with "Your email is verified.
Please sign in again." The one-off migration script
(`migrate-firebase-emails.ts`) hits the same revocation for every account it
converts and does not attempt a re-sign-in; each migrated user is signed out
once and signs back in by SMS — a one-time rollout cost, accepted rather than
engineered around.

The token check that gates the swap (`consumeVerificationToken`'s predicate)
is also asserted *before* the swap runs, not only after: `setVerifiedEmail`
used to move the Firebase email first and only discover an invalid token
afterward, which let a garbage or foreign token move an account to an
unproven address (and revoke its own session) with nothing to show for it but
a 400. The read-only pre-check and the spend share one predicate function so
they cannot drift apart on what "valid" means.

**Other cases**

- `authErrors.ts` — "Incorrect phone number or password" becomes "Incorrect
  email or password." The debug `console.error` and the raw
  `Auth error: <code>` default, both marked "remove before shipping" in that
  file, go at the same time.
- Reset email for an unknown address — Firebase reports success either way; the
  neutral copy above covers it.
- Reset email for a legacy account still on a placeholder — the mail goes to the
  undeliverable placeholder, silently. There is no clean client-side signal for
  this; the channel chooser offers SMS alongside, and the account converts the
  first time its owner passes the verify screen. Known and accepted.

---

## Testing

### Emulator suite (unchanged, fast)

- **Backend unit** — `setVerifiedEmail`: the token is checked before Firebase
  is touched at all, and `updateUser` runs before the token is consumed; a
  Firebase failure leaves the token spendable and mints no custom token;
  `auth/email-already-exists` surfaces as the existing conflict; the no-op
  path mints a recovery token only within its short window *and* only when the
  request also carries a fresh, spendable verification token for that address
  (checked, then consumed). `registerUser`: marks the Firebase account
  verified, best-effort — a failure there never fails registration.
- **Backend integration** — the a14 mother-email-gate journey asserts that the
  emulator account's email is the real address once the gate is passed, so the
  migration path is covered by a test rather than only by the one-off script.
- **Mobile unit** — the SMS sign-in orphan guard (404 → account deleted, message
  shown), the email door's error mapping, the channel chooser.

Everything that is not auth stays on the emulator. The existing device flows
sign in as *setup* for whatever they actually test, and they do it through the
email door — so `seed-mobile.ts` gives its seeded accounts real addresses (both
in Firebase and in `users`) and the flows keep signing in with email + password,
unchanged apart from the address. The **auth flows themselves** (`c01`, which
covers signing in, signing out and the reset door) move to the live suite below;
validating the doors against the emulator would no longer prove the thing we
care about.

### Live-Firebase suite (new)

Runs against **`nanny-now-d8518`** — the same project that serves production —
so the guard is written before the tests. The guard lives server-side, not in
a standalone script: a device run only ever talks to it over HTTP.

**Guard (`apps/backend/src/services/e2e-auth.service.ts` +
`e2e-auth.routes.ts`)**

- The whole `/e2e-auth` router is mounted only when `E2E_LIVE_AUTH_ENABLED` is
  set and `NODE_ENV !== 'production'` (`routes/index.ts`); `assertEnabled`
  re-checks both, plus that the database is `nannyapp_test`, on every call.
- `TEST_PHONES` allowlist — `+201234567891` and `+201234567892` — checked
  before any Firebase call on the phone-keyed operations (`purgeAccount`,
  `describeAccount`). `completeReset` is keyed by email instead, so it must
  look the account up first; it then checks the same allowlist against that
  account's phone and, either way it fails ("no such account" or "phone not
  reserved"), refuses with the identical status and message — an
  unauthenticated caller must not learn which.
- `POST /e2e-auth/begin` establishes a run's baseline: both reserved numbers
  must currently carry no Firebase account, or it refuses untouched.
  `purgeAccount`/`completeReset` then refuse until a run has begun, and even
  then only act on an account whose Firebase-reported creation time is at or
  after that baseline (`assertCreatedDuringRun`) — a uid merely *existing* on
  a reserved number is not proof this run created it.
- No `listUsers`, no bulk wipe, ever. Rows, mail and payments stay local —
  only Firebase Auth is live.

**Runner (`apps/mobile/e2e/live.mjs`)**

Every invocation, whatever flow(s) it was asked for: reads both numbers
(`GET /e2e-auth/account`) and stops if either already has an account (someone
else's run may be in flight); `POST /e2e-auth/begin`; registers the managed
account once (`flows/live/_register-managed.yaml`); runs the requested flows
in suite order; then, in a `finally` — pass, fail, or Ctrl+C — purges both
numbers and reports what the harness sees on each. Everything besides Auth,
Storage included, stays on the local emulator/test stack even in this suite
(`e2e:metro:live` points only Auth at the real project) — only phone sign-in,
the password credential, and Firebase's own reset mail are live.

**Numbers.** Of the five test numbers in the console, three are bound to
accounts in use (`+201288719791`, `+201234567890`, `+201234567893`) and are
never touched. The harness manages the two that have neither a Firebase account
nor a DB row:

| Number | Code | Role |
|---|---|---|
| +20 12 34567891 | 111111 | the managed account — created, signed into, reset, deleted each run |
| +20 12 34567892 | 222222 | deliberately **absent** — drives the orphan guard, asserted clean afterwards |

The managed account's email is a `+tag` alias of a real inbox, so the same
account serves the manual delivery check below.

**Wiring.** Backend `start:test:live-auth` — `.env.test` (test PostGIS, Mailpit,
Paymob fake) with real service-account credentials and
`FIREBASE_AUTH_EMULATOR_HOST` unset. Mobile: the E2E build minus
`extra.firebaseAuthEmulatorHost`. Phone codes come from the console's fixed test
codes, so no SMS is sent and no reCAPTCHA appears. Our own email OTP still goes
to Mailpit — only the auth provider is live.

**Flows (`apps/mobile/e2e/flows/live/`)**

| Flow | Proves |
|---|---|
| `sign-in-sms` | default door: number → fixed code → home |
| `sign-in-email` | secondary door: email + password → home |
| `sign-in-sms-no-account` | the orphan guard — error shown, and the harness asserts via Admin SDK that no Firebase account was left behind |
| `reset-sms` | forgot → SMS → new password → signed in; then sign out and sign in again with the new password through the email door |
| `reset-email` | the app sends the reset mail and shows the neutral confirmation; the harness mints the `oobCode` with `generatePasswordResetLink`, completes it over the Identity Toolkit REST API, then the flow signs in with the new password — so the password really changed |

### Manual validation (pre-deploy)

Automation cannot prove that Firebase's mail reaches an inbox, nor how a real
device behaves off the test-number path. Check once, on a real build:

| # | Check | Pass = |
|---|---|---|
| 1 | Sign in by SMS with a real (non-test) number | a real SMS arrives; code signs in |
| 2 | Reset by email to a real inbox | Firebase mail arrives; link opens; new password works on the email door |
| 3 | iOS TestFlight build, phone sign-in | no reCAPTCHA fallback, or it completes cleanly if it appears |
| 4 | Legacy migration | sign in by SMS on a placeholder account → verify screen → Firebase email flipped to the real one |

---

## Rollout

The migration script is the point of no return: once an account's Firebase email
is the real one, a build that still derives the placeholder cannot sign into it.

**There is no OTA path for the mobile half of this.** `apps/mobile/package.json`
has no `expo-updates`, `eas.json` has no channels, and `app.config.ts` has no
`updates` or `runtimeVersion` — so "ship the mobile change" can only mean a new
binary (TestFlight / an APK), not an EAS Update pushed to installed builds. The
backend, separately, deploys on **merge**: it runs on Vercel with Git-triggered
deploys (`apps/backend/vercel.json`, `api/index.js`; `deploy-backend.yml` is
still a TODO stub), so if Vercel's production branch is the branch this merges
to, the merge *is* the backend deploy — it does not wait for a separate step.

1. **Build and distribute the new binary first** — TestFlight and an APK — and
   confirm every tester is actually running it before doing anything else. Its
   default door is SMS, which does not care what the credential address is, so
   testers can use the app normally on the new build with no backend or
   migration changes yet.
2. **Merge.** Before doing so, confirm (a) which branch is Vercel's production
   branch for this project — if it isn't the branch you're merging to, the
   merge alone is not the deploy, so deploy explicitly afterward — and (b)
   that `E2E_LIVE_AUTH_ENABLED` is **not** set in that Vercel project's
   environment — the live-auth router must never be reachable in production.
3. **Run the migration dry-run**, read the report, then run it with `--apply`.
4. **Dry-run, then `--apply`, again** once any stragglers have updated. An old
   binary keeps registering new accounts with the placeholder credential the
   whole time it's in the field, and the verify gate never catches those
   (their `isEmailVerified` is already true) — only this later migration run
   converts them.

Between step 1 and step 3, an old binary and a new binary can each reach the
new backend against a not-yet-migrated account, and they fail differently —
the fix for one is never the fix for the other:

- **An old binary** (what `main` ships today) has no email door at all: its
  sign-in is phone + password checked against the phone-derived placeholder
  (`SignInScreen.tsx`). That still works on an unmigrated account. It breaks
  the moment the account *is* migrated — by step 3's `--apply`, or by the
  account passing the verify-email gate on the new backend — and stays broken
  until that tester installs the new binary: Firebase now answers
  `auth/invalid-credential` for the placeholder, and the old build's copy
  shows "Incorrect phone number or password." Its own forgot-password screen
  is SMS-only ("Send code"), so it still signs the tester in every time — the
  fix here is updating the app, not re-running the migration.
- **A new binary against a still-unmigrated account** is the mixed state that
  actually lasts — the gap between step 1 and step 3, however long it takes
  every tester to update (likely hours to days for a small test group, not
  "minutes" as an earlier draft of this doc claimed). Here the email door
  returns "Incorrect email or password" (enumeration protection makes this
  indistinguishable from a genuinely wrong password), an email reset silently
  sends nothing (Firebase mails the undeliverable placeholder, and the same
  enumeration protection hides that it went nowhere), while **"Forgot
  password" → "Text me a code" still signs the account in** by SMS, the same
  as before this change. The remedy is to use SMS until a migration run
  converts the account.

Step 3 signs every account it touches out of its current session (see Session
revocation above) — each one signs back in by SMS, a one-time cost accepted for
this rollout.

**Firebase Console** — customise the password-reset template (sender name,
subject, reply-to) under Authentication → Templates. A verified custom sender
domain is optional and can come later. Also decide on the password policy: the
hosted reset page enforces only Firebase's own default (6+ characters, no
composition rule), which is looser than the app's create-time rules (8+
characters, an uppercase letter, a digit) — the email sign-in door only checks
for a non-empty password, specifically so a password set there isn't rejected
on the way back in. Either
configure Authentication → Settings → Password policy to match the app's rules
so the hosted page enforces them too, or accept that the hosted page is looser
and leave it — both are consistent with the app as shipped.
