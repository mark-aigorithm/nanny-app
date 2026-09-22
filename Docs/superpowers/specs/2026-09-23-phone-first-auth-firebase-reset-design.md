# Phone-first auth with Firebase-owned password reset

**Date:** 2026-09-23
**Status:** Approved, not yet implemented

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
the Firebase address, and its success path calls `user.reload()` so the client's
cached `currentUser.email` does not go stale.

`phoneToPlaceholderEmail` is deleted from `validation.ts` so nothing can regrow
the dependency.

---

## Backend (`apps/backend/src/services/auth.service.ts`)

1. **`registerUser`** — after the row is created,
   `firebaseAuth.updateUser(uid, { emailVerified: true })`. We proved the
   address with our own OTP; Firebase's copy should not disagree.

2. **`setVerifiedEmail`** — the migration path for legacy accounts. Order
   matters:

   1. check the address is not taken (existing `assertEmailAvailable`),
   2. `firebaseAuth.updateUser(uid, { email, emailVerified: true })`,
   3. consume the token and write the row, in the existing transaction.

   Firebase goes first because a failure there — `auth/email-already-exists`,
   mapped to the existing "An account with this email already exists."
   conflict — must leave the token unspent. If the DB write fails after Firebase
   succeeded, the user lands back on `VerifyEmailScreen` and re-runs it;
   `updateUser` with the same address is a no-op, so it self-heals.

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

- **Backend unit** — `setVerifiedEmail`: `updateUser` runs before the token is
  consumed; a Firebase failure leaves the token spendable;
  `auth/email-already-exists` surfaces as the existing conflict.
  `registerUser`: marks the Firebase account verified.
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
so the guard is written before the tests.

**Guard (`e2e/live/guard.mjs`)**

- `TEST_PHONES` allowlist, asserted on every create / sign-in / delete.
- Deletion additionally refused unless the uid was created in *this* run
  (tracked in a run manifest).
- No `listUsers`, no bulk wipe, ever.
- `.env.test`'s existing refusal to run against a database that is not
  `nannyapp_test` stays, so only **auth** is live: rows, mail and payments
  remain local.

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

1. **Ship the mobile change** — JS-only, so EAS Update OTA reaches installed
   builds. Its default door is SMS, which does not care what the credential
   address is.
2. **Deploy the backend.**
3. **Run the migration dry-run**, read the report, then run it for real.

Between 1 and 3 the email door returns "incorrect email or password" for
unmigrated accounts and people use SMS. With five accounts, that window is
minutes.

**Firebase Console** — customise the password-reset template (sender name,
subject, reply-to) under Authentication → Templates. A verified custom sender
domain is optional and can come later.
