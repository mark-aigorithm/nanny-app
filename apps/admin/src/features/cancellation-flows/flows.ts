/**
 * Every way a booking (or a piece of one) can be cancelled today, and what
 * each does to the mother's prepaid package hours, Care Points, promo code,
 * money and notifications.
 *
 * Hand-written from the backend, not read from it: this backs a public page
 * that renders signed out, and no backend route answers without a token. When
 * cancellation behaviour changes, change the matching row here in the same
 * commit — `source` names the code each row describes.
 *
 * The ids and outcome keys are shared with the server, which records the
 * changes the business team proposes per cell (cancellation-cell-proposals.ts).
 */

import type { CancellationFlowId, CancellationOutcomeKey } from '@nanny-app/shared';

/**
 * How an outcome reads to the mother: kept whole, lost, nothing at stake, or a
 * caveat — or `na` when the thing simply isn't involved (no badge, just text).
 */
export type OutcomeTone = 'ok' | 'lost' | 'none' | 'warn' | 'na';

export type Outcome = { tone: OutcomeTone; text: string };

/** Nannies never cancel a booking — by design — so they are not an actor here. */
export type CancellationActor = 'Mother' | 'Mother or nanny' | 'Admin' | 'System';

export type CancellationFlow = {
  id: CancellationFlowId;
  title: string;
  who: CancellationActor;
  /** The booking statuses the flow starts from. */
  when: string;
  /** Before or after payment; 'other' for flows the payment method doesn't change. */
  phase: 'before' | 'after' | 'other';
  /**
   * Starts from an accepted but unpaid booking — a state a booking with nothing
   * to pay never reaches, since it confirms itself when a nanny accepts.
   */
  needsAcceptedUnpaid?: boolean;
  packageHours: Outcome;
  carePoints: Outcome;
  promoCode: Outcome;
  money: Outcome;
  notifications: Outcome;
  /** What is wrong with the flow today, if anything. */
  gap?: string;
  /** Where the behaviour lives in apps/backend, for engineers. */
  source: string;
};

export const OUTCOME_ROWS = [
  { key: 'packageHours', label: 'Package hours' },
  { key: 'carePoints', label: 'Care Points' },
  { key: 'promoCode', label: 'Promo code' },
  { key: 'money', label: 'Money' },
  { key: 'notifications', label: 'Notifications' },
] as const satisfies readonly { key: CancellationOutcomeKey; label: string }[];

const RETURNED_HOURS: Outcome = {
  tone: 'ok',
  text: 'Returned to the package they came from (unless that package has since expired).',
};
const RETURNED_POINTS: Outcome = {
  tone: 'ok',
  text: 'Returned to her wallet, with a "Care Points refunded" notification.',
};
const PROMO_RELEASED: Outcome = {
  tone: 'ok',
  text: 'Only reserved until payment, so the code is free to use again.',
};
const NOTHING_PAID: Outcome = { tone: 'none', text: 'Nothing was paid, so nothing to refund.' };
const HOURS_KEPT: Outcome = { tone: 'lost', text: 'Stay spent — not returned.' };
const POINTS_KEPT: Outcome = { tone: 'lost', text: 'Stay spent — not returned.' };
const PROMO_USED: Outcome = {
  tone: 'lost',
  text: 'Stays used: the redemption recorded at payment is never undone.',
};
const NOT_APPLICABLE: Outcome = { tone: 'none', text: '—' };

export const CANCELLATION_FLOWS: readonly CancellationFlow[] = [
  {
    id: 'mother-unclaimed',
    title: 'Mother withdraws a request no nanny has accepted',
    who: 'Mother',
    when: 'PENDING, no nanny',
    phase: 'before',
    packageHours: RETURNED_HOURS,
    carePoints: RETURNED_POINTS,
    promoCode: PROMO_RELEASED,
    money: NOTHING_PAID,
    notifications: {
      tone: 'none',
      text: 'Nobody — there is no nanny to tell, and the mother gets no cancellation notice.',
    },
    source: 'booking.service.ts → cancelBooking, returnUnpaidCredits',
  },
  {
    id: 'mother-unpaid',
    title: 'Mother cancels an accepted booking she has not paid for yet',
    who: 'Mother',
    when: 'APPROVED',
    phase: 'before',
    needsAcceptedUnpaid: true,
    packageHours: RETURNED_HOURS,
    carePoints: RETURNED_POINTS,
    promoCode: PROMO_RELEASED,
    money: NOTHING_PAID,
    notifications: {
      tone: 'none',
      text: 'The nanny: "The parent cancelled your booking." The mother gets nothing.',
    },
    source: 'booking.service.ts → cancelBooking, notifyOtherPartyOfCancellation',
  },
  {
    id: 'mother-paid-outside',
    title: 'Mother cancels a paid booking outside the cancellation window',
    who: 'Mother',
    when: 'CONFIRMED, more than the window ahead',
    phase: 'after',
    packageHours: { tone: 'ok', text: 'Returned to the package they came from, with the cancellation.' },
    carePoints: { tone: 'ok', text: 'Returned to her wallet, with the cancellation.' },
    promoCode: { tone: 'ok', text: 'Its use is undone — she can use the code again.' },
    money: {
      tone: 'none',
      text: 'Not refunded automatically. The admins are told, and one decides from the booking’s page — refund to the card (the full amount is suggested) or Care Points.',
    },
    notifications: {
      tone: 'ok',
      text: 'The mother: "Booking cancelled" with what went back, and "Our team will review your payment" if she paid by card. The admins: "Refund decision needed". The nanny is told.',
    },
    source: 'booking.service.ts → cancelBooking, returnPaidBookingCredits, notifyPaidCancellation',
  },
  {
    id: 'mother-paid-inside',
    title: 'Mother cancels a paid booking inside the cancellation window',
    who: 'Mother',
    when: 'CONFIRMED, within the window',
    phase: 'after',
    packageHours: HOURS_KEPT,
    carePoints: POINTS_KEPT,
    promoCode: PROMO_USED,
    money: {
      tone: 'none',
      text: 'Not refunded automatically. The admins are told; the console suggests the amount less the late-cancellation fee (Booking options, 50% by default) — the fee the app warns of — and an admin decides: card or Care Points.',
    },
    notifications: {
      tone: 'ok',
      text: 'The mother: "Booking cancelled — our team will review your payment". The admins: "Refund decision needed". The nanny is told.',
    },
    source: 'booking.service.ts → cancelBooking, notifyPaidCancellation; mobile lib/cancellationWarning.ts',
  },
  {
    id: 'shift-running',
    title: 'Mother tries to cancel a shift that has started',
    who: 'Mother',
    when: 'IN_PROGRESS',
    phase: 'other',
    packageHours: { tone: 'none', text: 'Unchanged — the cancellation is refused.' },
    carePoints: { tone: 'none', text: 'Unchanged — the cancellation is refused.' },
    promoCode: { tone: 'none', text: 'Unchanged — the cancellation is refused.' },
    money: {
      tone: 'none',
      text: 'Unchanged. The mother ends the shift instead and pays for the slot she booked.',
    },
    notifications: { tone: 'none', text: 'None — the app shows the refusal.' },
    source: 'booking.service.ts → cancelBooking (IN_PROGRESS guard), endBookingByMother',
  },
  {
    id: 'admin-reject',
    title: 'Admin cancels a request no nanny has accepted yet',
    who: 'Admin',
    when: 'PENDING — the “Reject” action in the Bookings menu',
    phase: 'before',
    packageHours: RETURNED_HOURS,
    carePoints: RETURNED_POINTS,
    promoCode: PROMO_RELEASED,
    money: NOTHING_PAID,
    notifications: {
      tone: 'ok',
      text: 'The mother: "Booking not approved" with the reason. The nanny, if any: "Booking cancelled".',
    },
    source: 'admin-booking.service.ts → rejectBooking',
  },
  {
    id: 'admin-cancel-paid',
    title: 'Admin changes a paid or running booking to Cancelled',
    who: 'Admin',
    when: 'CONFIRMED or IN_PROGRESS',
    phase: 'after',
    packageHours: HOURS_KEPT,
    carePoints: POINTS_KEPT,
    promoCode: PROMO_USED,
    money: {
      tone: 'lost',
      text: 'Nothing is refunded automatically. The console suggests the full amount; An admin settles it from the booking’s page — any amount up to what she paid, to the card or as Care Points.',
    },
    notifications: {
      tone: 'ok',
      text: 'Both parties: "Your booking … was cancelled by an admin."',
    },
    source: 'admin-booking.service.ts → setBookingStatus; admin-booking-edit.service.ts → refundBooking',
  },
  {
    id: 'paid-after-cancel',
    title: 'Payment goes through after the booking was cancelled',
    who: 'System',
    when: 'Rare: a booking can’t be cancelled while her checkout is open, and checkout links expire after 90 minutes',
    phase: 'other',
    packageHours: NOT_APPLICABLE,
    carePoints: NOT_APPLICABLE,
    promoCode: { tone: 'ok', text: 'Not redeemed — the booking is never confirmed.' },
    money: {
      tone: 'none',
      text: 'Recorded on the cancelled booking, whose page offers the refund — to the card or as Care Points.',
    },
    notifications: {
      tone: 'ok',
      text: 'The admins: "Payment on a cancelled booking — open it to refund". The mother: "Payment received for a cancelled booking. Our team will review it and contact you."',
    },
    source: 'booking.service.ts → cancelBooking (open-checkout check), notifyPaymentOnCancelledBooking; paymob.service.ts → bookingPaymentInProgress',
  },
  {
    id: 'extension-withdrawn',
    title: 'Mother withdraws an extension request before paying for it',
    who: 'Mother',
    when: 'Extension requested or accepted, not paid',
    phase: 'other',
    packageHours: { tone: 'ok', text: 'Any hours applied to the extension are returned.' },
    carePoints: RETURNED_POINTS,
    promoCode: NOT_APPLICABLE,
    money: { tone: 'none', text: 'Nothing was paid. A paid extension cannot be withdrawn.' },
    notifications: { tone: 'none', text: 'Only the "Care Points refunded" notice, if points were applied.' },
    source: 'booking-extension.service.ts → cancelBookingExtension; booking.service.ts → settleExtensionUnpaid',
  },
  {
    id: 'account-deletion',
    title: 'Mother or nanny deletes their account with live bookings',
    who: 'Mother or nanny',
    when: 'Any of PENDING, APPROVED, CONFIRMED, IN_PROGRESS',
    phase: 'other',
    packageHours: { tone: 'none', text: 'Unchanged — deletion is refused.' },
    carePoints: { tone: 'none', text: 'Unchanged — deletion is refused.' },
    promoCode: { tone: 'none', text: 'Unchanged — deletion is refused.' },
    money: { tone: 'none', text: 'Unchanged — deletion is refused.' },
    notifications: {
      tone: 'none',
      text: '"Finish or cancel your upcoming bookings before deleting your account."',
    },
    source: 'account-deletion.service.ts',
  },
];
