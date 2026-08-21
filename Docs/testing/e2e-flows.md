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
<sub>Source: `VALID_TRANSITIONS` in [booking.service.ts:458](../../apps/backend/src/services/booking.service.ts:458).
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
every P0 flow is asserted end to end over real HTTP. Ten of them are also driven through a UI; the
table names that spec and says what driving it actually adds. **A9 needs no UI** — a dropped webhook
has none. **A8's is still to write**, and is the only P0 gap.

| Flow | API journey | UI spec | What the UI adds |
|---|---|---|---|
| A1 | `a01-booking-lifecycle` | `a01-booking-happy-path.yaml` | The whole journey on a device, paid in a real WebView |
| A2 | `a02-admin-reject` | `a02-reject-booking.spec.ts` | The console's own reject action |
| A3 | `a03-refund` | `a03-refund.spec.ts` | Refunding from the console |
| A4 | `a04-promo-code` | `a04-promo-code.yaml` | That the discounted figure is the one the checkout page charges |
| A5 | `a05-care-points` | `a05-care-points.yaml` | Hours reserved before a nanny exists, applied without a tap once one accepts |
| A6 | `a06-package-hours` | `a06-package-purchase.yaml` | A second checkout, and the hours turning up where a mother looks |
| A7 | `a07-extension` | `a07-extension.yaml` | The mid-shift card: ask, wait, pay for the extra hours |
| A8 | `a08-time-edit-adjustment` | **not written** | Would add the console's edit preview and the delta it applies — the one P0 UI half still outstanding |
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

### B1. Superuser manages operators · `UI:admin`
Create an operator, set per-section levels, delete. **Assert:** the operator's *next* session
reflects the change — this is where a cached token or stale permission payload would show.

### B2. Session lifecycle · `UI:admin`
Token refresh, the 401-replay interceptor in `api-client.ts`, logout, and a deep link to a
protected page while anonymous → `/login` → redirect back after signing in.

### B3. Catalogue CRUD with downstream effect · `UI:admin`
Skills, certifications, packages, promo codes, campaigns, duration rules, pricing & fees, booking
options, support contact, cameras. The pattern is the same for each and only worth writing once:
**create in the console → assert it appears in the mobile-facing API** (`/bookings/options`,
`/nanny/skills`, `/packages`, …). Half of these are static config with no other consumer.

### B4. Bookings console · `UI:admin`
Filter, search, paginate, open detail, change status, refund. The list is the operator's primary
workspace.

### B5. Users console and ID review queue · `UI:admin`
Mother and nanny detail pages, approve/reject, the pending-ID queue draining as items are actioned.

### B6. Marketplace listing lifecycle · `UI:both`
Note the modelling: listings **are** community posts — `/community/posts` with a category, surfaced
by `/community/my-posts`, moderated through `/admin/marketplace/listings`. Parent creates → PENDING
→ admin approves → visible in `MarketplaceScreen` → buyer contacts seller, which auto-creates a
conversation. Reject path: `MyListingsScreen` shows the reason → fix → resubmit (the most recent
feature commit, so untested by construction).

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
| C1 | Sign in, sign out, forgot password, create password | `UI:mobile` |
| C2 | Role selection branching (mother vs nanny paths diverge) | `UI:mobile` |
| C3 | Notification permission gate → push token registered on login, cleared on logout | `UI:mobile` |
| C4 | Nanny day: dashboard → requests → booking detail → care log authoring | `UI:mobile` |
| C5 | Community: create post, like, comment, create event, RSVP, capacity limit | `UI:mobile` |
| C6 | Messaging: conversation list, thread, send, unread badge, read receipts | `UI:mobile` |
| C7 | Referral: generate code → new user applies it at registration → `/referral/validate` | `UI:mobile` |
| C8 | Notification centre: list, mark read, mark all read, unread count | `UI:mobile` |
| C9 | Customer support contact screen | `UI:mobile` |
| C10 | Failure states: backend unreachable, token expired mid-session, no results | `UI:mobile` |

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
   `apps/mobile/e2e/scripts/advance.js`; B6 should be written the same way.
4. ~~Seed determinism.~~ **Resolved for the mobile lab.** `apps/mobile/e2e/fixtures.mjs` and
   `apps/backend/test/e2e/seed-mobile.ts` provision an eligible nanny, undo the previous run, and
   set a full-24h care window with zero lead time so the suite does not pass or fail by time of
   day. Two caveats survive: the seed runs before **every** flow, not once per suite, and a full-day
   window exposes a picker bug that makes A1 and A7 unrunnable between 22:00 and midnight — see
   `apps/mobile/e2e/README.md`.
