# Promo Code Application — Design

**Date:** 2026-07-12
**Status:** Approved (pending spec review)

## Problem

The admin dashboard has full CRUD for promo codes, and the DB schema already
includes `PromoCode` and `PromoCodeRedemption` tables. But the promo-code logic
is **not applied** anywhere in the booking/payment flow:

- `promo-code.service.ts` only creates/lists/updates/soft-deletes codes. There
  is no validate/redeem function, and `usageCount` is never incremented.
- `calculatePriceBreakdown` accepts a `discountAmount` (default `0`) but every
  caller in `booking.service.ts` omits it, so the discount is always `0`.
- `CreateBookingSchema` has no `promoCode` field, so a code can't reach the API.
- The mobile `BookingStep1Screen` "promo" UI is a hardcoded client-side fake:
  it matches the typed code against constants (`PROMO_CODE_VALUE = FIRST20`,
  `PROMO_DISCOUNT_PERCENT = 20%`) and shows a cosmetic discount. The booking is
  still created at full price.

## Goal

Wire the existing promo-code admin CRUD into the real booking flow so a code
entered by a parent produces a validated, server-computed discount that is
frozen onto the booking's `totalAmount` at creation (and thus flows to payment
untouched), while the code is consumed (usage recorded) at creation. Remove the
hardcoded client-side fake. The payment layer, including paymob, is not
modified.

## Scope

- **In scope:** standard bookings (price known at creation time).
- **Out of scope (v1):** emergency bookings (created at price 0, priced later
  when a nanny claims them). They ignore promo codes entirely.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| When a code is "used" | At booking creation | The payment layer (paymob) must not be touched. Consuming at creation keeps all promo logic in `booking.service.ts`. Trade-off: a code is consumed even if the booking is later rejected or never paid — accepted for v1. |
| Discount reaches payment | Via frozen `Booking.totalAmount` | The discount is baked into `totalAmount` at creation. Paymob already charges `booking.totalAmount`, so the discount flows to the real payment with **zero paymob changes**. |
| Redemption tracking | Existing `PromoCodeRedemption` table (no new column) | The table already exists and is migrated. It ties code↔user↔booking and gives per-user enforcement/history. Written at booking creation. No `Booking` schema change or migration needed. |
| Apply UX | Validate/preview endpoint + authoritative re-check on submit | Parent sees the real discount before submitting; backend is the single source of truth and re-validates on booking creation. |
| Discount computation | In `promo-code.service.validatePromoCode`; rounding stays in `pricing.service` | Keeps validation in the service layer; leaves the pure pricing function untouched. |

## Data Model

**No schema change / no migration.** Everything below already exists:

- `PromoCode` — `code`, `discountType` (`FLAT` | `PERCENTAGE`), `value`,
  `maxUsage?`, `maxUsagePerUser?`, `usageCount`, `isActive`, `expiresAt`,
  soft-delete columns.
- `PromoCodeRedemption` — `promoCodeId`, `userId`, `bookingId?`, timestamps.
  Migrated in `20260708120000_add_promo_codes`. This is the consumption record,
  written at booking creation; it ties code↔user↔booking.
- `Booking.discountAmount` (`Decimal(10,2)`, default `0`) — frozen discount
  applied at creation; already flows into `totalAmount`.
- `calculatePriceBreakdown({ baseRate, durationHours, discountAmount?, serviceFeePercent })`.

We deliberately do **not** add `Booking.promoCodeId`: because consumption
happens at creation, the `PromoCodeRedemption.bookingId` link already records
which code a booking used, so a dedicated column would be redundant.

## New Service Logic

`promo-code.service.ts` gains one function:

```
validatePromoCode(code: string, subtotal: number, userId: string)
  → { promoCodeId: string; discountAmount: number }
  → throws AppError (badRequest / notFound) when invalid
```

Validation order:

1. Code exists and is not soft-deleted (`deletedAt: null`) — else `notFound`.
2. `isActive` is true — else `badRequest`.
3. Not expired: `expiresAt` is null or in the future — else `badRequest`.
4. If `maxUsage` set: `usageCount < maxUsage` — else `badRequest` (fully redeemed).
5. If `maxUsagePerUser` set: the user's `PromoCodeRedemption` count for this code
   (`deletedAt: null`) is `< maxUsagePerUser` — else `badRequest`.

Discount computation:

- `FLAT` → `value`
- `PERCENTAGE` → `subtotal * value / 100`
- Cap at `subtotal` (never negative total). Final rounding is handled by
  `calculatePriceBreakdown` (which already caps `discountAmount` at `subtotal`);
  `validatePromoCode` may return an unrounded/soft-capped number.

And a second function to record consumption inside the caller's transaction:

```
redeemPromoCode(tx, { promoCodeId, userId, bookingId }) → Promise<void>
```

where `tx` is a Prisma transaction client. It (a) increments
`PromoCode.usageCount` by 1 and (b) inserts a `PromoCodeRedemption` row
(`promoCodeId`, `userId`, `bookingId`). Called only from `createBooking` when a
valid code was applied. Kept separate from `validatePromoCode` so validation
(read-only, also used by the preview endpoint) never writes.

## Booking Creation (discount + consumption)

**Paymob is not touched.** The discount is frozen into `Booking.totalAmount` at
creation and paymob charges `totalAmount` unchanged.

**`CreateBookingSchema`** (`packages/shared/src/booking.ts`): add
`promoCode: z.string().trim().min(1).optional()`.

**`createBooking`** (standard path only, `booking.service.ts` ~line 363):

- Compute `subtotal = baseRate * durationHours` (same inputs already used).
- If `body.promoCode` present → `validatePromoCode(code, subtotal, user.id)` to
  get `{ promoCodeId, discountAmount }`; pass `discountAmount` into
  `calculatePriceBreakdown`.
- If absent → discount `0` (current behavior).
- The booking write becomes a `$transaction`: create the booking (with the
  discounted breakdown), and — when a code was applied — call
  `redeemPromoCode(tx, { promoCodeId, userId: user.id, bookingId: booking.id })`
  in the same transaction so the booking, `usageCount`, and redemption row are
  atomic. When no code is applied, keep the current single `create` (no
  transaction needed).
- Invalid code throws → the create request fails with the validation message.
  The parent has already seen the code validated via the preview endpoint, so
  this is the safety net, not the primary UX.
- Emergency bookings (`createEmergencyBooking`) are unchanged and ignore promo
  codes.

**Payment layer unchanged.** `mockPayBooking`, `finalizePaymentCaptured`, and
the rest of `paymob.service.ts` are not modified — they already charge the
frozen `totalAmount`.

**Retry/duplicate safety:** `createBooking` already returns the existing PENDING
booking on a checkout retry (the early-return at ~line 350) instead of creating
a new one, so a retry does not consume the code twice. A code is applied and
consumed only on the first creation of a given pending booking; retries reuse
that booking as-is.

**Accepted trade-off:** because consumption is at creation, a code counts as
used even if the booking is later rejected by an admin or never paid. This is
accepted for v1 (documented in Out of Scope for possible future refinement).

## Validate / Preview Endpoint + Mobile

**New route:** `POST /promo-codes/validate` (authenticated, role `MOTHER`).

- Request body: `{ code: string, subtotal: number }` (new Zod schema in
  `packages/shared`).
- Response: `{ discountAmount: number }` on success, or a 4xx `ApiResponse`
  error with a human-readable message.
- Backed by `validatePromoCode`. Note: this is a preview and does **not**
  consume the code or write a redemption.

**Mobile `BookingStep1Screen`:**

- Remove the `SHOW_PROMO_CODE`, `PROMO_CODE_VALUE`, `PROMO_DISCOUNT_PERCENT`
  constants and the local `handleApplyPromo` string match.
- On "Apply" → call `POST /promo-codes/validate` with the current `subtotal`;
  on success store the returned `discountAmount` and applied code; on error show
  the returned message.
- The summary's promo line renders the server-provided `discountAmount`.
- On booking submit → include `promoCode` in the create-booking request.
- Remove the hardcoded `"FIRST20 — 20% off"` chip text; show the applied code
  and its actual discount.

## Testing

- `validatePromoCode` unit tests: each rejection path (not found, inactive,
  expired, `maxUsage` reached, `maxUsagePerUser` reached) and both discount
  types plus the subtotal cap.
- `createBooking`: applies discount with a valid code AND writes the redemption
  (`usageCount` incremented + `PromoCodeRedemption` created) atomically; zero
  discount and no redemption without a code; rejects an invalid code and writes
  nothing; emergency booking ignores the code; retry (existing PENDING booking)
  does not double-consume.
- `POST /promo-codes/validate`: returns discount for a valid code; returns 4xx
  for invalid; does not write a redemption.
- Payment services (`mockPayBooking`, `paymob.service.ts`) are untouched, so
  their existing tests must still pass unchanged.
- Coverage stays ≥ 80% (CI threshold).

## Out of Scope / Future

- Promo codes on emergency bookings.
- Releasing a consumed code when its booking is rejected/cancelled/unpaid
  (consumption is at creation for v1).
- Min-order thresholds, first-booking-only rules, code stacking.
- Admin visibility into redemption history in the dashboard.
