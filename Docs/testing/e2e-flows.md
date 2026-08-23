# E2E Flow Catalogue

The flows worth driving through a real UI against the real stack, in priority order.
Derived from the shipped routes (`apps/backend/src/routes`), screens
(`apps/mobile/src/screens`, 64) and admin pages (`apps/admin/src/pages`, 18) — not from
`docs/user-stories`, which has drifted from the build.

This is the input to follow-up plans **4 (admin E2E journeys)** and **6 (mobile device lab +
Maestro)**. It authors no tests.

---

## The structural finding

**Most of the high-value flows are cross-surface.** The booking lifecycle alone spans three
surfaces and an external payment provider:

```
PENDING ──(first nanny to accept)──▶ APPROVED ──(mobile + Paymob)──▶ CONFIRMED
   │                                                                     │
   │                                                   (nanny mobile, PIN)│
   ▼                                                                     ▼
CANCELLED ◀── any non-terminal                                     IN_PROGRESS
                                                                         │
                                                           (nanny check-out)│
                                                                         ▼
                                                                    COMPLETED
```
<sub>Source: `VALID_BOOKING_TRANSITIONS` in
[packages/shared/src/booking.ts:30](../../packages/shared/src/booking.ts:30) — it lives in `shared`
so the admin console can offer exactly the transitions the server will accept, and reaches the
backend through the `canTransitionBookingStatus` re-export in `booking.service.ts`.
`PENDING → APPROVED` is normally the nanny's claim
([`applyNannyDecision`](../../apps/backend/src/services/booking.service.ts:1357)), **not** an operator
action: a booking is created unassigned and broadcast, and the first nanny to accept both claims it
and approves it. `POST /admin/bookings/:id/approve` still exists but is an override that *requires a
nanny already assigned* ([admin-booking.service.ts:283](../../apps/backend/src/services/admin-booking.service.ts:283)),
so it cannot be the flagship path. `PENDING_CONFIRMATION` is legacy-only — the current flow never
produces it. `REFUNDED` is owned by the payments domain and is not reachable through the transition
table.</sub>

Neither an admin-only Playwright run nor a mobile-only Maestro run can cover that on its own. So
each flow below names a **driver**:

| Driver | Meaning |
|---|---|
| `UI:admin` | Playwright drives the console; other surfaces are advanced over HTTP |
| `UI:mobile` | Maestro drives the app; other surfaces are advanced over HTTP |
| `UI:both` | Two drivers in one spec — expensive, reserve for the flagship journeys |
| `API` | No UI; a backend integration journey (plan 1), listed here only to mark the boundary |

The Paymob fake and the Auth emulator make every one of these runnable locally with no money,
no live credentials and no network.

---

## P0 — Money and trust

Nothing ships without these. Each one either moves money, grants access, or decides whether a
stranger is allowed near a child.

**All twelve have an API journey** in
[`apps/backend/src/__integration__/journeys/`](../../apps/backend/src/__integration__/journeys), so
every P0 flow is asserted end to end over real HTTP. Eleven are also driven through a UI; the table
names that spec and says what driving it adds. **A9 needs no UI** — a dropped webhook has none.

The spec file names do not map one-to-one onto flows: A8's admin half lives in `a03-refund.spec.ts`,
because both start from the same paid booking and differ only in which way the edit moves the total.
Look for a flow's coverage by reading the table, not by listing the directory.

| Flow | API journey | UI spec | What the UI adds |
|---|---|---|---|
| A1 | `a01-booking-lifecycle` | `a01-booking-happy-path.yaml` | The whole journey on a device, paid in a real WebView |
| A2 | `a02-admin-reject` | `a02-reject-booking.spec.ts` | The console's own reject action |
| A3 | `a03-refund` | `a03-refund.spec.ts` | Refunding from the console |
| A4 | `a04-promo-code` | `a04-promo-code.yaml` | That the discounted figure is the one the checkout page charges |
| A5 | `a05-care-points` | `a05-care-points.yaml` | Hours reserved before a nanny exists, applied without a tap once one accepts |
| A6 | `a06-package-hours` | `a06-package-purchase.yaml` | A second checkout, and the hours turning up where a mother looks |
| A7 | `a07-extension` | `a07-extension.yaml` | The mid-shift card: ask, wait, pay for the extra hours |
| A8 | `a08-time-edit-adjustment` | `a03-refund.spec.ts` | The console's edit preview and the delta it applies. Shares a file with A3 — one seeded paid booking serves both. The mother's half (settling the balance on `AdjustmentCheckoutScreen`) has no mobile flow yet |
| A9 | `a09-webhook-resilience` | — | Nothing — a dropped webhook has no UI |
| A10 | `a10-nanny-onboarding` | `a10-nanny-onboarding.yaml` | The vetting gate: waiting screen, then dashboard |
| A11 | `a11-mother-id-gate` | `a11-mother-id-gate.yaml` | That the gate is on the *action*, not on the app |
| A12 | `a12-operator-access-matrix` | `a12-operator-ui.spec.ts` | The sidebar, and a direct URL to a forbidden section |

Mobile specs live in `apps/mobile/e2e/flows/`, admin specs in `apps/admin/e2e/`. Two are
deliberately narrower on mobile than described below: **A10 and A11 start from a seeded account
rather than driving registration**, because registration ends at an ID upload that opens the
Android photo picker and its crop screen — system UI that changes between OS versions, for the
least return in the suite. What registration itself decides is asserted over HTTP in the matching
API journeys. See `apps/mobile/e2e/README.md`.

### A1. Booking happy path, card payment · `UI:mobile` (+ the nanny advanced over HTTP)
The flagship, and the flow this catalogue previously described wrongly. **Care is broadcast
Uber-style — the parent never searches for or picks a nanny, and no operator is in the path.**

Parent signs in → `HomeScreen` "Book care" (ID-verification gate) → `BookingDatePickerScreen`
(date, time, duration) → `BookingCareDetailsScreen` (children, skills, instructions) →
`BookingStep1Screen` (review, promo code, Care Points, package hours) → `POST /bookings` →
**PENDING with `nannyProfileId = null`**.

The request is then broadcast to every *eligible* nanny — approved ID, complete profile, free for
the window, inside `broadcast_radius_km`, holding every skill the request was priced for
([`notifyBookingBroadcast`](../../apps/backend/src/services/booking.service.ts:555) and
[`listAvailableBookings`](../../apps/backend/src/services/booking.service.ts:1198) filter on the
same axes). `BookingConfirmationScreen` holds a live "searching" state with an elapsed timer while
she waits. The **first nanny to accept** from `NannyRequestsScreen` claims the request, and that
claim is what moves **PENDING → APPROVED** — guarded by an atomic status-conditioned `updateMany`
so two nannies cannot claim the same request.

The reveal on `BookingConfirmationScreen` then offers **Complete payment** → `BookingStep3Screen`
(Paymob WebView) → webhook → **CONFIRMED**. (`booking-step-2` is a legacy redirect; there is no
payment-method step.) Nanny requests a start PIN (`/bookings/:id/start-pin`), parent reads it out,
nanny checks in → **IN_PROGRESS**. Nanny writes care logs; the parent reads them in the **Care log
section of `BookingDetailScreen`** (`BookingCareLogSection` — there is no standalone care-log
screen). Nanny checks out → **COMPLETED**. Parent submits a rating, which is not optional:
`RatingPromptHost` raises a sheet over the app on next open, and only submitting closes it. It
prompts for the **most recently completed** booking only — older unrated ones stay optionally
rateable from booking history, per
[the rating design](../superpowers/specs/2026-07-16-mandatory-rating-design.md).

Driver note: nothing here needs a second UI driver. Maestro drives the mother; the nanny's four
moves (accept, check in, care log, check out) are advanced over HTTP.

**Assert:** status after every hop; the claim actually flips PENDING → APPROVED and a **second**
nanny accepting the same request is refused ("no longer awaiting a nanny decision"); a nanny
outside the radius or missing a priced skill never sees the request in her pool; `Payment` row
reaches `CAPTURED`; the nanny/platform split matches the shared pricing engine exactly; a
notification row exists per transition; the review moves the nanny's average rating.

### A2. Admin rejects a pending booking · `UI:admin`
`PENDING → CANCELLED` via `/admin/bookings/:id/reject`. **Assert:** no `Payment` row was ever
created, and the parent's booking detail shows the rejection.

### A3. Refund a paid booking · `UI:admin`
Cancel or refund a **CONFIRMED** booking → real refund call to the Paymob fake → **REFUNDED**.
**Assert:** partial then full refund accumulate on the same transaction; over-refunding is
reported as unsuccessful rather than crashing; any redeemed Care Points are returned.

### A4. Promo code end to end · `UI:mobile`
`/bookings/validate-promo` → discounted total on the checkout screen → Paymob is charged the
**discounted** amount → usage count increments. **Assert:** the second use of a single-use code
is refused, and expiry / minimum-spend rejections surface in the UI.

### A5. Care Points redemption · `UI:mobile`
Superuser grants points (`/admin/rewards/wallets/:userId/grant`) → parent sees the balance on
`RewardsScreen` → redeem against a booking → pay the remainder → cancel → points restored via
`/redeem-points/refund`. **Assert:** the ledger balances; points cannot be double-spent across
two concurrent bookings.

### A6. Package purchase → hours → consumption · `UI:mobile`
`PackagesScreen` → `PackageCheckout` → Paymob → `PackagePaymentResult` → `/packages/me/hours`
shows the credit → book using package hours → hours decrement. **Assert:** the purchase appears
under admin package-purchases; booking more hours than the balance falls back to card.

### A7. Mid-care extension · `UI:both`
Parent requests extra hours on an **IN_PROGRESS** booking → nanny accepts → `ExtensionCheckout` →
Paymob → end time extended and price adjusted. **Assert:** the decline path and the
parent-cancels-before-response path both leave the booking untouched.

### A8. Admin time edit → price adjustment · `UI:admin`
`/admin/bookings/:id/edit/preview` shows the delta → `/edit` applies it → parent settles via
`AdjustmentCheckoutScreen` → `/adjustments/:id/pay/paymob`. **Assert:** preview and applied
totals agree; a downward edit produces a refund rather than a charge.

### A9. Payment webhook resilience · `API`
Three cases that only a real HMAC path can prove: a **dropped** webhook reconciled by
`/pay/paymob/sync`; a **duplicate** webhook that is idempotent; a **tampered** signature that
returns 401 and leaves the booking APPROVED. Partly covered already by
`paymob-fake.smoke.test.ts`.

### A10. Nanny onboarding and approval · `UI:both`
Role selection → nanny details → location → ID upload → `PendingReviewScreen`. Admin approves in
the ID-review queue → **the nanny enters the broadcast pool**, which is the assertion that matters:
a new request created afterwards is pushed to her and appears in `NannyRequestsScreen`, where she
can claim it. (There is no parent-facing nanny search to become "discoverable" in.) Reject path
shows the reason in-app.

### A11. Mother ID verification gates booking · `UI:mobile`
Registration steps 1–3 → `UploadIdScreen` → `PENDING_REVIEW`. **Assert:** booking is refused while
`idVerificationStatus` is `PENDING_ID` or `REJECTED`
([booking.service.ts:894](../../apps/backend/src/services/booking.service.ts:894)), and permitted
the moment an admin approves.

### A12. Operator section access · `UI:admin`
The single highest-value admin spec, because the sidebar and the API both read the same
`hasSectionAccess` in [operator.ts](../../packages/shared/src/operator.ts) — a drift here is
silent. For an operator with a partial grant: the sidebar hides forbidden sections, a **direct URL**
to one is blocked, a `VIEW`-only section renders read-only, and the API refuses the write
independently of the UI. Worth driving as a matrix over all 13 sections × `NONE`/`VIEW`/`MANAGE`.

---

## P1 — Core operations

### B1. Superuser manages operators · `UI:admin` — **covered** by `b01-manage-operators.spec.ts`
Create an operator, set per-section levels, delete. **Assert:** the operator's *next* session
reflects the change — this is where a cached token or stale permission payload would show.

Every assertion is therefore made in a second, signed-out browser context, which is the only thing
that proves the hand-off: a grant is read once per session into `PermissionsProvider` from a single
`/admin/me` call, so a spec that re-read the superuser's own page would pass while every operator
kept their stale reach. The operator is *created through the form* rather than seeded, because
`createAdminUser` provisions the Firebase account as a side effect of that call — seeding over HTTP
would skip the half that has to work for the new account to be able to sign in at all. Removal is
asserted at the door: it disables the Firebase user, so the next attempt is refused by
authentication rather than by a section check further in.

### B2. Session lifecycle · `UI:admin` — **covered** by `b02-session-lifecycle.spec.ts`
Token refresh, the 401-replay interceptor in `api-client.ts`, logout, and a deep link to a
protected page while anonymous → `/login` → redirect back after signing in.

The 401 test is the one worth understanding before changing it, because the obvious version of it
passes for the wrong reason. Failing the first call and asserting the page recovers proves nothing:
React Query is configured `retry: 1`, and StrictMode mounts every effect twice in dev, so a second
request arrives within milliseconds whether or not the interceptor exists — **verified by disabling
the interceptor and watching that version still pass.** What discriminates is rejecting *the token
the app is currently holding* and accepting any other: the request interceptor calls `getIdToken()`
unforced, so retries and double-mounts all resend the stale one, and only the 401 handler's
`getIdToken(true)` produces something new. Nothing else in the app forces a refresh, so a request
that gets through is proof the handler ran.

### B3. Catalogue CRUD with downstream effect · `UI:admin` — **covered** by `b03-catalogue-downstream.spec.ts`
Skills, certifications, packages, promo codes, campaigns, duration rules, pricing & fees, booking
options, support contact, cameras. The pattern is the same for each and only worth writing once:
**create in the console → assert it appears in the mobile-facing API** (`/bookings/options`,
`/nanny/skills`, `/packages`, …). Half of these are static config with no other consumer.

The spec covers the five with a real downstream reader. The read-back is always the **public**
route: an admin list would only confirm the row was written, whereas what matters is that it crossed
into what a nanny picks from or what a mother is charged — and those routes filter on the way out,
which is why the skill test also creates an inactive row and checks it stays invisible. Promo codes
are asserted as **money off a subtotal**, not as a row; note `/bookings/validate-promo` returns the
discount alone, and the app does the subtraction.

The booking-rule test restores what it changed, in a `finally`. That config is global, nothing
truncates it between specs, and leaving it altered would quietly change every booking made for the
rest of the run — `maxBookingHours` is chosen because no other fixture depends on it.

Adding another catalogue here means fighting the label lookup: these pages reuse label words, and
`Field` renders its hint *inside* the `<label>`, so an accessible name is often the label plus a
sentence — `getByLabel('Hours')` on Packages also matches "Validity (days) How long a…". Fill through
the spec's `fill` helper, which scopes to the card and anchors at the start of the name.

### B4. Bookings console · `UI:admin` — **covered** by `b04-bookings-console.spec.ts`
Filter, paginate, open detail, change status, refund. The list is the operator's primary workspace.
There is **no search** on this page — the catalogue previously claimed one; filters and paging are
the only ways to narrow it, which is why paging is asserted rather than assumed.

Seeing, opening, rejecting and refunding are already covered by A1–A3, so B4 takes what is left:
the status override, paging a queue longer than one screen, and the rule that a completed booking is
locked. The paging tests seed eleven bookings for **one** mother on consecutive days — an account
per row would cost a Firebase sign-up each, and overlapping times are refused.

It used to pin a gap, the same shape as A1's: the override offered every status on every row, while
the server enforced the transition table — so "completed" on a new request was a guaranteed error
toast. Both are now closed. The dropdown builds its options from `canTransitionBookingStatus`, and
the Approve action is withheld unless a nanny is already assigned, so an unclaimed request offers
only `cancelled`. The specs assert the **whole** option list rather than the absence of one bad
entry, which a filter dropped for every other status would still satisfy.

One case here is about *who is looking* rather than about a booking: the override is a write control
(`PATCH /bookings/:id/status` needs bookings:MANAGE), so a **view-only operator does not get the
column at all** — closed along with the test, which fails against the previous code. It runs as the
`bookingsViewer` role, the same single section as `bookingsOperator` but held at VIEW, which is what
makes an absent control attributable to the level rather than to the section never being granted.
The spec asserts the *Status* column header is present before asserting the *Override* one is not,
so a `columnheader` query that matched nothing could not pass it silently.

### B5. Users console and ID review queue · `UI:admin` — **covered** by `b05-users-and-id-review.spec.ts`
Mother and nanny detail pages, approve/reject, the pending-ID queue draining as items are actioned.

Each decision is read back over HTTP, not just off the badge: a filtered list would look identical
if a row had stopped matching for some other reason. Rejection asserts the *reason* survives, since
that is what the user is shown.

Two things the specs had to work around, both worth knowing before writing more here. The gallery
orders `createdAt: 'asc'` — correct for a work queue, since the longest wait should be dealt with
first — but the E2E database is never truncated, so a freshly seeded person is always on the **last**
page, and every filter change resets to the first. And that ordering is the **opposite** of the
Mommies and Nannies tabs, which are newest-first: the same people, two views, two directions.

### B6. Marketplace listing lifecycle · `UI:both` — **covered** by `b06-marketplace-moderation.spec.ts`
Note the modelling: listings **are** community posts — `/community/posts` with a category, surfaced
by `/community/my-posts`, moderated through `/admin/marketplace/listings`. There is no marketplace
table, so "did it reach the marketplace" is a question about the community feed, never about an
admin list.

Written as one driver plus HTTP, per blocker 3: Playwright drives the console, and everything on the
app's side — posting, editing, browsing the feed, "Contact seller" — is advanced by
`e2e/helpers/backend.ts`. The full loop is covered: pending → approve → live → buyer contacts seller
(which auto-creates the conversation), plus reject-with-reason → seller fixes → back in the queue →
approve.

**The trap this flow sets, and the reason the helper takes a viewer token:** an author always sees
her own listing in any moderation state, because "My listings" has to show her a rejection so she can
act on it. So visibility is only ever asserted through a **buyer's** token — asked with the seller's,
every one of these tests passes before an admin has done anything at all. `listingVisibleTo` and
`findInMarketplaceFeed` both require the viewer explicitly for that reason.

Two behaviours were worth pinning on their own. Rejection doubles as a **takedown** — the menu item
on a live listing reads "Take down", and it drops the listing out of the feed and closes the contact
route with it. And an edit to an **already-approved** listing re-enters review rather than publishing
through, which is what stops a seller quietly changing the price on something people can see.

Not covered: the official-listing **form**. It uploads a photo to Firebase Storage and the test stack
runs an Auth emulator only, so official listings are published over HTTP through the same route the
form posts to; the console half — the Official badge, the Edit/Delete menu in place of
Approve/Reject, and deleting — is still driven through the UI. A Storage emulator would close the
gap.

The queue is walked rather than paged to either end. Pending is oldest-first (a work queue serves the
longest wait first) while every other filter is newest-first with official listings pinned above the
rest, and the E2E database is never truncated — so both ends drift with every run that has ever
executed. `findRow` walks while *Next page* is enabled, which is the only direction-agnostic answer.

### B7. Live camera session · `UI:mobile`
Admin assigns a camera to a booking → `/bookings/:id/camera` returns stream credentials →
`LiveVideoMonitorScreen` → `/camera/notify` alerts the nanny. **See the caveat below** — the video
transport itself is probably not drivable.

---

## P2 — Engagement surfaces

Real flows, lower blast radius. Component and API tests carry most of the weight; one thin E2E
each proves the screen is wired.

| # | Flow | Driver |
|---|---|---|
| C1 | Sign in, sign out, forgot password, create password — **covered** by `c01-session-lifecycle.yaml` | `UI:mobile` |
| C2 | Role selection branching (mother vs nanny paths diverge) — **covered** by `c02-role-selection.yaml` | `UI:mobile` |
| C3 | Notification permission gate → push token registered on login, cleared on logout — **not covered**, see below | `UI:mobile` |
| C4 | Nanny day: dashboard → requests → booking detail → care log authoring — **covered** by `c04-nanny-day.yaml` | `UI:mobile` |
| C5 | Community: create post, like, comment, create event, RSVP, capacity limit — **covered** by `c05-community.yaml` | `UI:mobile` |
| C6 | Messaging: conversation list, thread, send, unread badge, read receipts — **covered** by `c06-messaging.yaml` | `UI:mobile` |
| C7 | Referral: generate code → new user applies it at registration → `/referrals/validate` — **covered** by `c07-referral.yaml` | `UI:mobile` |
| C8 | Notification centre: list, mark read, mark all read, unread count — **covered** by `c08-notification-centre.yaml` | `UI:mobile` |
| C9 | Customer support contact screen — **covered** by `c09-customer-support.yaml` | `UI:mobile` |
| C10 | Failure states: backend unreachable, token expired mid-session, no results — **covered** by `c10-failure-states.yaml` | `UI:mobile` |

**The photo picker is what bounds C2 and C7.** Step 1 of registration disables `Continue` until
`draft.photoUri` is set — for a mother as well as a nanny — so *every* path through the signup
forms opens the Android photo picker and its crop screen. That is the system UI A10 already
refused to drive, and it would also mint a new account on every run against a database that is
never truncated. Both flows therefore stop at step 1 and say so; what each one loses is named in
its own section below.

### C1. Session lifecycle · `UI:mobile` — **covered** by `c01-session-lifecycle.yaml`
The only flow whose subject is the auth screens themselves; every other one signs in and moves on.

Two assertions here are about things a screen cannot show. **Signing out is checked by reopening the
app** — navigating back to the welcome screen looks identical whether or not Firebase's persisted
session was cleared, and Firebase restores a session on launch, so a sign-out that only changed the
route would put her straight back on Home. And the reset is checked against the **Auth emulator's own
out-of-band code list**, counted either side of the tap: "Check your inbox" is client state the
screen sets on any success the SDK reports, nothing clears the emulator's list, and a code left by an
earlier run would satisfy a bare "does one exist".

A wrong password has to *look* like a password. `validatePassword` runs before any network call and
rejects anything under eight characters or missing an uppercase letter or a digit, so an obviously
junk string asserts the client-side rule while appearing to test the server's answer.

**KNOWN GAP pinned here: the reset screen asks for an email address no user of this app has.**
Sign-up is phone-only — `RegistrationStep3Screen` derives a placeholder from the phone number and
that synthesized string is both the Firebase credential and the address on the user row. Registration
never asks for a real one. So `sendPasswordResetEmail` succeeds only for a string the person has
never been shown, and anything they might actually type comes back "We couldn't find an account with
those details." The flow asserts **both** halves, so closing the gap turns the first assertion red
rather than passing quietly.

### C2. Role selection branching · `UI:mobile` — **covered** by `c02-role-selection.yaml`
The screen's whole job is a fork, and the fork is visible on the very next screen: a mother signs
up in four steps and a nanny in five, because a nanny has details, a working area and an ID to hand
over. The flow asserts the button taking the name of the choice, the step count on each path, and —
the one that is easy to leave untested — that switching choices **throws the half-typed draft
away**. The draft is a persisted store, so a stale one is exactly how the wrong role's answers
reach the backend.

Stops at step 1 of each path, for the photo-picker reason above. What that leaves uncovered is what
the later screens *ask for*, which is each screen's own business rather than the selection's.

### C3. Push token on login and logout · `UI:mobile` — **not covered**
Both halves are blocked, for different reasons, and the second one is a finding rather than a
limitation.

**Registration is not observable.** No route exposes a user's device tokens. The app posts to
`/devices/push-token` and shows nothing for it, so a flow has no way to tell a registration that
happened from one that silently failed. Push itself *does* work in the lab — the emulator registers
real FCM tokens, which is how the second half below was confirmed — so this becomes drivable the day
a read route exists for the console.

**Removal is not implemented.** `DELETE /devices/push-token` exists on the backend
(`device.routes.ts`) and **nothing in the mobile app ever calls it**. `useSignOut` clears the
profile store and the React Query cache and signs out of Firebase; the token stays. Confirmed
against the test database: the lab mother has 56 live `device_tokens` rows and zero removed,
despite C1 signing her out on every run. On a shared device the next person keeps receiving the
previous user's booking and message pushes. Spun off as its own task; the flow is worth writing
once it is fixed, because the fix is what there would be to assert.

The permission gate is a third casualty of the photo picker: `NotificationPermissionScreen` is
pushed from the end of registration and has no other entrance.

### C4. Nanny day · `UI:mobile` — **covered** by `c04-nanny-day.yaml`
The first flow to open the nanny's app. Every other one sees her side only through what the
mother's screen says about it, or over HTTP — so this is the only place her dashboard, the open
request pool, the **start-PIN modal** and the care log are exercised at all. A1 mints the PIN and
checks in over HTTP, and never touches that modal.

Two things it deliberately does not depend on:

- **The clock.** It never opens the date picker, so it is not one of the flows that goes red in the
  hours before midnight. `run.mjs` computes a wall-clock start ten minutes out in
  `PLATFORM_TIMEZONE` and the booking is created over HTTP, which puts the check-in window open by
  construction. Two hours is the platform minimum duration, so that is the shift length.
- **Being alone in the queue.** It is not, by a long way. The open-requests pool is shared with
  every suite that has ever run against this database and holds dozens of factory bookings wearing
  the same duration, price and "1 child · 3 yrs". Every step anchors to the **allergy line**, which
  is the only distinctive thing on the card — and, not coincidentally, the one thing on it a nanny
  must not get wrong. A bare `tapOn: 'Accept request'` claims a stranger's booking and then waits
  forever for a shift that is not hers.

The care log is asserted on both sides. A log that only renders in the nanny's own list is a log
the parent never sees, which is the entire reason the feature exists.

### C5. Community · `UI:mobile` — **covered** by `c05-community.yaml`
A Q&A question carries the loop every post type shares — create, appear, like, comment — and an
event adds the two things only events have: RSVP and a capacity that can run out. **Marketplace is
deliberately absent**: it needs a photo, and a photo needs Firebase Storage, which the local stack
does not run. Its lifecycle is B6's subject and is driven from the console there.

The flow opens by deleting every post the mother owns. Posts have no natural key and the database is
never truncated, so without that reset "the post is in the feed" is satisfied by last night's copy —
and a like count of exactly one could not be asserted at all.

**KNOWN GAP pinned here: a full event refuses the next RSVP and the app says nothing.**
`useToggleEventRsvp` has no `onError`, so the 409 is swallowed and the button simply does not
change. The last two assertions are made over HTTP for that reason, and are written so that
teaching the screen to report it leaves them true.

### C6. Messaging · `UI:mobile` — **covered** by `c06-messaging.yaml`
The mother is the *seller* here, which is the only side that exercises receiving. A conversation
cannot be conjured — the one thing that creates one is a buyer pressing "Message seller" on an
approved marketplace listing — so the seed walks that whole path over HTTP before the app opens.
Seeding a conversation row directly would prove the inbox renders without proving a row can come
into existence.

Unread is asserted in two currencies: the dot on the Account tab, whose only handle is its testID,
and the number for both people. Hers alone reaching zero could be a mark-read that fired without a
reply; his alone reaching one could be a reply that marked nothing read. Everything already in her
inbox is marked read first — conversations are never deleted, so a badge means something only if
this run put it there.

### C7. Referral · `UI:mobile` — **covered** by `c07-referral.yaml`
The referrer's side in full: her code as the API issued it, the invite that redeeming earned, and
the point values in the copy — which come from the reward config, so the assertions fail if a
console change stops reaching the screen.

The invitee's side stops at the endpoint. `/referrals/validate` is optional-auth precisely because
it runs mid-signup before a Firebase account exists, so the flow calls it **with no token at all**
— the state the field is genuinely in — and asks it both questions, a real code and a junk one. What
is left uncovered is `ReferralCodeField`'s own rendering, which is a component test.

Redeeming is once per account and permanent (a unique index on `referee_id`), so a second run is
answered 409. That is the same end state, not a failure: the referral row is there either way, which
is all the screen reads.

### C8. Notification centre · `UI:mobile` — **covered** by `c08-notification-centre.yaml`
List, unread count, tapping one, mark-all-read.

The notifications are made by **moderating two of the mother's marketplace listings** over HTTP,
which is a deliberate choice rather than a convenient one: every *booking* event that notifies a
mother — `NANNY_CHECKIN`, `BOOKING_COMPLETED` — needs a shift that has actually started, which drags
the fifteen-minute check-in window and the time of day into a flow about neither. Moderation notifies
the seller directly and has no clock in it.

The seeding step marks everything already there as read before creating its two. The notifications
table is never truncated, so an unread count is only worth asserting if the run is responsible for
every unread row — that is what makes `Unread (2)` an assertion rather than a description of whatever
the database was holding. Mark-all-read is confirmed against the API too: an empty list looks the
same whether it was cleared or failed to load.

Two Maestro traps are on display here. Selectors are **full-match regexes**, so `Unread` does not
match the pill, which renders `Unread (2)` in a single node — and those parentheses are a capture
group, so the assertion has to escape them. And `back` from the screen a notification routes *across*
to lands on Home rather than popping to the notification; the flow reopens through the bell, which is
what a person does anyway.

### C9. Help and support · `UI:mobile` — **covered** by `c09-customer-support.yaml`
The subject is the seam between the console and the app. Support channels are `app_settings` rows an
operator edits, and the app renders **a card per configured channel and hides the rest** — an empty
string is how one is switched off. So the flow configures WhatsApp and email, deliberately blanks
the phone number, and asserts all three outcomes. Seeding all three would never catch a regression
that renders a card for a line nobody answers.

The deep links stop at the tap: `Linking.openURL('tel:…')` hands off to an app the emulator does not
have, and following it would leave the flow outside the app under test.

**Worth knowing: the FAQ is not real.** `MOCK_FAQS` is a hardcoded array in `src/mocks/support.ts`.
Nothing an operator can do changes it and no API serves it. The search and the accordion are genuine
screen behaviour; the content is not, so those assertions will need updating on the day the FAQ gets
a backend — which is the day somebody should look at it anyway.

### C10. Failure states · `UI:mobile` — **covered** by `c10-failure-states.yaml`
The offline half is real: the device goes into airplane mode, so the request leaves and finds
nothing. Stubbing the client would have tested the stub. Both halves are asserted, because a
failure state that never recovers is the more common of the two bugs — and the recovery driven here
is the one the error message itself asks for, a pull to refresh.

The empty-list half is asserted on the mother's own bookings rather than any other list, because the
seeder soft-deletes what previous runs left behind — so "nothing here" is a fact about this run.

**A token expiring mid-session is not covered.** An ID token is good for an hour and `getIdToken()`
refreshes it transparently, so nothing inside a flow's lifetime can expire one; forcing it means
disabling the account every other flow signs in as. The 401 path is asserted where it can be, in the
backend's own integration tests.

---

## Deliberately **not** E2E

Each of these is better covered a tier down; driving them through a UI buys nothing but runtime
and flake.

- **Pricing arithmetic permutations** — shared unit tests plus backend integration. E2E proves the
  number reaches the screen; it should not enumerate the number.
- **Zod schema matrices** — plan 2.
- **Broadcast radius correctness** — backend integration with fixed coordinates. The radius now
  decides who a request is *offered* to, not how a result list is ranked (there is no ranked list).
  E2E asserts only that a nearby nanny gets the request in her pool and a distant one does not.
- **Pagination and sort on every admin list** — component tests with MSW.
- **HMAC signing variants** — already covered by `paymob-fake.smoke.test.ts` and the unit tests.
- **Email bodies** — assert *one* message per flow via Mailpit; templates are unit-testable.
- **RBAC on all ~161 endpoints** — drive the matrix over HTTP in plan 1; E2E covers the console's
  UI-level enforcement only (A12).

## Blockers

Three of the four listed here were resolved by the P0 work; what they were replaced with is the
pattern the P1 and P2 specs should follow, so they are kept rather than deleted.

1. **Still open — live video (B7) and any WebSocket realtime** are likely not drivable by Maestro.
   Expect to assert the *signalling* (credentials issued, notification sent) and stop at the media
   stream.
2. ~~Instrumentation does not exist.~~ **Resolved.** Mobile carries `testID="<screen>.<element>"`
   on exactly the controls a flow cannot reach by visible text; the convention and the rule for
   when to add one are in `apps/mobile/CLAUDE.md`. Check for an existing `accessibilityLabel`
   first — Maestro matches Android `content-desc` as text, which is why the star controls need no
   testID. Admin needs none: Playwright queries by role and label.
3. ~~Two-driver specs need an orchestration decision.~~ **Resolved: advance the non-focus surface
   over HTTP.** One driver per spec, always. A7 and A10 are Maestro plus HTTP via
   `apps/mobile/e2e/scripts/advance.js`; B6 was written the same way, with Playwright as the one
   driver and `apps/admin/e2e/helpers/backend.ts` advancing the app's side.
4. ~~Seed determinism.~~ **Resolved for the mobile lab.** `apps/mobile/e2e/fixtures.mjs` and
   `apps/backend/test/e2e/seed-mobile.ts` provision an eligible nanny, undo the previous run, and
   set a full-24h care window with zero lead time so the suite does not pass or fail by time of
   day. Two caveats survive: the seed runs before **every** flow, not once per suite, and a full-day
   window exposes a picker bug that makes A1 and A7 unrunnable in the last hours before midnight —
   see `apps/mobile/e2e/README.md`.

   **Still open, narrowed 2026-08-23.** `5c43f28 fix(mobile): stop hiding a day the picker can still
   book` did not close this. Run at ~23:00, A1 and A7 both fail at check-in with *"You can start this
   booking 15 minutes before the scheduled start time"* — `_book-to-review.yaml` walks the start
   stepper to its floor and back up two notches, and near midnight that floor is further out than the
   twelve decrements can reach, so the booking lands beyond the check-in window. The same two flows
   pass unchanged half an hour later. Until it is fixed, a late-evening red on A1/A7 is the clock,
   not the app — confirm by re-running after midnight before investigating anything else.

5. **New: the E2E database is shared and never truncated**, so the admin Playwright suite moves the
   ground under the mobile lab. Two mobile flows broke on it — a queue lookup that only read page one
   of ~1000 mothers, and a package that had sunk off the first screen. Both are fixed and both
   patterns are written up in `apps/mobile/e2e/README.md`; the rule for new work is to page or scroll
   rather than assume position in any list the console can add to.

   **Widened by the P2 work.** It is not only the admin suite: the *backend integration* suite
   leaves its factory bookings in the open-requests pool, so a nanny opening the app sees dozens of
   them wearing the same duration, price and children summary as the one the flow just made. C4
   answers this by seeding a distinctive allergy line and anchoring every step to it. C5, C6, C7 and
   C8 answer it a different way — each **empties its own corner first** (posts deleted,
   conversations marked read, notifications marked read), which is what lets them assert an exact
   count rather than "one more than before". Prefer emptying where a route allows it; anchor where
   it does not.

6. **New: registration cannot be driven at all**, on either path. Step 1 disables `Continue` until
   `draft.photoUri` is set, so a mother's signup opens the Android photo picker just as a nanny's
   does — and a completed registration would mint an account per run in a database nothing
   truncates. This bounds three flows: A10 and A11 start from seeded accounts, C2 stops at step 1,
   C7 asserts `/referrals/validate` directly instead of through the field that calls it, and C3's
   permission gate has no other entrance. Nothing here is worth a photo-picker driver; if it ever
   becomes worth it, a debug-build affordance that pre-fills the draft photo would unblock all four
   at once.
