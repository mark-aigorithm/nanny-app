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
hardcoded client-side fake.

Four hard requirements govern the money math and visibility:

1. **The nanny is paid her whole rate.** The discount never reduces the nanny's
   earnings. Nanny earnings are already computed from `subtotal`
   (`baseRate × hours`) in `nanny.service.ts` — the discount must never shrink
   `subtotal`; it only reduces the platform's take.
2. **The discount applies to the total *including* the service fee.** The
   service fee is computed on the full `subtotal`, and the discount is then
   subtracted from `subtotal + serviceFeeAmount` (the gross total).
3. **Admins can see which promo code was applied to a booking** (code +
   discount) in the admin dashboard.
4. **Paymob charges the post-discount amount.** Paymob already charges
   `booking.totalAmount` (`paymob.service.ts:225`); we only need `totalAmount`
   to be the discounted figure, which it is. The payment layer is not modified.

## Scope

- **In scope:** standard bookings (price known at creation time).
- **Out of scope (v1):** emergency bookings (created at price 0, priced later
  when a nanny claims them). They ignore promo codes entirely.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| When a code is "used" | At booking creation | The payment layer (paymob) must not be touched. Consuming at creation keeps all promo logic in `booking.service.ts`. Trade-off: a code is consumed even if the booking is later rejected or never paid — accepted for v1. |
| Discount base | Gross total = `subtotal + serviceFeeAmount` | Requirement 2: the discount applies to the total including the service fee. Service fee is computed on the full `subtotal` first, then the discount comes off the gross total. |
| Nanny earnings | Always `subtotal`, untouched | Requirement 1. `subtotal = baseRate × hours` is never reduced by the discount; the discount reduces only the platform's service-fee take. |
| Discount reaches payment | Via frozen `Booking.totalAmount` | Requirement 4: the discount is baked into `totalAmount` at creation. Paymob already charges `booking.totalAmount`, so the discounted amount flows to the real payment with **zero paymob changes**. |
| Admin visibility | Re-add `Booking.promoCodeId` + relation; surface code + discount in admin booking DTO/table | Requirement 3. A dedicated column makes the applied code trivially joinable and displayable per booking (vs. joining redemptions). |
| Redemption tracking | Existing `PromoCodeRedemption` table (per-user limit + history) **and** `Booking.promoCodeId` (display + frozen record) | Both are written atomically at creation. Redemption rows drive the per-user cap and history; `promoCodeId` drives admin display. |
| Apply UX | Validate/preview endpoint + authoritative re-check on submit | Parent sees the real discount before submitting; backend is the single source of truth and re-validates on booking creation. |
| Discount computation | In `promo-code.service.validatePromoCode`; rounding stays in `pricing.service` | Keeps validation in the service layer; leaves the pure pricing function as the single rounding authority. |

## Data Model

Already present (no change):

- `PromoCode` — `code`, `discountType` (`FLAT` | `PERCENTAGE`), `value`,
  `maxUsage?`, `maxUsagePerUser?`, `usageCount`, `isActive`, `expiresAt`,
  soft-delete columns. Has `redemptions PromoCodeRedemption[]`.
- `PromoCodeRedemption` — `promoCodeId`, `userId`, `bookingId?`, timestamps.
  Migrated in `20260708120000_add_promo_codes`. Consumption record written at
  booking creation; drives the per-user cap and history.
- `Booking.discountAmount` (`Decimal(10,2)`, default `0`) — frozen discount
  applied at creation; flows into `totalAmount`.
- `calculatePriceBreakdown({ baseRate, durationHours, discountAmount?, serviceFeePercent })`.

New change (required for admin visibility — Requirement 3):

- Add to `Booking`:
  ```prisma
  promoCodeId String?    @map("promo_code_id")
  promoCode   PromoCode? @relation(fields: [promoCodeId], references: [id])
  ```
  and the reverse relation on `PromoCode`:
  ```prisma
  bookings Booking[]
  ```
  New migration: `add_booking_promo_code`. `promoCodeId` is null unless a code
  was applied; it records which code produced the booking's `discountAmount` and
  is what the admin dashboard joins on.

## Pricing (Requirements 1 & 2)

`calculatePriceBreakdown` is reworked so the **service fee is charged on the full
subtotal** and the **discount is subtracted from the gross total**. This keeps
the nanny's `subtotal` whole and applies the promo to the total including the
service fee.

New computation (rounding to 2 dp via `round2`, unchanged helper):

```
subtotal         = round2(baseRate * durationHours)          // nanny's full earnings — never reduced
serviceFeeAmount = round2(subtotal * serviceFeePercent / 100) // fee on the FULL subtotal
grossTotal       = round2(subtotal + serviceFeeAmount)
actualDiscount   = round2(min(discountAmount, grossTotal))    // cap so total ≥ 0
totalAmount      = max(0, round2(grossTotal - actualDiscount))
```

Returned `PriceBreakdown` fields are unchanged in shape:
`{ baseRate, durationHours, subtotal, discountAmount: actualDiscount,
serviceFeePercent, serviceFeeAmount, totalAmount }`.

**Zero-discount equivalence (regression safety):** with `discountAmount = 0`,
this yields `serviceFeeAmount = subtotal * fee/100` and
`totalAmount = subtotal + serviceFeeAmount` — identical to the current function.
So all existing no-promo bookings and their tests are unaffected; only the
discount path changes (previously the fee was computed on the *discounted* base;
now it is on the full subtotal and the discount comes off the gross).

## New Service Logic

`promo-code.service.ts` gains one function:

```
validatePromoCode(code: string, applicableAmount: number, userId: string)
  → { promoCodeId: string; discountAmount: number }
  → throws AppError (badRequest / notFound) when invalid
```

`applicableAmount` is the **gross total** the discount applies to
(`subtotal + serviceFeeAmount`), per Requirement 2. Callers compute it (see
below) — this function does not know about service fees.

Validation order:

1. Code exists and is not soft-deleted (`deletedAt: null`) — else `notFound`.
2. `isActive` is true — else `badRequest`.
3. Not expired: `expiresAt` is null or in the future — else `badRequest`.
4. If `maxUsage` set: `usageCount < maxUsage` — else `badRequest` (fully redeemed).
5. If `maxUsagePerUser` set: the user's `PromoCodeRedemption` count for this code
   (`deletedAt: null`) is `< maxUsagePerUser` — else `badRequest`.

Discount computation:

- `FLAT` → `value`
- `PERCENTAGE` → `applicableAmount * value / 100`
- Cap at `applicableAmount` (never negative total). Final rounding is handled by
  `calculatePriceBreakdown` (which also caps `discountAmount` at the gross
  total); `validatePromoCode` may return an unrounded/soft-capped number.

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

- Fetch `serviceFeePercent` (already done via `getServiceFeePercent()`).
- Compute the gross total the discount applies to:
  ```
  subtotal         = Number(nanny.hourlyRate) * durationHours
  serviceFeeAmount = subtotal * serviceFeePercent / 100
  grossTotal       = subtotal + serviceFeeAmount
  ```
- If `body.promoCode` present → `validatePromoCode(code, grossTotal, user.id)` to
  get `{ promoCodeId, discountAmount }`; pass `discountAmount` into
  `calculatePriceBreakdown` (which recomputes the same numbers as the stored
  source of truth and caps the discount at the gross total).
- If absent → discount `0`, `promoCodeId` null (current behavior).
- Persist `promoCodeId` on the booking (null when no code).
- The booking write becomes a `$transaction` when a code was applied: create the
  booking (with the discounted breakdown and `promoCodeId`), then call
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

**New route:** `POST /bookings/validate-promo` on the mother-authed
`bookingRouter` (`requireAuth`; role checked in the service). It is placed here
rather than under `/promo-codes`, which is mounted on the **admin-only**
`adminRouter`.

- Request body: `{ code: string, subtotal: number }` (new Zod schema in
  `packages/shared`). The client sends the base `subtotal` (`rate × hours`); the
  server adds the service fee itself so fee logic stays server-side.
- Handler (`validateBookingPromo` in `booking.service.ts`): resolve the mother,
  fetch `serviceFeePercent`, compute
  `grossTotal = subtotal + subtotal * serviceFeePercent/100`, then call
  `validatePromoCode(code, grossTotal, user.id)`.
- Response: `{ discountAmount: number }` on success, or a 4xx `ApiResponse`
  error with a human-readable message.
- This is a preview and does **not** consume the code or write a redemption.

**Mobile `BookingStep1Screen`:**

- Remove the `SHOW_PROMO_CODE`, `PROMO_CODE_VALUE`, `PROMO_DISCOUNT_PERCENT`
  constants and the local `handleApplyPromo` string match.
- On "Apply" → call `POST /bookings/validate-promo` with the current `subtotal`;
  on success store the returned `discountAmount` and applied code; on error show
  the returned message.
- The summary's promo line renders the server-provided `discountAmount`.
- On booking submit → include `promoCode` in the create-booking request.
- Remove the hardcoded `"FIRST20 — 20% off"` chip text; show the applied code
  and its actual discount.

## Admin Visibility (Requirement 3)

Admins must see the promo code applied to each booking in the admin dashboard.

**Backend — `admin-booking.service.ts`:**

- Extend the local `bookingInclude` to pull the applied code:
  ```ts
  promoCode: { select: { code: true } },
  ```
- Add `discountAmount` and `promoCode` to the `AdminBooking` DTO in `toDto`:
  ```ts
  discountAmount: row.discountAmount.toNumber(),
  promoCode: row.promoCode?.code ?? null,
  ```

**Shared — `packages/shared/src/admin.ts`:** add to `AdminBookingSchema`:
```ts
discountAmount: z.number(),
promoCode: z.string().nullable(),
```

**Admin frontend — `apps/admin/src/pages/bookings-page.tsx`:** add a "Promo"
column to the bookings table showing `booking.promoCode` and the discount, e.g.:
```tsx
<td>
  {booking.promoCode
    ? `${booking.promoCode} (−${booking.discountAmount.toFixed(2)})`
    : '—'}
</td>
```
(with a matching `<th>Promo</th>` header).

The existing promo-code table (`promo-code-table.tsx`) already shows aggregate
`usageCount` per code ("Used" column); no change needed there.

## Testing

- `calculatePriceBreakdown`: fee is charged on the full subtotal and the
  discount comes off the gross total (e.g. rate 100 × 2h, fee 6%, flat 50 →
  subtotal 200, serviceFee 12, total 162, and subtotal/nanny-earnings still
  200); zero-discount result is unchanged from before; discount caps at the
  gross total so `totalAmount` never goes negative.
- `validatePromoCode`: each rejection path (not found, inactive, expired,
  `maxUsage` reached, `maxUsagePerUser` reached); `FLAT` returns `value`;
  `PERCENTAGE` returns `applicableAmount * value/100`; discount caps at
  `applicableAmount`.
- `redeemPromoCode`: increments `usageCount` and creates a `PromoCodeRedemption`
  row with the given ids.
- `createBooking`: applies discount with a valid code, sets `promoCodeId`, AND
  writes the redemption atomically; nanny `subtotal` equals `rate × hours`
  regardless of discount (Requirement 1); zero discount / null `promoCodeId` /
  no redemption without a code; rejects an invalid code and writes nothing;
  emergency booking ignores the code; retry (existing PENDING booking) does not
  double-consume.
- `validateBookingPromo` / `POST /bookings/validate-promo`: computes gross total
  from subtotal + fee and returns the discount for a valid code; returns 4xx for
  invalid; does not write a redemption.
- `admin-booking.service` `toDto`: includes `promoCode` (code or null) and
  `discountAmount`.
- Payment services (`mockPayBooking`, `paymob.service.ts`) are untouched, so
  their existing tests must still pass unchanged.
- Coverage stays ≥ 80% (CI threshold).

## Out of Scope / Future

- Promo codes on emergency bookings.
- Releasing a consumed code when its booking is rejected/cancelled/unpaid
  (consumption is at creation for v1).
- Min-order thresholds, first-booking-only rules, code stacking.
- A dedicated admin redemption-history view (per-booking code display is in
  scope; a separate redemptions report is not).
