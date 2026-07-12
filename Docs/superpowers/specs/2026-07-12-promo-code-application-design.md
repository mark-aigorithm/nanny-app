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

Wire the existing promo-code admin CRUD into the real booking/payment flow so a
code entered by a parent produces a validated, server-computed discount that is
frozen onto the booking at creation and consumed at payment. Remove the
hardcoded client-side fake.

## Scope

- **In scope:** standard bookings (price known at creation time).
- **Out of scope (v1):** emergency bookings (created at price 0, priced later
  when a nanny claims them). They ignore promo codes entirely.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| When a code is "used" | At payment success | A code is only consumed by bookings that are actually paid. Abandoned or admin-rejected bookings don't burn a code. |
| Redemption tracking | Existing `PromoCodeRedemption` table + new `Booking.promoCodeId` | The redemption table already exists and is migrated; it gives per-user history/enforcement. `Booking.promoCodeId` is the frozen link so payment knows which code to consume. The two are complementary. |
| Apply UX | Validate/preview endpoint + authoritative re-check on submit | Parent sees the real discount before submitting; backend is the single source of truth and re-validates on booking creation. |
| Discount computation | In `promo-code.service.validatePromoCode`; rounding stays in `pricing.service` | Keeps validation in the service layer; leaves the pure pricing function untouched. |

## Data Model

Already present (no change):

- `PromoCode` — `code`, `discountType` (`FLAT` | `PERCENTAGE`), `value`,
  `maxUsage?`, `maxUsagePerUser?`, `usageCount`, `isActive`, `expiresAt`,
  soft-delete columns.
- `PromoCodeRedemption` — `promoCodeId`, `userId`, `bookingId?`, timestamps.
  Migrated in `20260708120000_add_promo_codes`.
- `Booking.discountAmount` (`Decimal(10,2)`, default `0`).
- `calculatePriceBreakdown({ baseRate, durationHours, discountAmount?, serviceFeePercent })`.

New change:

- Add `promoCodeId String? @map("promo_code_id")` + relation to `Booking`, and
  the reverse relation on `PromoCode`. New migration: `add_booking_promo_code`.

Meaning of each field on a booking:

- `Booking.discountAmount` — frozen discount amount applied at creation.
- `Booking.promoCodeId` — which code produced it (null when no code used).
- `PromoCodeRedemption` — written at payment success; the consumption record.

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

## Booking Creation & Payment Wiring

**`CreateBookingSchema`** (`packages/shared/src/booking.ts`): add
`promoCode: z.string().trim().min(1).optional()`.

**`createBooking`** (standard path only, `booking.service.ts` ~line 363):

- Compute `subtotal = baseRate * durationHours` (same inputs already used).
- If `body.promoCode` present → `validatePromoCode(code, subtotal, user.id)`;
  pass the returned `discountAmount` into `calculatePriceBreakdown`; persist
  `discountAmount` (from breakdown) and `promoCodeId` on the new booking.
- If absent → discount `0`, `promoCodeId` null (current behavior).
- Invalid code throws → the create request fails with the validation message.
  The parent has already seen the code validated via the preview endpoint, so
  this is the safety net, not the primary UX.
- Emergency bookings (`createEmergencyBooking`) are unchanged and ignore promo
  codes.

**`mockPayBooking`** (`booking.service.ts` ~line 713), inside the existing
`$transaction`, only when `body.succeed`:

- If `booking.promoCodeId` is set:
  - Increment `PromoCode.usageCount` by 1.
  - Insert a `PromoCodeRedemption` row (`promoCodeId`, `userId = motherId`,
    `bookingId`).
- This is the single consumption point. Both writes happen in the same
  transaction as the payment + status change, so `usageCount` and the
  redemption table never drift.

**Edge case — code exhausted after approval:** the booking's frozen
`totalAmount` is always honored at payment. We do **not** re-validate limits or
fail payment if the code hit `maxUsage` between approval and payment. `maxUsage`
is a best-effort cap enforced at validation/creation time. `usageCount` may
therefore slightly exceed `maxUsage` in a race; this is acceptable and
documented.

**Retry safety:** payment retries occur only from `APPROVED` status; a
successful payment moves the booking to `CONFIRMED`. Consumption happens only on
the success transition, so a failed-then-retried payment consumes the code
exactly once.

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
- `createBooking`: applies discount with a valid code; zero discount without a
  code; rejects an invalid code; emergency booking ignores the code.
- `mockPayBooking`: increments `usageCount` and writes a `PromoCodeRedemption`
  on success; writes neither on failure; consumes exactly once across a
  failed-then-successful retry.
- `POST /promo-codes/validate`: returns discount for a valid code; returns 4xx
  for invalid; does not write a redemption.
- Coverage stays ≥ 80% (CI threshold).

## Out of Scope / Future

- Promo codes on emergency bookings.
- Min-order thresholds, first-booking-only rules, code stacking.
- Admin visibility into redemption history in the dashboard.
