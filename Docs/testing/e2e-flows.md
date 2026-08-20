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
PENDING ──(admin console)──▶ APPROVED ──(mobile + Paymob)──▶ CONFIRMED
   │                                                              │
   │                                            (nanny mobile, PIN)│
   ▼                                                              ▼
CANCELLED ◀── any non-terminal                              IN_PROGRESS
                                                                  │
                                                    (nanny check-out)│
                                                                  ▼
                                                             COMPLETED
```
<sub>Source: `VALID_TRANSITIONS` in [booking.service.ts:458](../../apps/backend/src/services/booking.service.ts:458).
`PENDING_CONFIRMATION` is legacy-only — the current flow never produces it. `REFUNDED` is owned by
the payments domain and is not reachable through the transition table.</sub>

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

### A1. Booking happy path, card payment · `UI:both`
The flagship. Parent signs in → nanny search (PostGIS radius ranking) → nanny profile →
`BookingStep1/2/3` (children, date/time, care details) → `BookingConfirmation` → **PENDING**.
Operator approves in the console → **APPROVED**. Parent pays via the Paymob fake → webhook →
**CONFIRMED**. Nanny accepts (advisory only). Nanny requests a start PIN, parent reads it out,
nanny checks in → **IN_PROGRESS**. Nanny writes care logs; parent sees them in
`CareActivityFeedScreen`. Nanny checks out → **COMPLETED**. Parent submits a review.

**Assert:** status after every hop; `Payment` row reaches `CAPTURED`; the nanny/platform split
matches the shared pricing engine exactly; a notification row exists per transition; the review
moves the nanny's average rating.

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
the ID-review queue → **the nanny becomes discoverable in parent search**, which is the assertion
that matters. Reject path shows the reason in-app.

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
- **PostGIS radius ranking correctness** — backend integration with fixed coordinates. E2E asserts
  only that a nearby nanny appears and a distant one does not.
- **Pagination and sort on every admin list** — component tests with MSW.
- **HMAC signing variants** — already covered by `paymob-fake.smoke.test.ts` and the unit tests.
- **Email bodies** — assert *one* message per flow via Mailpit; templates are unit-testable.
- **RBAC on all ~161 endpoints** — drive the matrix over HTTP in plan 1; E2E covers the console's
  UI-level enforcement only (A12).

## Known blockers to resolve before writing P0/P1 specs

1. **`testID` / `data-testid` instrumentation does not exist.** Every flow above needs it. This is
   listed as out of scope in the environment plan and needs to land inside plans 4 and 6.
2. **Live video (B7) and any WebSocket realtime** are likely not drivable by Maestro. Expect to
   assert the *signalling* (credentials issued, notification sent) and stop at the media stream.
3. **Two-driver specs (A1, A7, A10, B6)** need a decision on orchestration: run Maestro and
   Playwright in one harness, or advance the non-focus surface over HTTP. The second is far
   cheaper and is the recommendation.
4. **Seed determinism.** A1 needs a nanny within radius of a known parent coordinate; the current
   factories place both in Cairo but do not guarantee ranking order.
