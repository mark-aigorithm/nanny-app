# Epic 8: Wallet, Payments & Reviews

## Context

NannyMom provides an in-app wallet for mothers to hold promotional credits and refunds, a loyalty points system to reward engagement, tokenized payment method management via Paymob, a review system tied to completed bookings, and nanny earnings tracking. Payment card data never touches the NannyMom backend — all card operations are tokenized through Paymob's PCI-DSS compliant gateway.

**PRD references:** Section 6.10 (Mother Profile & Wallet), Section 6.2 (FR-02-04, FR-02-05 — Reviews), Section 6.3 (FR-03-06 — Payment Methods), Table 16 (FR-12-*), Table 18 (NFRs), Table 19 (Config — review submission window, service fee)
**Architecture references:** Section 2.1 (JWT Authorizer), Backend CLAUDE.md (service layer, error handling)

---

## Prerequisites (Prisma Models)

### WALL-01: Prisma schema — Wallet model
**As a** developer
**I want** the Prisma schema to define the `Wallet` model
**So that** each user has a persistent wallet with a balance.

**Acceptance criteria:**
- `Wallet` model with fields: `id` (UUID), `userId` (unique FK to User), `balance` (Decimal, default 0.00), `currency` (String, default "EGP"), `createdAt`, `updatedAt`
- One-to-one relation: `User` hasOne `Wallet`
- Balance must never go negative (enforced at the service layer, not DB constraint — allows transactional checks)
- Migration generated and applied: `pnpm db:migrate:dev`
- Prisma client generated: `pnpm db:generate`

**Unit tests:**
- Verify migration applies cleanly
- Verify Prisma client can create and read a Wallet record

### WALL-02: Prisma schema — WalletTransaction model
**As a** developer
**I want** the Prisma schema to define the `WalletTransaction` model
**So that** every wallet balance change is auditable.

**Acceptance criteria:**
- `WalletTransaction` model with fields: `id` (UUID), `walletId` (FK to Wallet), `type` (enum: `CREDIT`, `DEBIT`, `REFUND`, `PROMO`), `amount` (Decimal, positive), `description` (String), `referenceId` (nullable String — booking ID, promo code, etc.), `balanceBefore` (Decimal), `balanceAfter` (Decimal), `createdAt`
- Enum `WalletTransactionType { CREDIT DEBIT REFUND PROMO }`
- Index on `walletId` + `createdAt` for efficient history queries
- Migration generated and applied

**Unit tests:**
- Verify migration applies cleanly
- Verify a WalletTransaction can be created linked to a Wallet

### WALL-03: Prisma schema — PaymentMethod model
**As a** developer
**I want** the Prisma schema to define the `PaymentMethod` model
**So that** mothers can store tokenized payment references.

**Acceptance criteria:**
- `PaymentMethod` model with fields: `id` (UUID), `userId` (FK to User), `type` (enum: `CARD`, `APPLE_PAY`, `GOOGLE_PAY`, `VODAFONE_CASH`), `token` (String — Paymob tokenized reference), `last4` (String, 4 chars — last 4 digits for display), `brand` (nullable String — e.g., "Visa", "Mastercard"), `expiryMonth` (nullable Int), `expiryYear` (nullable Int), `isPrimary` (Boolean, default false), `isActive` (Boolean, default true), `createdAt`, `updatedAt`
- Enum `PaymentMethodType { CARD APPLE_PAY GOOGLE_PAY VODAFONE_CASH }`
- Unique constraint: only one `isPrimary = true` per `userId` (enforced at service layer with transaction)
- Index on `userId`
- Migration generated and applied

**Unit tests:**
- Verify migration applies cleanly
- Verify PaymentMethod can be created linked to a User

### WALL-04: Prisma schema — Review model
**As a** developer
**I want** the Prisma schema to define the `Review` model
**So that** mothers can rate nannies after completed bookings.

**Acceptance criteria:**
- `Review` model with fields: `id` (UUID), `bookingId` (unique FK to Booking — enforces one review per booking), `reviewerId` (FK to User — the mother), `nannyId` (FK to User — the nanny), `rating` (Int, 1-5), `text` (String, max 1000 chars), `createdAt`, `updatedAt`
- Unique constraint on `bookingId` (one review per booking, DB-level enforcement)
- Index on `nannyId` + `createdAt` for efficient review listing
- Index on `reviewerId` for "my reviews" queries
- Migration generated and applied

**Unit tests:**
- Verify migration applies cleanly
- Verify unique constraint on `bookingId` rejects duplicate reviews
- Verify Review can be created linked to Booking, reviewer, and nanny

---

## Wallet Stories

### WALL-05: Display wallet balance
**As a** mother
**I want** to see my current wallet balance on my profile screen
**So that** I know how much credit I have available for bookings.

**Acceptance criteria:**
- `GET /wallet` (requires auth, role: MOTHER)
- Returns `200 { data: { balance, currency, lastTransaction } }`
- `lastTransaction` includes type, amount, description, and date of the most recent WalletTransaction (null if no transactions)
- If no Wallet record exists for the user, auto-create one with balance 0.00
- Unit tests cover: existing wallet, auto-creation, wallet with transactions

### WALL-06: View wallet transaction history
**As a** mother
**I want** to view my wallet transaction history
**So that** I can see how my credits were earned and spent.

**Acceptance criteria:**
- `GET /wallet/transactions` (requires auth, role: MOTHER)
- Query params: `page` (default 1), `limit` (default 20, max 50), `type` (optional filter: CREDIT, DEBIT, REFUND, PROMO)
- Returns `200 { data: transactions[], meta: { page, limit, total, totalPages } }`
- Transactions sorted by `createdAt` descending (most recent first)
- Each transaction includes: id, type, amount, description, referenceId, balanceBefore, balanceAfter, createdAt
- Unit tests cover: paginated results, type filter, empty history

### WALL-07: Apply wallet credits during checkout
**As a** mother
**I want** to apply my wallet balance toward a booking payment
**So that** I can use my credits to reduce the amount charged to my card.

**Acceptance criteria:**
- `POST /wallet/debit` (requires auth, role: MOTHER — called internally by booking service)
- Request body: `{ amount, bookingId, description }`
- Validates that wallet balance >= requested amount; returns `400` if insufficient funds
- Creates a WalletTransaction with type DEBIT, records balanceBefore and balanceAfter
- Updates wallet balance atomically (Prisma transaction)
- Returns `200 { data: { transaction, remainingBalance } }`
- Unit tests cover: successful debit, insufficient funds, concurrent debit race condition (optimistic locking)

### WALL-08: Add wallet credits (promo/refund)
**As a** system (or admin)
**I want** to credit a mother's wallet with promotional credits or refunds
**So that** the mother receives compensation or promotional value.

**Acceptance criteria:**
- `POST /wallet/credit` (requires auth, role: ADMIN — or internal service call)
- Request body: `{ userId, amount, type: "REFUND" | "PROMO", description, referenceId? }`
- Creates a WalletTransaction with the specified type
- Updates wallet balance atomically (Prisma transaction)
- Returns `200 { data: { transaction, newBalance } }`
- Triggers a push notification to the mother: "Your wallet has been credited with {amount} {currency}"
- Unit tests cover: promo credit, refund credit, invalid userId

---

## Loyalty Points Stories

### WALL-09: Earn loyalty points
**As a** mother
**I want** to earn loyalty points for referrals, completed bookings, and reviews
**So that** I am rewarded for engaging with the platform.

**Acceptance criteria:**
- `LoyaltyPoints` tracked as a field on the Wallet model (add `loyaltyPoints` Int, default 0)
- Points awarded automatically by backend event handlers:
  - Completed booking: +50 points (configurable via `POINTS_PER_BOOKING` env var)
  - Submitted review: +20 points (configurable via `POINTS_PER_REVIEW` env var)
  - Successful referral (referee completes first booking): +100 points (configurable via `POINTS_PER_REFERRAL` env var)
- `GET /wallet` response includes `loyaltyPoints` alongside balance
- Points ledger entries stored as WalletTransactions with type CREDIT and a description indicating the source
- Unit tests cover: points awarded on booking completion, points awarded on review, points awarded on referral

### WALL-10: Redeem loyalty points for wallet credits
**As a** mother
**I want** to redeem my loyalty points for wallet credits
**So that** I can use my earned points toward bookings.

**Acceptance criteria:**
- `POST /wallet/redeem-points` (requires auth, role: MOTHER)
- Request body: `{ points }` (must be a positive integer, minimum redemption: 100 points)
- Exchange rate configurable via `POINTS_TO_CREDIT_RATE` env var (default: 100 points = 10.00 EGP)
- Validates user has sufficient points; returns `400` if insufficient
- Atomically deducts points and credits wallet balance (Prisma transaction)
- Creates a WalletTransaction with type PROMO and description "Redeemed {points} loyalty points"
- Returns `200 { data: { pointsRedeemed, creditsAdded, remainingPoints, newBalance } }`
- Unit tests cover: successful redemption, insufficient points, minimum redemption threshold

---

## Payment Method Stories

### WALL-11: List saved payment methods
**As a** mother
**I want** to see my saved payment methods
**So that** I can choose which one to use for checkout.

**Acceptance criteria:**
- `GET /payment-methods` (requires auth, role: MOTHER)
- Returns `200 { data: paymentMethods[] }` — only active methods (`isActive = true`)
- Each method includes: id, type, last4, brand, expiryMonth, expiryYear, isPrimary
- Primary method listed first, then sorted by createdAt descending
- Token field is **never** included in the response (server-side only)
- Unit tests cover: multiple methods with primary first, no methods (empty array)

### WALL-12: Add a payment method
**As a** mother
**I want** to add a new credit/debit card or mobile wallet
**So that** I can pay for bookings.

**Acceptance criteria:**
- `POST /payment-methods` (requires auth, role: MOTHER)
- Request body: `{ type, token, last4, brand?, expiryMonth?, expiryYear? }`
- `token` is the Paymob tokenized card reference (obtained client-side via Paymob SDK — raw card data never reaches this endpoint)
- If this is the user's first payment method, automatically set `isPrimary = true`
- Returns `201 { data: { paymentMethod } }`
- Validates `type` is one of the PaymentMethodType enum values
- Validates `last4` is exactly 4 digits
- Unit tests cover: first method (auto-primary), additional method (not primary), invalid type

### WALL-13: Set primary payment method
**As a** mother
**I want** to designate one of my saved methods as the primary
**So that** it is pre-selected during checkout.

**Acceptance criteria:**
- `PATCH /payment-methods/:id/primary` (requires auth, role: MOTHER)
- Validates the payment method belongs to the authenticated user; returns `404` if not found or not owned
- Within a Prisma transaction: sets all user's methods to `isPrimary = false`, then sets the target method to `isPrimary = true`
- Returns `200 { data: { paymentMethod } }`
- Unit tests cover: successful switch, method not found, method belongs to another user

### WALL-14: Delete a payment method
**As a** mother
**I want** to remove a saved payment method
**So that** I can manage my stored cards.

**Acceptance criteria:**
- `DELETE /payment-methods/:id` (requires auth, role: MOTHER)
- Soft-deletes: sets `isActive = false` (preserves record for transaction history)
- Validates ownership; returns `404` if not found or not owned
- If the deleted method was primary and other active methods exist, auto-promote the most recently added active method to primary
- Returns `200 { data: { message: "Payment method removed" } }`
- Unit tests cover: delete non-primary, delete primary (auto-promote), delete only method, method not found

---

## Nanny Earnings Stories

### WALL-15: View nanny earnings summary
**As a** nanny
**I want** to see my earnings for this week, this month, and all-time
**So that** I can track my income.

**Acceptance criteria:**
- `GET /earnings` (requires auth, role: NANNY)
- Returns `200 { data: { thisWeek, thisMonth, allTime, currency } }`
- Earnings computed from completed bookings where `nannyId` matches the authenticated user
- `thisWeek` = sum of earnings from Monday 00:00 UTC to now
- `thisMonth` = sum of earnings from 1st of current month to now
- `allTime` = sum of all earnings
- Unit tests cover: nanny with earnings across periods, nanny with no earnings

### WALL-16: View nanny payout history
**As a** nanny
**I want** to see my payout history
**So that** I can confirm I have been paid correctly.

**Acceptance criteria:**
- `GET /earnings/payouts` (requires auth, role: NANNY)
- Query params: `page` (default 1), `limit` (default 20, max 50)
- Returns `200 { data: payouts[], meta: { page, limit, total, totalPages } }`
- Each payout includes: id, amount, currency, status (PENDING, COMPLETED, FAILED), paidAt, bookingId, bookingDate
- Sorted by paidAt descending
- Unit tests cover: paginated payouts, empty history, mixed statuses

---

## Review Stories

### WALL-17: Submit a review for a completed booking
**As a** mother
**I want** to rate and review a nanny after a completed booking
**So that** other mothers can make informed decisions.

**Acceptance criteria:**
- `POST /reviews` (requires auth, role: MOTHER)
- Request body validated with Zod: `{ bookingId, rating (1-5 integer), text (1-1000 chars) }`
- Server-side validations:
  - Booking must exist and belong to the authenticated user; returns `404` otherwise
  - Booking must have status COMPLETED; returns `400 { error: "Review can only be submitted for completed bookings" }`
  - Review must be submitted within 7 days of booking completion (per PRD Table 19); returns `400 { error: "Review submission window has closed" }`
  - One review per booking (unique constraint on `bookingId`); returns `409 { error: "A review has already been submitted for this booking" }`
- Sets `reviewerId` to authenticated user, `nannyId` from the booking record
- After creation, triggers average rating recalculation on the nanny profile (see WALL-19)
- Returns `201 { data: { review } }`
- Awards loyalty points (+20) to the reviewer (see WALL-09)
- Unit tests cover: happy path, booking not found, booking not completed, review window expired, duplicate review, rating out of range

### WALL-18: List reviews for a nanny
**As a** mother
**I want** to read reviews for a nanny
**So that** I can evaluate the nanny's reputation before booking.

**Acceptance criteria:**
- `GET /nannies/:nannyId/reviews` (requires auth)
- Query params: `page` (default 1), `limit` (default 10, max 50)
- Returns `200 { data: reviews[], meta: { page, limit, total, totalPages, averageRating } }`
- Each review includes: id, rating, text, createdAt, reviewer (firstName, lastName, avatarUrl), bookingType (e.g., "Full Day", "Half Day")
- Sorted by `createdAt` descending (most recent first) per PRD FR-02-04
- Unit tests cover: paginated reviews, empty reviews, averageRating calculation in meta

### WALL-19: Recalculate nanny average rating
**As a** system
**I want** the nanny's average rating to be recalculated whenever a new review is submitted
**So that** the displayed rating is always accurate.

**Acceptance criteria:**
- Internal service function (not an API endpoint — called by review creation in WALL-17)
- Computes average of all review ratings for the nanny: `AVG(rating)` rounded to 1 decimal place
- Updates the `NannyProfile.averageRating` and `NannyProfile.totalReviews` fields
- Uses a single Prisma aggregation query for efficiency
- Unit tests cover: first review (rating = review rating), multiple reviews (correct average), decimal rounding

### WALL-20: "My Nannies" list
**As a** mother
**I want** to see a list of nannies I have previously booked
**So that** I can quickly re-book a trusted nanny.

**Acceptance criteria:**
- `GET /my-nannies` (requires auth, role: MOTHER)
- Returns nannies with whom the mother has at least 1 completed booking
- Each entry includes: nannyId, firstName, lastName, avatarUrl, averageRating, totalReviews, lastBookingDate, totalBookings (with this mother)
- Sorted by lastBookingDate descending (most recently booked first)
- Returns `200 { data: nannies[] }`
- Unit tests cover: mother with multiple nannies, mother with no completed bookings (empty array)

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `GET` | `/wallet` | Yes | MOTHER | WALL-05 |
| `GET` | `/wallet/transactions` | Yes | MOTHER | WALL-06 |
| `POST` | `/wallet/debit` | Yes | MOTHER (internal) | WALL-07 |
| `POST` | `/wallet/credit` | Yes | ADMIN | WALL-08 |
| `POST` | `/wallet/redeem-points` | Yes | MOTHER | WALL-10 |
| `GET` | `/payment-methods` | Yes | MOTHER | WALL-11 |
| `POST` | `/payment-methods` | Yes | MOTHER | WALL-12 |
| `PATCH` | `/payment-methods/:id/primary` | Yes | MOTHER | WALL-13 |
| `DELETE` | `/payment-methods/:id` | Yes | MOTHER | WALL-14 |
| `GET` | `/earnings` | Yes | NANNY | WALL-15 |
| `GET` | `/earnings/payouts` | Yes | NANNY | WALL-16 |
| `POST` | `/reviews` | Yes | MOTHER | WALL-17 |
| `GET` | `/nannies/:nannyId/reviews` | Yes | any | WALL-18 |
| `GET` | `/my-nannies` | Yes | MOTHER | WALL-20 |

---

## Implementation Order

```
WALL-01  Wallet model
    |
WALL-02  WalletTransaction model
    |
WALL-03  PaymentMethod model
    |
WALL-04  Review model
    |____________________________________
    |                                    |
WALL-05  Display balance                WALL-11  List payment methods
    |                                    |
WALL-06  Transaction history            WALL-12  Add payment method
    |                                    |
WALL-07  Debit wallet (checkout)        WALL-13  Set primary method
    |                                    |
WALL-08  Credit wallet (promo/refund)   WALL-14  Delete method
    |
WALL-09  Earn loyalty points
    |
WALL-10  Redeem points
    |
WALL-15  Nanny earnings summary
    |
WALL-16  Nanny payout history
    |
WALL-17  Submit review ──── WALL-19  Recalculate average rating
    |
WALL-18  List nanny reviews
    |
WALL-20  "My Nannies" list
```

---

## Non-Functional Requirements (from PRD Table 18 & Table 19)

| Requirement | Target |
|---|---|
| Payment data handling | PCI-DSS Level 1 compliant via Paymob; raw card data never on NannyMom servers |
| Wallet balance updates | Atomic (Prisma transactions); no negative balances |
| Review submission window | 7 days post-booking completion (configurable via Table 19) |
| One review per booking | Enforced at DB level (unique constraint on bookingId) |
| Service fee | 6% of subtotal (configurable per market) |
| Loyalty points exchange rate | 100 points = 10.00 EGP (configurable via env var) |
| General API rate limit | 100 req / 15 min per user |
| Transaction history pagination | Max 50 per page |
| All API traffic | HTTPS/TLS 1.3 minimum |
