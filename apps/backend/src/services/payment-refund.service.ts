import { PaymentStatus } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { errors } from '@backend/lib/errors';
import { createPaymobApiClient } from '@backend/lib/paymob/client';

/** Money comparisons on Decimal-derived numbers tolerate sub-cent float noise. */
const EPSILON = 0.005;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Refund EGP against a booking's captured Paymob payment (money back to the
 * card). The external Paymob call is made OUTSIDE any DB transaction; the ledger
 * write that follows is an idempotent conditional update keyed on the
 * refundedAmount we read, so a retry or a webhook race can't double-count it.
 * Over-refund is guarded per payment — a refund can never exceed what a single
 * captured transaction still has left to give back.
 *
 * Care-Points refunds do NOT go through here: they move no money and are handled
 * by the reward service (grantPoints) in the edit/refund flow.
 */
export async function refundBookingPayment(params: {
  bookingId: number;
  amountEgp: number;
}): Promise<{ paymentId: number; refundedAmount: number; status: PaymentStatus }> {
  if (!config.paymob.enabled) {
    throw errors.badRequest('Paymob is not configured on this server.');
  }
  const amount = round2(params.amountEgp);
  if (amount <= 0) throw errors.badRequest('Refund amount must be positive.');

  // Newest captured, refundable payment tied to the booking — its main payment
  // or a later "pay the difference" top-up — with a Paymob transaction to refund
  // against. We refund from a single transaction that can cover the whole amount;
  // splitting a refund across transactions is deliberately not supported (the
  // admin refunds a smaller amount, or as Care Points instead).
  const candidates = await prisma.payment.findMany({
    where: {
      bookingId: params.bookingId,
      status: PaymentStatus.CAPTURED,
      deletedAt: null,
      paymobTransactionId: { not: null },
    },
    orderBy: { id: 'desc' },
  });

  const payment = candidates.find(
    (p) => round2(Number(p.amount) - Number(p.refundedAmount)) + EPSILON >= amount,
  );
  if (!payment || !payment.paymobTransactionId) {
    throw errors.badRequest(
      'No single captured payment can cover this refund. Refund a smaller amount or use Care Points.',
    );
  }

  const prevRefunded = round2(Number(payment.refundedAmount));
  const amountCents = Math.round(amount * 100);

  const api = createPaymobApiClient(config.paymob.secretKey, config.paymob.apiBaseUrl);
  const result = await api.refund({
    transactionId: payment.paymobTransactionId,
    amountCents,
  });
  if (!result.success) {
    throw errors.badRequest('Paymob rejected the refund.');
  }

  const newRefunded = round2(prevRefunded + amount);
  const fullyRefunded = newRefunded + EPSILON >= Number(payment.amount);

  // Conditional on the refundedAmount we read: a concurrent refund or a webhook
  // replay matches zero rows instead of applying this a second time.
  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, refundedAmount: payment.refundedAmount, deletedAt: null },
    data: {
      refundedAmount: newRefunded,
      refundedAt: new Date(),
      status: fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.CAPTURED,
    },
  });
  if (updated.count === 0) {
    // The money left Paymob but our row moved under us — surface it so the admin
    // reconciles by hand rather than silently retrying and double-refunding.
    throw errors.conflict(
      'The payment changed while refunding. The Paymob refund may have succeeded — verify before retrying.',
    );
  }

  return {
    paymentId: payment.id,
    refundedAmount: newRefunded,
    status: fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.CAPTURED,
  };
}
