import type { CancellationFlow, Outcome } from './flows';

/**
 * The ways a booking can be paid for. Picking one on the page re-reads every
 * cancellation flow for that payment: credits it didn't use read "Not used",
 * money reads "nothing charged" when no card was involved, and flows that
 * cannot occur with it say so.
 *
 * Order matters on the server and is worth knowing when reading the table: a
 * promo code comes off first, then package hours, then Care Points, and the
 * card pays whatever is left.
 */
export type PaymentMethod = {
  id: string;
  label: string;
  detail: string;
  uses: { card: boolean; promo: boolean; package: boolean; points: boolean };
};

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  {
    id: 'card',
    label: 'Card only',
    detail: 'The whole total is paid by card once a nanny accepts.',
    uses: { card: true, promo: false, package: false, points: false },
  },
  {
    id: 'card-promo',
    label: 'Card + promo code',
    detail: 'A promo code lowers the total; the card pays the rest. The code is spent only when the card payment goes through.',
    uses: { card: true, promo: true, package: false, points: false },
  },
  {
    id: 'package',
    label: 'Package hours cover it all',
    detail: 'Hours are taken when the request is sent. With nothing to pay, the booking confirms itself the moment a nanny accepts.',
    uses: { card: false, promo: false, package: true, points: false },
  },
  {
    id: 'points',
    label: 'Care Points cover it all',
    detail: 'Points chosen with the request are taken when it is sent. With nothing to pay, the booking confirms itself when a nanny accepts.',
    uses: { card: false, promo: false, package: false, points: true },
  },
  {
    id: 'promo-full',
    label: '100% promo code',
    detail: 'The code brings the total to zero; the booking confirms itself when a nanny accepts, and the code is spent then.',
    uses: { card: false, promo: true, package: false, points: false },
  },
  {
    id: 'package-card',
    label: 'Package hours + card',
    detail: 'The package covers some hours; the card pays the rest.',
    uses: { card: true, promo: false, package: true, points: false },
  },
  {
    id: 'points-card',
    label: 'Care Points + card',
    detail: 'Points cover part — chosen with the request or at checkout; the card pays the rest.',
    uses: { card: true, promo: false, package: false, points: true },
  },
  {
    id: 'package-points',
    label: 'Package hours + Care Points cover it all',
    detail: 'The package is used first and points cover what it leaves. With nothing to pay, the booking confirms itself when a nanny accepts.',
    uses: { card: false, promo: false, package: true, points: true },
  },
  {
    id: 'package-points-card',
    label: 'Package hours + Care Points + card',
    detail: 'Package first, then points; the card pays whatever is still owed.',
    uses: { card: true, promo: false, package: true, points: true },
  },
];

/** Nothing left to pay — such a booking confirms itself when a nanny accepts. */
export function isFullyCovered(method: PaymentMethod): boolean {
  return !method.uses.card;
}

const NOT_USED: Outcome = { tone: 'na', text: 'Not used.' };
const NOTHING_CHARGED: Outcome = { tone: 'none', text: 'Nothing charged — no card payment.' };
const NOT_POSSIBLE: Outcome = { tone: 'na', text: '—' };

export type FlowOutcomes = Pick<
  CancellationFlow,
  'packageHours' | 'carePoints' | 'promoCode' | 'money' | 'notifications'
> & {
  /** Set when the flow cannot occur with this payment — and why. */
  notPossible?: string;
};

/**
 * A flow's outcomes for one payment method — or as written, for any payment.
 * Flows that do not depend on payment (a refused cancellation, an extension…)
 * read the same whatever is picked.
 */
export function outcomesFor(flow: CancellationFlow, method: PaymentMethod | undefined): FlowOutcomes {
  if (!method || flow.phase === 'other') return flow;

  if (flow.needsAcceptedUnpaid && isFullyCovered(method)) {
    return {
      packageHours: NOT_POSSIBLE,
      carePoints: NOT_POSSIBLE,
      promoCode: NOT_POSSIBLE,
      money: NOT_POSSIBLE,
      notifications: NOT_POSSIBLE,
      notPossible:
        'Can’t happen with this payment: with nothing to pay, the booking confirms itself the moment a nanny accepts, so it is never accepted-but-unpaid.',
    };
  }

  return {
    packageHours: method.uses.package ? flow.packageHours : NOT_USED,
    carePoints: method.uses.points ? flow.carePoints : NOT_USED,
    promoCode: method.uses.promo ? flow.promoCode : NOT_USED,
    money: method.uses.card ? flow.money : NOTHING_CHARGED,
    notifications: flow.notifications,
  };
}
