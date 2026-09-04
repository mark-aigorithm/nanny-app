# E2E coverage expansion — design

**Date:** 2026-09-04
**Status:** approved; Phase 1 (A8) implemented first, rest sequenced behind shared infra.

Closes the four documented mobile-E2E gaps: **A8** (mother's adjustment checkout), **registration
driven through the forms** (A10/A11/C2 + C7's referral field), and **marketplace listing creation
from the app** (C5). Three of the four share two infrastructure blockers, so the work is sequenced,
not four independent flows.

## Decisions (locked)

- **Firebase Storage → run the Storage emulator** in `pnpm test:env`; wire `uploadImageToFirebase`
  at it via a new `firebaseStorageEmulatorHost` extra, mirroring the Auth-emulator pattern. Real
  upload path is exercised.
- **Photo picker → test-only affordance.** Under the E2E flag, the registration image picks return
  a bundled placeholder URI instead of opening the Android picker (the README's own recommended
  fix; the picker is system UI, not app logic worth E2E-ing).
- **Sequence:** A8 first (no infra blocker), then the shared infra, then registration + marketplace.

## Hard constraint

Every phase needs the **device lab** (emulator + Metro + backend + `test:env` + Maestro) to verify,
and Phases 2–4 need a **fresh debug build** after the app changes. Flows are authored against the
running lab — the selectors, the wall-clock formats, and the cache-busting relaunches are found by
watching a flow fail, not by reading code. Nothing here is "done" until it passes a lab run.

---

## Phase 1 — A8: mother settles the adjustment · `a08-adjustment-checkout.yaml`

No infra blocker; reuses `_book-and-pay`.

**advance.js — new `admin-time-edit` step:**
- `signIn(MOTHER_EMAIL)` → `currentBooking(motherToken)` for the just-paid booking's id + its
  current `startTime`/`endTime`/`children`.
- `signIn(ADMIN_EMAIL, ADMIN_PASSWORD)`.
- Build an `AdminEditBookingSchema` body from the booking, pushing `endTime` **+2h** (raises the
  total). `startTime`/`endTime` are wall-clock (`wallClockField`), `children` min 1.
- `POST /admin/bookings/:id/edit/preview` → read `revision` (booking.updatedAt ISO) +
  `balanceDueAmount`.
- `POST /admin/bookings/:id/edit` (commit) with `{ ...editInput, revision, acknowledgeSoftWarnings: true }`.
- `output.balanceDue = String(preview.balanceDueAmount)`; `record(result.booking)`.
- **Lab-tune:** exact booking-response field names for `startTime`/`endTime`/`children`, and
  wall-clock arithmetic in Maestro's JS sandbox (no date libs).

**Flow:**
1. `_launch` → `_sign-in` (MOTHER_PHONE) → `_book-and-pay` (paid booking).
2. `advance.js ADVANCE=admin-time-edit` → `assertTrue: ${output.balanceDue > 0}` (string-compare-safe form).
3. `_open-running-booking` (or `_relaunch` with EXPECT) to bust the 60s React-Query cache.
4. `assertVisible: 'Balance due'` + the amount (via `AmountDueCard`).
5. `tapOn: 'Complete payment'` → `AdjustmentCheckoutScreen` (`assertVisible: 'Amount due'`).
6. Paymob WebView → `tapOn: 'Pay now'` (as A7's extension checkout does).
7. `_relaunch` → `assertNotVisible: 'Balance due'` (webhook marked the adjustment PAID).

Register `admin-time-edit` in advance.js's dispatch switch. `ADMIN_EMAIL`/`ADMIN_PASSWORD` are
already passed to advance.js by run.mjs.

---

## Phase 2 — Shared infra

### 2a. Firebase Storage emulator
- **Test stack:** add the Storage emulator to whatever brings up the Auth emulator (Firebase
  emulator suite / `firebase.json` `emulators.storage`), on its own port; add to `pnpm test:env`
  and the runner's prerequisite checks.
- **Mobile wiring:** in `lib/storage.ts`, `connectStorageEmulator(storage, host, port)` when
  `Constants.expoConfig.extra.firebaseStorageEmulatorHost` is set; add that extra in
  `app.config.ts` (default `''`, set by `emulator-env.mjs` to `10.0.2.2:<port>`), exactly like
  `firebaseAuthEmulatorHost`.
- **Storage rules:** open rules for the emulator so unauthenticated-in-emulator writes succeed.

### 2b. Photo-picker affordance
- A thin wrapper the registration screens already call for image selection (profile photo on
  step 1; nanny ID) returns a **bundled placeholder asset URI** when
  `extra.firebaseStorageEmulatorHost` (or a dedicated `extra.e2e`) is set — no
  `launchImageLibraryAsync`. Enables `Continue` (needs `draft.photoUri`) and feeds a real upload to
  the Storage emulator.
- Add the placeholder image under `assets/`.

### 2c. Account lifecycle (seeder)
- `seed-mobile.ts` gains a dedicated **registration** phone/email that it **deletes** (Firebase user
  + DB row + dependent rows) before each registration flow, so a completed signup never
  accumulates in the never-truncated DB. Add the account to `accounts.mjs`.

*(Phase 2 requires a fresh `e2e:build`.)*

---

## Phase 3 — Registration through the forms

Built on Phase 2. Drives every step; the photo affordance + Storage emulator make step 1 and the
uploads pass.

- **Mother** (`c02` full path, and a fuller `a11`): role → step 1 (phone + placeholder photo) →
  create password → step 2 (location via search, children, prefs) → step 3 (phone OTP via
  `advance.js phone-otp`, **referral code field** → covers **C7** through the UI, terms →
  Complete). Ends signed in.
- **Nanny** (`a10` full path): role → step 1 → password → location → nanny details → **email
  verification** (`advance.js` reads the emulator oobCode/verification, new step) → **ID upload**
  (placeholder → Storage emulator) → Complete → vetting gate.
- Update `c02` to complete each path rather than stopping at step 1; keep the seeded-account
  variants only where a full drive adds nothing.

**Lab-tune:** every selector, the location-search interaction, the DOB dialog, keyboard handling
(all catalogued in `e2e/README.md`).

---

## Phase 4 — Marketplace listing from the app · extends `c05`

With Storage working: in `c05-community.yaml`, drive `CreatePostScreen` to create a **marketplace
listing** with the placeholder photo → uploads to the Storage emulator → assert it appears (and,
since listings need admin approval before they're public, either assert the pending state or
approve over HTTP via the existing `advance.js` marketplace approve helper).

---

## Verification (per phase)
- Phase 1: `pnpm test:e2e:mobile a08` against the lab.
- Phase 2: rebuild, then a smoke run + an upload-dependent flow.
- Phase 3: `a10`, `a11`, `c02`, `c07` runs.
- Phase 4: `c05` run.
Run each **twice in a row** (the README's rule) to catch state that only the second run reveals.

## Out of scope
- C3 push-token coverage (needs a route exposing tokens + `DELETE /devices/push-token` wired on
  logout — a real app gap, tracked separately).
- The live-camera (B7) mobile flow.
- Rewriting `c01`'s forgot-password section for the new phone reset (separate, already flagged).
