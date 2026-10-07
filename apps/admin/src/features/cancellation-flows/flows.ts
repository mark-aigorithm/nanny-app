/**
 * Every way a booking (or a piece of one) can be cancelled today, and what
 * each does to the mother's prepaid package hours, Care Points, promo code,
 * money and notifications.
 *
 * Hand-written from the backend, not read from it: this backs a public page
 * that renders signed out, and no backend route answers without a token. When
 * cancellation behaviour changes, change the matching row here in the same
 * commit — `source` names the code each row describes.
 */

/**
 * How an outcome reads to the mother: kept whole, lost, nothing at stake, or a
 * caveat — or `na` when the thing simply isn't involved (no badge, just text).
 */
export type OutcomeTone = 'ok' | 'lost' | 'none' | 'warn' | 'na';

export type Outcome = { tone: OutcomeTone; text: string };

export type CancellationActor = 'Mother' | 'Nanny' | 'Mother or nanny' | 'Admin' | 'System';

export type CancellationFlow = {
  id: string;
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
] as const satisfies readonly { key: keyof CancellationFlow; label: string }[];

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
    packageHours: HOURS_KEPT,
    carePoints: POINTS_KEPT,
    promoCode: PROMO_USED,
    money: {
      tone: 'lost',
      text: 'Nothing is refunded. The server works out a 100% refund quote, but the app never shows it and no money moves.',
    },
    notifications: {
      tone: 'none',
      text: 'The nanny is told. The mother gets no notice of what happens to her money or credits.',
    },
    gap: 'A free cancellation still loses the mother her hours, points, promo code and payment unless an admin steps in — and the console has no tool to refund a cancelled booking. A booking paid entirely with hours, points or a 100% promo counts as paid the moment a nanny accepts, so its whole value is lost however early she cancels.',
    source: 'booking.service.ts → cancelBooking (refundAmount quote only)',
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
      tone: 'lost',
      text: 'Nothing is refunded. The suggested refund keeps the late-cancellation fee set under Booking options (50% by default), and the app warns of that same fee.',
    },
    notifications: { tone: 'none', text: 'The nanny is told. The mother gets nothing.' },
    source: 'booking.service.ts → cancelBooking; mobile lib/cancellationWarning.ts',
  },
  {
    id: 'nanny-unpaid',
    title: 'Nanny drops an accepted booking that is not paid yet',
    who: 'Nanny',
    when: 'APPROVED — goes back to PENDING with no nanny',
    phase: 'before',
    needsAcceptedUnpaid: true,
    packageHours: {
      tone: 'ok',
      text: 'Stay set aside on the request, which goes back to the pool for another nanny.',
    },
    carePoints: {
      tone: 'ok',
      text: 'Stay set aside on the request, which goes back to the pool for another nanny.',
    },
    promoCode: { tone: 'ok', text: 'Stays reserved on the request.' },
    money: NOTHING_PAID,
    notifications: {
      tone: 'ok',
      text: 'The mother: "Finding you another nanny". Nearby nannies — not the one who dropped it — and the console are told it is open again.',
    },
    gap: 'Nannies can’t cancel from the app by design, and the console has no action for it either — so today nothing can trigger this. A nanny who can’t make it has to call support.',
    source: 'booking.service.ts → cancelBooking, releaseBookingToPool',
  },
  {
    id: 'nanny-paid',
    title: 'Nanny cancels a paid booking',
    who: 'Nanny',
    when: 'CONFIRMED',
    phase: 'after',
    packageHours: HOURS_KEPT,
    carePoints: POINTS_KEPT,
    promoCode: PROMO_USED,
    money: {
      tone: 'lost',
      text: 'Nothing is refunded automatically. The suggested refund is 100%; an admin decides between money and Care Points.',
    },
    notifications: {
      tone: 'none',
      text: 'The mother: "Your nanny had to cancel… Our team will review your payment and contact you about it." No refund is promised.',
    },
    gap: 'She loses any hours, points and promo code, and the console has no tool yet to refund a cancelled booking — an admin’s decision can only be carried out in the Paymob dashboard.',
    source: 'booking.service.ts → cancelBooking, notifyOtherPartyOfCancellation',
  },
  {
    id: 'shift-running',
    title: 'Mother or nanny tries to cancel a shift that has started',
    who: 'Mother or nanny',
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
    title: 'Admin rejects a request',
    who: 'Admin',
    when: 'PENDING or APPROVED',
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
      text: 'Nothing is refunded, and the console refund button cannot help: it only refunds an overpayment, and cancelling leaves the total unchanged.',
    },
    notifications: {
      tone: 'ok',
      text: 'Both parties: "Your booking … was cancelled by an admin."',
    },
    gap: 'Refunding a cancelled booking can only be done by hand in the Paymob dashboard.',
    source: 'admin-booking.service.ts → setBookingStatus; admin-booking-edit.service.ts → refundBooking',
  },
  {
    id: 'paid-after-cancel',
    title: 'Payment goes through after the booking was cancelled',
    who: 'System',
    when: 'CANCELLED while the mother was in checkout',
    phase: 'other',
    packageHours: NOT_APPLICABLE,
    carePoints: NOT_APPLICABLE,
    promoCode: { tone: 'ok', text: 'Not redeemed — the booking is never confirmed.' },
    money: {
      tone: 'lost',
      text: 'The payment is recorded as captured, but the booking stays cancelled and nothing refunds it.',
    },
    notifications: { tone: 'warn', text: 'Nobody — only a warning in the server logs.' },
    gap: 'Money is taken for a cancelled booking and no one in operations is told.',
    source: 'paymob.service.ts → capture path (non-confirmable booking)',
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
