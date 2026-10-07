import type { Outcome } from './flows';

/**
 * Today's outcome for every way a booking can be paid for, crossed with every
 * way it can be cancelled. The flows in `flows.ts` are the same facts told one
 * cancellation at a time; this is the grid the business reads across.
 *
 * Kept by hand for the same reason as `flows.ts` — change both together.
 */

export const MATRIX_COLUMNS = [
  { key: 'beforePayment', label: 'Anyone cancels before payment' },
  { key: 'motherOutside', label: 'Mother cancels after payment, outside the window' },
  { key: 'motherInside', label: 'Mother cancels after payment, inside the window' },
  { key: 'nanny', label: 'Nanny cancels after payment' },
  { key: 'admin', label: 'Admin cancels after payment' },
] as const;

export type MatrixColumnKey = (typeof MATRIX_COLUMNS)[number]['key'];

export type PaymentMix = {
  id: string;
  label: string;
  /** How the booking gets paid, in plain words. */
  detail: string;
  cells: Record<MatrixColumnKey, Outcome>;
};

const NO_CASH_BACK = 'No cash moves. The console cannot refund it either.';

export const PAYMENT_MIXES: readonly PaymentMix[] = [
  {
    id: 'card',
    label: 'Card only',
    detail: 'The mother pays the whole total by card once a nanny accepts.',
    cells: {
      beforePayment: { tone: 'none', text: 'Nothing was paid.' },
      motherOutside: { tone: 'lost', text: `${NO_CASH_BACK} Server quotes 100%.` },
      motherInside: { tone: 'lost', text: `${NO_CASH_BACK} Server quotes 50%.` },
      nanny: { tone: 'warn', text: `${NO_CASH_BACK} She is told "refunded in full".` },
      admin: { tone: 'lost', text: NO_CASH_BACK },
    },
  },
  {
    id: 'card-promo',
    label: 'Card + promo code',
    detail: 'A promo code lowers the total; the rest is paid by card. The code is only spent when the card payment goes through.',
    cells: {
      beforePayment: { tone: 'ok', text: 'Nothing was paid; the code is free to use again.' },
      motherOutside: { tone: 'lost', text: 'Code stays used. No cash moves.' },
      motherInside: { tone: 'lost', text: 'Code stays used. No cash moves.' },
      nanny: { tone: 'warn', text: 'Code stays used. No cash moves, though she is told "refunded in full".' },
      admin: { tone: 'lost', text: 'Code stays used. No cash moves.' },
    },
  },
  {
    id: 'package',
    label: 'Package hours cover it all',
    detail: 'Prepaid hours are taken when the request is sent. With nothing left to pay, the booking confirms itself the moment a nanny accepts — so "before payment" only lasts until then.',
    cells: {
      beforePayment: { tone: 'ok', text: 'Hours returned (only while no nanny has accepted).' },
      motherOutside: { tone: 'lost', text: 'Hours lost.' },
      motherInside: { tone: 'lost', text: 'Hours lost.' },
      nanny: { tone: 'warn', text: 'Hours lost, though she is told "refunded in full".' },
      admin: { tone: 'lost', text: 'Hours lost.' },
    },
  },
  {
    id: 'points',
    label: 'Care Points cover it all',
    detail: 'Points chosen with the request are taken when it is sent. With nothing left to pay, the booking confirms itself when a nanny accepts.',
    cells: {
      beforePayment: { tone: 'ok', text: 'Points returned (only while no nanny has accepted).' },
      motherOutside: { tone: 'lost', text: 'Points lost.' },
      motherInside: { tone: 'lost', text: 'Points lost.' },
      nanny: { tone: 'warn', text: 'Points lost, though she is told "refunded in full".' },
      admin: { tone: 'lost', text: 'Points lost.' },
    },
  },
  {
    id: 'promo-full',
    label: '100% promo code',
    detail: 'The code brings the total to zero. The booking confirms itself when a nanny accepts, and the code is spent at that moment.',
    cells: {
      beforePayment: { tone: 'ok', text: 'Code free to use again (only while no nanny has accepted).' },
      motherOutside: { tone: 'lost', text: 'Code stays used.' },
      motherInside: { tone: 'lost', text: 'Code stays used.' },
      nanny: { tone: 'warn', text: 'Code stays used, though she is told "refunded in full".' },
      admin: { tone: 'lost', text: 'Code stays used.' },
    },
  },
  {
    id: 'package-card',
    label: 'Package hours + card',
    detail: 'The package covers some hours; the rest is paid by card.',
    cells: {
      beforePayment: { tone: 'ok', text: 'Hours returned; nothing was paid.' },
      motherOutside: { tone: 'lost', text: 'Hours lost. No cash moves; the quote covers the card part only.' },
      motherInside: { tone: 'lost', text: 'Hours lost. No cash moves; the quote is 50% of the card part.' },
      nanny: { tone: 'warn', text: 'Hours lost. No cash moves, though she is told "refunded in full".' },
      admin: { tone: 'lost', text: 'Hours lost. No cash moves.' },
    },
  },
  {
    id: 'points-card',
    label: 'Care Points + card',
    detail: 'Points cover part of the price — chosen with the request or at checkout; the rest is paid by card.',
    cells: {
      beforePayment: { tone: 'ok', text: 'Points returned; nothing was paid.' },
      motherOutside: { tone: 'lost', text: 'Points lost. No cash moves; the quote covers the card part only.' },
      motherInside: { tone: 'lost', text: 'Points lost. No cash moves; the quote is 50% of the card part.' },
      nanny: { tone: 'warn', text: 'Points lost. No cash moves, though she is told "refunded in full".' },
      admin: { tone: 'lost', text: 'Points lost. No cash moves.' },
    },
  },
];
