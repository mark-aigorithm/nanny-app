# Authoring and extending flows

The suite's cheapness comes from one decision: **Maestro drives one surface (the app, as one
person); everything else happens over HTTP in `advance.js`.** Internalise that and the rest is
selectors and state hygiene.

## Table of contents
- [The cross-surface model](#the-cross-surface-model)
- [advance.js: the seam](#advancejs-the-seam)
- [The account and seed model](#the-account-and-seed-model)
- [Wiping throwaway (registration) accounts](#wiping-throwaway-registration-accounts)
- [Selector patterns](#selector-patterns)
- [Screen-specific gotchas](#screen-specific-gotchas)
- [The method: run to green by watching it fail](#the-method-run-to-green-by-watching-it-fail)

## The cross-surface model

A P0 journey usually needs a second actor — a nanny who accepts, an admin who approves, a buyer who
hits capacity, a code the emulator "sent". Running a second UI driver is the expensive way. Instead,
`e2e/scripts/advance.js` reaches those over the same HTTP the backend/admin suites use, invoked from
a flow:

```yaml
- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: nanny-accept
- assertTrue: ${output.status == 'APPROVED'}
```

It runs on the **host** in Maestro's JS sandbox: `127.0.0.1` (not `10.0.2.2`), no `fetch`, no
`require`, no modules — which is why every helper lives in that one file and the whole seam is a
`switch` at the bottom. `-e` values arrive as globals (accounts, URLs — see `run.mjs`'s `params`).
Each step leaves `output.*` for the flow to assert on or type.

## advance.js: the seam

Steps that already exist (dispatch keys in the `STEPS` map):

| Key | Does | Leaves |
|---|---|---|
| `nanny-accept` / `nanny-check-in` / `nanny-care-log` / `nanny-accept-extension` / `nanny-check-out` | the nanny's side of a booking | `output.status` |
| `admin-time-edit` | admin re-prices a paid booking (A8) | `output.balanceDue` |
| `admin-approve-mother` / `admin-approve-nanny` / `admin-approve-nanny-registration` | operator verifies from the queue | `output.status` |
| `phone-otp` | reads the SMS code off the Auth emulator, keyed by `OTP_PHONE` (E.164) | `output.otp` |
| `email-otp` | reads the email code off Mailpit, keyed by `EMAIL_OTP_ADDRESS` | `output.emailOtp` |
| `referrer-code` | the existing mother's referral code (C7) | `output.code` |
| `mother-book` / `mother-pay` / `mother-start-pin` / `mother-care-logs` | the mother's side over HTTP | various |
| `community-reset` / `seed-listing-notifications` / `seed-conversation` / `event-at-capacity` | community/marketplace setup + capacity | various |

**Add a step**, don't add a bypass in the app. A new step is a function + one line in `STEPS`. Read
a code from wherever the product parks it (Auth emulator `verificationCodes`, Mailpit
`/api/v1/messages`) rather than short-circuiting verification — the point is that the real path ran.
Reach a second actor "through the pool the app reads" (e.g. accept from `/bookings/available`, not an
id the flow already knows) so a genuine defect (wrong radius, missing skill) surfaces here.

## The account and seed model

Flows sign in as fixed accounts defined **once** in `e2e/accounts.mjs` (imported by `run.mjs`, passed
to the seeder), so a flow and its DB row can't disagree. The lab accounts use `+2011…` numbers to
stay clear of the backend factories' `+2010…`.

`seed-mobile.ts` runs **before every flow** (not once per run — each flow books the same nanny, so
re-seeding undoes the previous flow as well as the previous run). It:
- **Upserts** each account and **links the phone number onto the email/password Firebase uid** — so
  the emulator's phone sign-in resolves to the same user the app signs in as. Without this, a
  phone-based reset (`useConfirmPhoneAndResetPassword`) or any phone sign-in mints a *second* user.
- Sets `idVerificationStatus`/`approvalStatus` from the spec, so gate flows (A10/A11) get an account
  on the wrong side of the gate each run.
- The DB is **never truncated**; `resetPreviousRun` soft-deletes the accounts' bookings/redemptions
  and frees the package slot (a partial unique index that ignores `deletedAt`).

## Wiping throwaway (registration) accounts

A flow that **registers from scratch** (C2 mother, A10 nanny) can't upsert its account — a completed
signup would collide on the unique phone next run. `accounts.mjs` defines `REGISTRATION` (mother) and
`REGISTRATION_NANNY` with a real email; `run.mjs` passes them in `E2E_MOBILE_WIPE`, and
`wipeAccount` removes the Firebase user + DB row **before** each run.

- **Look the row up by phone, not email.** A mother's row carries the phone placeholder email; a
  nanny's carries the **real** address she verified mid-wizard. Phone is the shared identifier.
- `/auth/register` creates only the User row (and, for a nanny, a NannyProfile + catalog links) —
  children and referral are not in that transaction — so the wipe is tractable.

## Selector patterns

- **Prefer visible copy.** Maestro matches `accessibilityLabel` as Android's content-desc / text, so
  a properly labelled control needs no test-only prop. Add a `testID` (`<screen>.<element>`) only
  where copy repeats on screen, is a live price, or the control is an unlabelled icon.
- **Text is a regex over the node's *entire* text.** `visible: 'Reset your password'` must match the
  whole node; use `.*` for partials (`'STEP 1 OF 6.*'`, `'I agree to.*'`, `'This is the developer
  menu.*'`).
- **OTP boxes.** `OtpCodeInput`'s real input is a 1×1, opacity-0, offscreen `TextInput` that Android
  prunes from the a11y tree — tapping its bare `testID` doesn't focus it. The visible box row carries
  `${testID}.boxes`; tap that to focus, then `inputText ${output.otp}`.
- **Password / labelled fields with a reveal toggle.** Select by placeholder copy (`'Enter a new
  password'`), which is unique and never matches the eye-toggle — `below: 'Password'` sometimes picks
  the toggle and types into the wrong field.
- **Photos.** The registration photo, the marketplace listing photo, and both ID uploads route
  through `lib/e2eImage` → return a **bundled placeholder** when the Storage-emulator host is set, so
  the flow never opens the Android picker but a **real upload to the Storage emulator** still runs.
  Fire the picker by tapping its label (`'Add photo'`, `'Passport photo page'`), then **wait for the
  filled-state signal** before submitting: `'Change photo'` / `'Change'` / `'Remove photo'`.

## Screen-specific gotchas

- **Keyboard covers stacked fields.** `hideKeyboard` between each `inputText` on a form, or the tap
  for the next field lands on a key.
- **Stateful screens retain values between opens.** A screen kept in the nav stack (e.g.
  `CreatePostScreen`) still holds the last post's title when reopened — `eraseText` before
  `inputText`, or you get `"<old><new>"` (a real bug this caught: an event name concatenated onto a
  listing name).
- **DOB is a native Android date dialog.** Tap the field (`'Select your date of birth'`), then tap
  `'OK'` — the default (≈25 years ago) is a valid adult DOB, so no spinner interaction is needed. On a
  taller screen (the nanny step 1 has an extra email field) the DOB sits below the fold —
  `scrollUntilVisible` it first.
- **The location step is a map on the device geo fix.** No Google **Maps** key on this machine, but
  the emulator has a Cairo geo fix and `isMapAvailable()` guards the `MapView`; tap the map
  (`point: '50%,44%'`) to drop the pin, then Continue. Booking's date picker misbehaves near
  midnight — HTTP-seeded bookings (`mother-book`) sidestep it with a wall-clock time 10 min out.
- **Cache-busting.** React Query holds responses 60s; a screen won't notice an out-of-band change
  (an `advance.js` edit) until the cache clears. `_relaunch.yaml` (with an `EXPECT`) reopens the app
  to empty it — that's how A8's balance-due card and every nanny-side change surface.
- **Registration ends on a role-dependent screen.** A mother lands on Home after
  `notification-permission` ("Not now"); a nanny registers `PENDING_REVIEW` and lands on the vetting
  gate ("Your profile is under review"), not a dashboard — assert the gate, then approve over HTTP.

## The method: run to green by watching it fail

Do not try to write a flow correctly from code alone — selectors, exact copy, wall-clock formats and
which relaunch busts which cache are found empirically:

1. Author the flow from the screen source (labels, testIDs, the Continue gate).
2. Run it (`environment.md`), poll the log file.
3. On failure, `Read` the Maestro debug screenshot
   (`~/.maestro/tests/<ts>/<flow>/screenshots/step-NNN-*.png`) — it shows exactly what was on screen.
   Cross-check the DB/emulator with a host `curl` when the screen looks right but the assert failed
   (e.g. a listing created with the wrong title).
4. Fix the one thing, re-run. Repeat to green, then **run it a second time** to catch state that only
   the second run reveals.

When a journey genuinely can't be driven (system UI, a missing seam), add a **production-safe
affordance gated on the E2E flag** (a placeholder picker, a `testID`, an `advance.js` step) — never a
test-only branch that changes what the app actually does.
