# Settling a booking overpayment as Care Points

**Date:** 2026-09-22
**Status:** approved

## The problem

`refundBooking()` in `apps/backend/src/services/admin-booking-edit.service.ts` derives the money
still owed back from the payments alone:

```
amountPaid = Σ (payment.amount − payment.refundedAmount)   over CAPTURED / REFUNDED payments
refundable = amountPaid − booking.totalAmount
```

A **PAYMOB** refund moves `payment.refundedAmount`, so `amountPaid` drops and `refundable` reaches
zero. A **CARE_POINTS** refund calls `grantPoints()` and returns: the wallet changes, the booking
and its payments do not. The overpayment is therefore still, as far as every consumer of those two
figures is concerned, outstanding.

Worked example — 6 h at 100/h paid in full (600), shortened to 4 h (total 400, refundable 200),
settled with 250 Care Points:

| Consequence | What happens |
|---|---|
| Detail page keeps nagging | `GET /admin/bookings/:id` still reports `refundableAmount: 200`, so `booking-detail-page.tsx` keeps showing the "overpaid" banner and its *Refund overpayment* button. |
| Double settlement | That button, with method PAYMOB, passes the guard and moves 200 EGP. She has 250 points **and** 200 EGP for one 200 EGP overpayment. |
| Editor under-charges on a re-raise | Back to 6 h: `delta = 600 − 600 = 0` → "No change to the total", no balance due. The 250 points were free. Correct answer: she owes 200. |
| Editor over-refunds on a further cut | Down to 3 h: `refundable = 600 − 300 = 300`; correct is 100. |
| Audit gap | The `ADMIN_GRANT` ledger row has `bookingId: null` and only a free-text reason. Nothing ties the points to the overpayment they settled. |

A boolean or a timestamp alone cannot fix the last three rows: the re-raise and re-cut cases need
to know *how much* was returned, so the booking's effective paid figure becomes 600 − 200 = 400,
exactly as it would after a 200 EGP card refund.

## Design

### 1. Data model

Two columns on `Booking`, the mirror of `Payment.refundedAmount`:

```prisma
/// Overpayment on this booking that was returned to the mother as Care Points
/// instead of to her card. Netted out of what she has effectively paid, exactly
/// as Payment.refundedAmount is — so a later edit that raises the price charges
/// it back rather than treating it as already covered.
refundedAsPointsAmount Decimal   @default(0) @map("refunded_as_points_amount") @db.Decimal(10, 2)
refundedAsPointsAt     DateTime? @map("refunded_as_points_at")
```

Hand-written migration `20260922120000_add_booking_refunded_as_points` — additive, `DEFAULT 0`, no
backfill (no booking has been settled this way with a recorded amount).

`RewardLedgerEntry.bookingId`'s doc comment widens from "set on EARN entries" to also cover an
`ADMIN_GRANT` made as a booking refund. No schema change there — the column already exists, and
`awardPointsForBooking`'s idempotency lookup filters on `type: 'EARN'`, so the new rows can't
collide with it.

### 2. One netting helper, four consumers

In `admin-booking.service.ts`, beside `sumCapturedPaid` (which keeps meaning *cash kept*):

```ts
/** What the mother has effectively paid: cash kept, less any overpayment already returned as points. */
export function netAmountPaid(row: {
  payments: …;
  refundedAsPointsAmount: Prisma.Decimal;
}): number;
```

Every figure that today reads `sumCapturedPaid` switches to `netAmountPaid`:

| Consumer | Becomes |
|---|---|
| `toDetailDto` | `refundableAmount = max(0, netAmountPaid − totalAmount)` |
| `previewBookingEdit` | `delta = simFinalTotal − netAmountPaid` |
| `applyBookingEdit` | `delta = finalTotal − netAmountPaid` |
| `refundBooking` | `refundable = netAmountPaid − totalAmount` |

`editInclude` gains `refundedAsPointsAmount` (it already selects the payments); the detail include
selects the whole row already.

This is the whole double-counting story: a points settlement lowers the effective paid figure the
same way a card refund does, so both directions of a later edit reason from the right baseline.

### 3. The CARE_POINTS branch of `refundBooking`

- Settles `input.amount ?? refundable` EGP of the overpayment, reusing the existing `amount` field
  and the same ceiling check and error copy as PAYMOB. The console sends no amount, so the default
  is "settle it all"; a partial settlement is API-only for now.
- The wallet grant and the booking's `refundedAsPointsAmount` increment happen in **one
  transaction**. `grantPoints`'s wallet mutation is extracted into `grantPointsInTx(tx, …)`, which
  `grantPoints` then calls, and the `ADMIN_GRANT` ledger row carries `bookingId`.
- The booking write is a guarded `updateMany` on the `refundedAsPointsAmount` that was read at the
  start, so two concurrent settlements can't both land (the same optimistic pattern
  `applyBookingEdit` uses on `updatedAt`). A losing write is a 409 telling the admin to reload.
- The mother gets one notification for the settlement, not two: the in-transaction helper does not
  send `grantPoints`'s own `POINTS_GRANTED` push, leaving the existing `BOOKING_REFUNDED` one that
  already names the points and the reason.
- `AdminRefundResponse` gains `settledAmount: number` — the EGP of overpayment this call settled,
  on both methods. `refundedAmount` keeps meaning "went back to the card".

### 4. Shared DTOs (`packages/shared/src/admin.ts`)

- `AdminBookingDetailSchema`: `refundedAsPointsAmount`, `refundedAsPointsAt`;
  `refundableAmount`'s doc becomes `amountPaid − refundedAsPointsAmount − totalAmount`.
- `AdminEditPreviewResponseSchema` and `BookingSettlementSchema`: `refundedAsPointsAmount`, with
  `delta` documented as measured against the *net* paid figure.
- `amountPaid` keeps meaning cash kept, everywhere.

### 5. Admin console

- **Detail page** — the payment card gains a "Returned as Care Points" row (amount + date) when the
  figure is non-zero, and the overpaid banner mentions it in the same case, so a partially settled
  booking explains its own remainder.
- **Editor rail** — an "Already returned as points" line under "Already paid" whenever it is
  non-zero, so "Mother owes EGP 200" right after a 200 EGP points settlement is legible.
- **Refund modal**, points mode — the hint becomes "Granting points settles the EGP X overpayment —
  it will no longer be refundable to the card." No new inputs.

### 6. Tests

| Tier | Cases |
|---|---|
| `src/__tests__/admin-booking-edit.service.test.ts` | a points refund records the full amount and stamps `refundedAsPointsAt`; a partial `amount`; `amount > refundable` → 400; a follow-up PAYMOB refund on a fully settled booking → 400; preview and apply net the settlement out (raising the price back produces a balance due equal to the settled amount); a lost guard race → 409 |
| `src/__tests__/admin-booking.service.test.ts` | `netAmountPaid`; `toDetailDto` nets the points settlement and exposes both new fields |
| `src/__integration__/journeys/a03-refund.test.ts` | extend "can settle the overpayment as Care Points": detail `refundableAmount` → 0, `refundedAsPointsAmount` = the old refundable, the ledger row carries `bookingId`, a follow-up PAYMOB refund is refused; plus a new case where raising the price again charges the settled amount back |
| `apps/admin/e2e/a03-refund.spec.ts` | extend the Care Points spec: after a reload there is no *Refund overpayment* button, `getBooking(...).refundableAmount === 0`, and the payment card shows "Returned as Care Points" |
| `apps/admin/src/pages/__tests__/booking-detail-page.test.tsx` | fixtures gain the new fields; one case for the new row |

## Out of scope

- A typed per-settlement history table (option C in the discussion). Nothing reads such a history
  today; the ledger row plus the two columns cover the money and the audit trail.
- A fixed EGP→points conversion. The admin still chooses the points; the EGP settled is a separate
  number, defaulting to the whole overpayment.
