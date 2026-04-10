# Epic 3: Booking Flow

## Context

NannyMom's booking flow is the core transactional experience: a mother selects a nanny, chooses a date/time, applies an optional promo code, pays, and receives a confirmed booking. The flow is exactly 3 steps (review, payment, confirmation). Payments are processed via Paymob (Egyptian market) using a 3-step integration (auth token, order registration, payment key). Bookings follow a strict status lifecycle managed server-side. The platform charges a configurable service fee (default 6%) on the subtotal.

**PRD references:** Section 6.3 (Booking Flow), Table 9 (FR-03-*), Table 19 (Config — service fee 6%, emergency SLA 30 min), Table 21 (Notifications)
**Architecture references:** Backend CLAUDE.md (services layer), Paymob integration, SQS + Lambda for async notifications

---

## Prerequisites (Prisma Models)

### BOOK-01: Prisma schema — Booking model
**As a** developer
**I want** the Prisma schema to define the `Booking` model with a status lifecycle enum
**So that** the booking flow has a persistent data layer with clear state transitions.

**Acceptance criteria:**
- Enum `BookingStatus { PENDING CONFIRMED IN_PROGRESS COMPLETED CANCELLED REFUNDED }`
- Enum `BookingType { STANDARD EMERGENCY }`
- `Booking` model with fields: `id` (UUID), `motherId` (FK to `User`), `nannyProfileId` (FK to `NannyProfile`), `status` (BookingStatus, default PENDING), `type` (BookingType, default STANDARD), `date` (DateTime — booking date), `startTime` (DateTime), `endTime` (DateTime), `durationHours` (Decimal — computed), `baseRate` (Decimal — nanny's hourly rate at time of booking), `subtotal` (Decimal — baseRate * durationHours), `discountAmount` (Decimal, default 0), `serviceFeePercent` (Decimal, default 6), `serviceFeeAmount` (Decimal), `totalAmount` (Decimal), `promoCodeId` (FK to `PromoCode`, nullable), `cancellationReason` (String, nullable), `cancelledBy` (FK to `User`, nullable), `cancelledAt` (DateTime, nullable), `nannyCheckedInAt` (DateTime, nullable), `nannyCheckedOutAt` (DateTime, nullable), `replacementForBookingId` (FK to `Booking`, nullable — for reliability guarantee), `createdAt`, `updatedAt`
- Relations: `Booking` belongs to `User` (mother), `NannyProfile`, optionally `PromoCode`
- Indexes: on `motherId`, `nannyProfileId`, `status`, `date`
- Migration generated and applied

### BOOK-02: Prisma schema — PromoCode model
**As a** developer
**I want** the Prisma schema to define the `PromoCode` model
**So that** promotional discounts can be validated and applied to bookings.

**Acceptance criteria:**
- Enum `PromoCodeType { PERCENTAGE FIXED_AMOUNT }`
- `PromoCode` model with fields: `id` (UUID), `code` (String, unique, uppercase), `type` (PromoCodeType), `value` (Decimal — percentage or fixed amount), `minBookingAmount` (Decimal, nullable — minimum subtotal to apply), `maxDiscountAmount` (Decimal, nullable — cap for percentage discounts), `maxUses` (Int, nullable — total uses allowed, Table 19), `currentUses` (Int, default 0), `maxUsesPerUser` (Int, default 1), `validFrom` (DateTime), `validUntil` (DateTime), `isActive` (Boolean, default true), `createdAt`, `updatedAt`
- Migration generated and applied

### BOOK-03: Prisma schema — Payment model
**As a** developer
**I want** the Prisma schema to define the `Payment` model
**So that** payment transactions are tracked separately from bookings.

**Acceptance criteria:**
- Enum `PaymentStatus { PENDING AUTHORIZED CAPTURED FAILED REFUNDED }`
- Enum `PaymentMethod { CARD APPLE_PAY GOOGLE_PAY WALLET }`
- `Payment` model with fields: `id` (UUID), `bookingId` (FK to `Booking`, unique — one payment per booking), `motherId` (FK to `User`), `amount` (Decimal), `currency` (String, default "EGP"), `method` (PaymentMethod), `status` (PaymentStatus, default PENDING), `paymobOrderId` (String, nullable), `paymobTransactionId` (String, nullable), `paymobPaymentKey` (String, nullable), `failureReason` (String, nullable), `refundedAmount` (Decimal, default 0), `refundedAt` (DateTime, nullable), `createdAt`, `updatedAt`
- Relation: `Payment` belongs to `Booking` (one-to-one) and `User` (mother)
- Index on `paymobOrderId`, `paymobTransactionId`
- Migration generated and applied

### BOOK-04: Shared Zod schemas — Booking module
**As a** developer
**I want** Zod schemas for booking requests and responses in `packages/shared`
**So that** validation and types are shared between backend and mobile.

**Acceptance criteria:**
- `packages/shared/src/booking.ts` exports:
  - `CreateBookingSchema` — `{ nannyProfileId (UUID), date (ISO date), startTime (ISO datetime), endTime (ISO datetime), promoCode? (string) }`
  - `BookingResponseSchema` — full booking response shape including nanny summary, price breakdown, status
  - `BookingStatusEnum` — Zod enum matching Prisma `BookingStatus`
  - `PriceBreakdownSchema` — `{ baseRate, durationHours, subtotal, discountAmount, serviceFeePercent, serviceFeeAmount, totalAmount }`
  - `ValidatePromoCodeSchema` — `{ code (string), subtotal (number) }`
  - `PromoCodeResponseSchema` — `{ code, type, value, discountAmount, isValid, message? }`
  - `CancelBookingSchema` — `{ reason (string) }`
  - `BookingListQuerySchema` — `{ status?, page?, limit?, sortBy? ("date" | "createdAt") }`
  - `PaymentIntentSchema` — `{ bookingId (UUID), method (PaymentMethod) }`
- All types inferred with `z.infer<>` and re-exported
- Barrel export from `packages/shared/src/index.ts`
- `pnpm build --filter=@nanny-app/shared` succeeds

---

## Booking Creation Stories

### BOOK-05: Create a booking
**As a** mother
**I want** to create a booking with a selected nanny for a specific date and time
**So that** I can reserve the nanny's services.

**Acceptance criteria:**
- `POST /bookings` (requires auth, role: MOTHER)
- Request body validated with `CreateBookingSchema`
- Validates: nanny exists, nanny is active and available, time slot does not conflict with nanny's existing bookings, date is not in nanny's blocked dates, time falls within nanny's weekly availability
- Computes `durationHours` from `startTime` and `endTime` (minimum 1 hour, maximum 12 hours)
- Snapshots the nanny's current `hourlyRate` as `baseRate` (rate locked at booking time)
- Computes price breakdown: `subtotal = baseRate * durationHours`
- If `promoCode` provided, validates and applies (see BOOK-06)
- Computes `serviceFeeAmount = (subtotal - discountAmount) * serviceFeePercent / 100`
- Computes `totalAmount = subtotal - discountAmount + serviceFeeAmount`
- Creates `Booking` with status `PENDING`
- Returns `201 { data: { booking, priceBreakdown } }`
- Returns `400` for: invalid time range, booking in the past, duration too short/long
- Returns `404` for: nanny not found
- Returns `409` for: time slot conflict with existing booking
- Unit tests cover: happy path, with promo code, time conflict, nanny unavailable, past date, min/max duration

### BOOK-06: Validate and apply promo code
**As a** mother
**I want** to enter a promotional code during booking and see the discount applied in real time
**So that** I can save money on my booking.

**Acceptance criteria:**
- `POST /bookings/validate-promo` (requires auth, role: MOTHER)
- Request body validated with `ValidatePromoCodeSchema`: `{ code, subtotal }`
- Server-side validation (FR-03-03):
  - Code exists and `isActive = true`
  - Current date is between `validFrom` and `validUntil`
  - `currentUses < maxUses` (if maxUses is set)
  - User has not exceeded `maxUsesPerUser` for this code
  - `subtotal >= minBookingAmount` (if set)
- Computes `discountAmount`:
  - PERCENTAGE: `subtotal * value / 100`, capped at `maxDiscountAmount` if set
  - FIXED_AMOUNT: `value`, capped at `subtotal` (discount cannot exceed subtotal)
- Returns `200 { data: { code, type, value, discountAmount, isValid: true } }`
- Invalid code returns `200 { data: { code, isValid: false, message: "reason" } }` (not 4xx — UX decision: inline error, not HTTP error)
- Unit tests cover: valid percentage code, valid fixed code, expired code, max uses reached, per-user limit, min booking amount not met, discount cap applied

### BOOK-07: Price calculation service
**As a** backend service
**I want** a centralized price calculation function
**So that** price breakdowns are computed consistently across booking creation, promo validation, and booking updates.

**Acceptance criteria:**
- `src/services/pricing.service.ts` exports `calculatePriceBreakdown({ baseRate, durationHours, discountAmount?, serviceFeePercent? })`
- Returns `PriceBreakdown`: `{ baseRate, durationHours, subtotal, discountAmount, serviceFeePercent, serviceFeeAmount, totalAmount }`
- All monetary values rounded to 2 decimal places
- `serviceFeePercent` defaults to config value (6%, from `config.ts`)
- `discountAmount` defaults to 0
- `totalAmount` is never negative (floor at 0)
- Pure function with no side effects — easy to unit test
- Unit tests cover: basic calculation, with discount, discount exceeds subtotal (floor at 0), custom service fee, rounding edge cases

---

## Payment Stories

### BOOK-08: Initiate payment via Paymob
**As a** mother
**I want** to pay for my booking securely via Paymob
**So that** my booking is confirmed and the nanny is notified.

**Acceptance criteria:**
- `POST /bookings/:id/pay` (requires auth, role: MOTHER)
- Request body validated with `PaymentIntentSchema`: `{ method }`
- Booking must be in `PENDING` status and belong to the authenticated mother
- Paymob 3-step integration:
  1. **Auth token**: `POST https://accept.paymob.com/api/auth/tokens` with API key -> returns `token`
  2. **Order registration**: `POST https://accept.paymob.com/api/ecommerce/orders` with `token`, `amount_cents`, `currency`, `merchant_order_id` (booking ID) -> returns `orderId`
  3. **Payment key**: `POST https://accept.paymob.com/api/acceptance/payment_keys` with `token`, `orderId`, `amount_cents`, `currency`, `integration_id`, billing data -> returns `payment_key`
- Creates `Payment` record with status `PENDING`, stores `paymobOrderId`
- Returns `200 { data: { paymentKey, orderId } }` — mobile uses `paymentKey` to render Paymob payment form
- Returns `400` if booking is not in PENDING status
- Returns `403` if booking does not belong to the authenticated user
- Unit tests cover: happy path, booking not PENDING, not owner, Paymob auth failure (mocked)

### BOOK-09: Paymob webhook handler
**As a** backend service
**I want** to receive and process Paymob payment webhooks
**So that** booking status is updated based on payment outcome.

**Acceptance criteria:**
- `POST /webhooks/paymob` (no auth — webhook, but HMAC verified)
- Verifies HMAC-SHA512 signature using Paymob HMAC secret:
  - Concatenates specific fields from the callback in Paymob's documented order
  - Computes `HMAC-SHA512(concatenated_string, hmac_secret)`
  - Compares with the `hmac` field in the request
- On `success = true` and `is_captured = true`:
  - Updates `Payment.status` to `CAPTURED`, stores `paymobTransactionId`
  - Updates `Booking.status` to `CONFIRMED`
  - Enqueues push notification to mother and nanny via SQS (FR-03-07, Table 21)
  - Increments `PromoCode.currentUses` if a promo code was used
- On `success = false`:
  - Updates `Payment.status` to `FAILED`, stores `failureReason`
  - Booking remains `PENDING`
- Returns `200` to Paymob (acknowledge receipt)
- Invalid HMAC returns `403`
- Unit tests cover: successful payment, failed payment, invalid HMAC, duplicate webhook (idempotent), missing booking

### BOOK-10: Payment via wallet balance
**As a** mother
**I want** to pay for a booking using my in-app wallet balance
**So that** I can use credits and refunds without re-entering payment details.

**Acceptance criteria:**
- When `method = WALLET` in BOOK-08:
  - Checks mother's wallet balance >= `totalAmount`
  - Deducts `totalAmount` from wallet balance (atomic transaction)
  - Creates `Payment` with status `CAPTURED` and method `WALLET` (no Paymob flow)
  - Updates `Booking.status` to `CONFIRMED`
  - Enqueues push notifications
- Insufficient balance returns `400 { data: null, error: "Insufficient wallet balance" }`
- Unit tests cover: full wallet payment, insufficient balance, partial wallet (not supported in v1 — error if balance < total)

---

## Booking Lifecycle Stories

### BOOK-11: Booking status lifecycle enforcement
**As a** backend service
**I want** strict status transition rules enforced at the service layer
**So that** bookings never enter invalid states.

**Acceptance criteria:**
- `src/services/booking.service.ts` exports `validateStatusTransition(currentStatus, newStatus)` — throws `AppError(400)` on invalid transition
- Valid transitions:
  - `PENDING -> CONFIRMED` (payment captured)
  - `PENDING -> CANCELLED` (mother or nanny cancels before payment)
  - `CONFIRMED -> IN_PROGRESS` (nanny checks in)
  - `CONFIRMED -> CANCELLED` (cancellation with refund rules)
  - `IN_PROGRESS -> COMPLETED` (nanny checks out)
  - `COMPLETED -> REFUNDED` (admin-initiated refund)
  - `CANCELLED -> REFUNDED` (admin-initiated refund for cancellation)
- All other transitions are rejected
- Every status change logs an audit entry (timestamp, previousStatus, newStatus, changedBy)
- Unit tests cover: every valid transition, every invalid transition (e.g., COMPLETED -> IN_PROGRESS)

### BOOK-12: Booking cancellation
**As a** mother or nanny
**I want** to cancel a booking
**So that** I can change my plans (subject to cancellation rules).

**Acceptance criteria:**
- `POST /bookings/:id/cancel` (requires auth, role: MOTHER or NANNY)
- Request body validated with `CancelBookingSchema`: `{ reason }`
- Cancellation rules:
  - Mother cancels > 24 hours before `startTime`: full refund
  - Mother cancels <= 24 hours before `startTime`: 50% refund (configurable)
  - Nanny cancels at any time: full refund to mother + triggers reliability guarantee (BOOK-17)
  - Cannot cancel bookings in `IN_PROGRESS`, `COMPLETED`, or already `CANCELLED` status
- Updates `Booking.status` to `CANCELLED`, sets `cancellationReason`, `cancelledBy`, `cancelledAt`
- Processes refund: updates `Payment.status`, credits mother's wallet
- Enqueues push notifications to both parties (Table 21)
- Returns `200 { data: { booking, refundAmount } }`
- Returns `400` for invalid status transition
- Unit tests cover: mother cancel > 24hr (full refund), mother cancel <= 24hr (partial refund), nanny cancel (full refund + replacement trigger), invalid status

### BOOK-13: Nanny check-in
**As a** nanny
**I want** to check in when I arrive for a booking
**So that** the mother is notified that care has started.

**Acceptance criteria:**
- `POST /bookings/:id/check-in` (requires auth, role: NANNY)
- Booking must be `CONFIRMED` and belong to the authenticated nanny
- Check-in allowed within a 15-minute window before `startTime` (configurable)
- Updates `Booking.status` to `IN_PROGRESS`, sets `nannyCheckedInAt`
- Enqueues push notification to mother: "Your nanny has arrived!" (Table 21)
- Returns `200 { data: { booking } }`
- Returns `400` if too early, wrong status, or already checked in
- Unit tests cover: happy path, too early, wrong status, not assigned nanny

### BOOK-14: Nanny check-out
**As a** nanny
**I want** to check out when a booking ends
**So that** the booking is marked complete and the mother can leave a review.

**Acceptance criteria:**
- `POST /bookings/:id/check-out` (requires auth, role: NANNY)
- Booking must be `IN_PROGRESS` and belong to the authenticated nanny
- Updates `Booking.status` to `COMPLETED`, sets `nannyCheckedOutAt`
- Recomputes `durationHours` based on actual check-in/check-out times (if different from booked times)
- Enqueues push notification to mother: "Booking complete! Leave a review?"
- Triggers review submission window (7-day window per Table 19)
- Returns `200 { data: { booking } }`
- Returns `400` if not checked in, wrong status
- Unit tests cover: happy path, not checked in, not assigned nanny

---

## Booking History & Rebooking Stories

### BOOK-15: List booking history
**As a** mother or nanny
**I want** to view my booking history with filters
**So that** I can track past and upcoming bookings.

**Acceptance criteria:**
- `GET /bookings` (requires auth, role: MOTHER or NANNY)
- Query params validated with `BookingListQuerySchema`: `{ status?, page?, limit?, sortBy? }`
- Returns bookings for the authenticated user (mother sees her bookings, nanny sees assigned bookings)
- Each booking includes: nanny/mother summary, date, time, status, total amount
- Filterable by status (e.g., `?status=COMPLETED`, `?status=CONFIRMED,IN_PROGRESS`)
- Sortable by `date` (default, desc) or `createdAt`
- Paginated: `page` (default 1), `limit` (default 20, max 50)
- Returns `200 { data: { bookings }, meta: { page, limit, total, totalPages } }`
- Unit tests cover: mother's bookings, nanny's bookings, filter by status, pagination, sort order

### BOOK-16: Rebook from past booking
**As a** mother
**I want** to quickly rebook a nanny from a past booking
**So that** I can save time when rebooking a trusted nanny.

**Acceptance criteria:**
- `POST /bookings/:id/rebook` (requires auth, role: MOTHER)
- Request body: `{ date (ISO date), startTime (ISO datetime), endTime (ISO datetime), promoCode? }`
- Source booking must belong to the authenticated mother and be `COMPLETED`
- Creates a new booking with the same nanny, using current hourly rate (not the historical rate)
- Validates nanny availability for the new date/time (same rules as BOOK-05)
- Returns `201 { data: { booking, priceBreakdown } }`
- Returns `400` if source booking is not COMPLETED
- Returns `409` if nanny is unavailable for the requested slot
- Unit tests cover: happy path, nanny rate changed, nanny unavailable, source booking not completed

---

## Emergency & Reliability Stories

### BOOK-17: Reliability guarantee — auto-replacement
**As a** mother
**I want** the platform to automatically find a replacement nanny if my booked nanny cancels within 24 hours
**So that** I am not left without childcare (FR-03-08).

**Acceptance criteria:**
- Triggered automatically when a nanny cancels a `CONFIRMED` booking within 24 hours of `startTime`
- System searches for available nannies using the same criteria as the original booking (location, date, time, age group)
- Searches within an expanded radius (original radius + 2 miles) and relaxed rating filter (original minRating - 0.5)
- If a match is found:
  - Creates a new `Booking` linked to the original via `replacementForBookingId`
  - New booking inherits the same price (mother pays the same amount)
  - Nanny receives the booking at their own rate (platform absorbs the difference if higher)
  - Push notification to mother: "We found a replacement nanny!"
- If no match is found within 30 minutes (Emergency SLA, Table 19):
  - Full refund to mother's wallet
  - Push notification: "We couldn't find a replacement. A full refund has been issued."
- Runs as an async job (SQS + Lambda)
- Unit tests cover: replacement found, no replacement (refund), expanded search criteria

### BOOK-18: Emergency booking request
**As a** mother
**I want** to request an emergency nanny booking with elevated priority
**So that** I can find childcare urgently.

**Acceptance criteria:**
- `POST /bookings/emergency` (requires auth, role: MOTHER)
- Request body: `{ latitude, longitude, date (today), startTime, endTime, ageGroup? }`
- Creates a booking with `type = EMERGENCY`
- Searches for available nannies within 10-mile radius (expanded from default 5), sorted by distance (closest first)
- Sends push notifications to the top 5 nearest available nannies simultaneously
- First nanny to accept gets the booking (race condition handled with DB-level locking)
- If no nanny accepts within 15 minutes, expands search and re-notifies
- Target: match within 30 minutes (Table 19 Emergency SLA)
- Returns `201 { data: { booking, status: "SEARCHING" } }`
- Nanny acceptance endpoint: `POST /bookings/:id/accept` (requires auth, role: NANNY)
- Unit tests cover: emergency created, nanny accepts, no nanny available, concurrent acceptance (only first wins)

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `POST` | `/bookings` | Yes | MOTHER | BOOK-05 |
| `POST` | `/bookings/validate-promo` | Yes | MOTHER | BOOK-06 |
| `POST` | `/bookings/emergency` | Yes | MOTHER | BOOK-18 |
| `GET` | `/bookings` | Yes | MOTHER, NANNY | BOOK-15 |
| `GET` | `/bookings/:id` | Yes | MOTHER, NANNY | BOOK-15 |
| `POST` | `/bookings/:id/pay` | Yes | MOTHER | BOOK-08, BOOK-10 |
| `POST` | `/bookings/:id/cancel` | Yes | MOTHER, NANNY | BOOK-12 |
| `POST` | `/bookings/:id/check-in` | Yes | NANNY | BOOK-13 |
| `POST` | `/bookings/:id/check-out` | Yes | NANNY | BOOK-14 |
| `POST` | `/bookings/:id/rebook` | Yes | MOTHER | BOOK-16 |
| `POST` | `/bookings/:id/accept` | Yes | NANNY | BOOK-18 |
| `POST` | `/webhooks/paymob` | No* | — | BOOK-09 |

\* Paymob webhook uses HMAC-SHA512 verification instead of JWT auth.

---

## Implementation Order

```
BOOK-01  Prisma — Booking model
    |
BOOK-02  Prisma — PromoCode model
    |
BOOK-03  Prisma — Payment model
    |
BOOK-04  Shared Zod schemas
    |
BOOK-07  Price calculation service (pure function, no deps)
    |
BOOK-11  Status lifecycle enforcement
    |
    ├── BOOK-06  Promo code validation
    |       |
    |   BOOK-05  Create booking (depends on BOOK-06, BOOK-07)
    |       |
    |       ├── BOOK-08  Paymob payment initiation
    |       |       |
    |       |   BOOK-09  Paymob webhook handler
    |       |
    |       ├── BOOK-10  Wallet payment
    |       |
    |       ├── BOOK-12  Cancellation (depends on BOOK-11)
    |       |       |
    |       |   BOOK-17  Reliability guarantee (async)
    |       |
    |       ├── BOOK-13  Nanny check-in
    |       |       |
    |       |   BOOK-14  Nanny check-out
    |       |
    |       └── BOOK-15  Booking history
    |               |
    |           BOOK-16  Rebook
    |
    └── BOOK-18  Emergency booking (depends on BOOK-05, search from Epic 2)
```

---

## Non-Functional Requirements (from PRD Table 18 & Table 19)

| Requirement | Target |
|---|---|
| Booking creation response time | <= 1.5 seconds |
| Payment processing (Paymob round-trip) | <= 5 seconds |
| Webhook processing | Idempotent; at-least-once delivery handled |
| Service fee | 6% of subtotal (configurable per market, Table 19) |
| Emergency booking SLA | Match within 30 minutes (Table 19) |
| Promo code max uses | Configurable per code (Table 19) |
| Review submission window | 7 days post-booking (Table 19) |
| Cancellation refund (>24hr) | 100% |
| Cancellation refund (<=24hr) | 50% (configurable) |
| Payment security | PCI-DSS compliant via Paymob; no raw card data on NannyMom servers (FR-03-09) |
| Booking data retention | 7 years (Table 18) |
| All API traffic | HTTPS/TLS 1.3 minimum |
| API rate limit | 100 req / 15 min per user (general) |
| Concurrent booking prevention | DB-level locking to prevent double-booking same nanny/timeslot |
