import { BookingStatus, PaymentStatus } from '@prisma/client';
import type { CreatePaymobIntentionRequest } from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { AppError, errors } from '@backend/lib/errors';
import {
  bookingInclude,
  canTransitionBookingStatus,
  notifyNannyBookingConfirmed,
} from '@backend/services/booking.service';
import { createPaymobApiClient, type PaymobIntentionElementResponse } from '@backend/lib/paymob/client';
import {
  PAYMOB_RECONCILE_OFFSETS_MS,
  PAYMOB_RETURN_PATH,
  PAYMOB_WEBHOOK_PATH,
} from '@backend/lib/paymob/constants';
import { buildTransactionHmacPlaintext, verifyPaymobTransactionHmac } from '@backend/lib/paymob/hmac';
import {
  coerceTransactionHmacPayload,
  extractMerchantPaymentId,
  extractPaymobTransactionObject,
  type PaymobTransactionDto,
  transactionFailed,
  transactionSuccess,
} from '@backend/lib/paymob/parse-webhook';
import type { DecodedIdToken } from '@backend/lib/firebase';

function mapIntentionElement(data: PaymobIntentionElementResponse): 'pending' | 'captured' | 'failed' {
  const txns = data.transactions ?? [];
  for (let i = txns.length - 1; i >= 0; i--) {
    const t = txns[i]!;
    if (t.success === true && t.pending === false) return 'captured';
    if (t.success === false && t.pending === false) return 'failed';
  }

  const st = String(data.status ?? '').toLowerCase();
  if (['failed', 'declined', 'voided', 'cancelled'].includes(st)) return 'failed';

  // Require a successful transaction — do not trust `confirmed` or success-like
  // status strings alone (fresh intentions can look "confirmed" before payment).
  return 'pending';
}

async function getUserByUid(uid: string) {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

function failureReasonFromTxn(txn: PaymobTransactionDto): string {
  return txn.data?.message || 'Payment declined';
}

async function finalizePaymentCaptured(paymentId: string, paymobTransactionId: string | null) {
  // Pay-after-approval: the admin already approved (status APPROVED), so a
  // successful capture is the FINAL step and confirms the booking outright.
  const confirmedBooking = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, deletedAt: null, status: PaymentStatus.PENDING },
    });
    if (!payment) return null;

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.CAPTURED,
        paymobTransactionId: paymobTransactionId ?? undefined,
        failureReason: null,
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
      },
    });

    const booking = await tx.booking.findUnique({
      where: { id: payment.bookingId },
      include: bookingInclude,
    });
    if (!booking) return null;

    // APPROVED → CONFIRMED (the transition table is the single source of
    // truth). If the booking isn't in a confirmable state — e.g. an admin
    // cancelled it between payment initiation and capture — record the money
    // but leave the status untouched rather than crashing the webhook.
    if (!canTransitionBookingStatus(booking.status, BookingStatus.CONFIRMED)) {
      // eslint-disable-next-line no-console
      console.warn('[paymob] captured payment for a non-confirmable booking', {
        paymentId,
        bookingId: booking.id,
        bookingStatus: booking.status,
      });
      return null;
    }

    return tx.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CONFIRMED },
      include: bookingInclude,
    });
  });

  if (confirmedBooking) {
    await notifyNannyBookingConfirmed(confirmedBooking);
  }
}

async function finalizePaymentFailed(paymentId: string, reason: string) {
  await prisma.payment.updateMany({
    where: { id: paymentId, deletedAt: null, status: PaymentStatus.PENDING },
    data: {
      status: PaymentStatus.FAILED,
      failureReason: reason,
      paymobNextReconcileAt: null,
      paymobClientSecret: null,
    },
  });
}

async function finalizePaymentTimeout(paymentId: string) {
  await finalizePaymentFailed(
    paymentId,
    'Payment timed out waiting for Paymob confirmation.',
  );
}

/** Paymob merchant order id — payment row id on first attempt, suffixed on retries. */
function buildPaymobMerchantOrderId(paymentId: string, attempt: number): string {
  if (attempt <= 1) return paymentId;
  return `${paymentId}-r${attempt}`;
}

export async function createPaymobIntentionForBooking(
  decoded: DecodedIdToken,
  bookingId: string,
  body: CreatePaymobIntentionRequest,
): Promise<{
  paymentId: string;
  clientSecret: string;
  publicKey: string;
  intentionId: string;
}> {
  if (!config.paymob.enabled) {
    throw errors.badRequest('Paymob is not configured on this server.');
  }

  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can pay for bookings.');
  if (!user.phone) {
    throw errors.badRequest('Add a phone number to your profile before paying.');
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: { payment: true },
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');
  // Pay-after-approval: payment may only be initiated once an admin has
  // approved the booking (status APPROVED).
  if (booking.status !== BookingStatus.APPROVED) {
    throw errors.badRequest(`Cannot pay for a booking in status ${booking.status}. It must be approved by an admin first.`);
  }
  if (!booking.nannyProfileId) {
    throw errors.badRequest('Booking has no assigned nanny yet.');
  }

  const existing = booking.payment;
  if (existing && !existing.deletedAt) {
    if (existing.status === PaymentStatus.CAPTURED) {
      throw errors.badRequest('This booking is already paid.');
    }
    if (
      existing.status === PaymentStatus.PENDING &&
      existing.paymobClientSecret &&
      existing.paymobIntentionId
    ) {
      return {
        paymentId: existing.id,
        clientSecret: existing.paymobClientSecret,
        publicKey: config.paymob.publicKey,
        intentionId: existing.paymobIntentionId,
      };
    }
  }

  const anchor = new Date();
  const nextReconcile = new Date(anchor.getTime() + PAYMOB_RECONCILE_OFFSETS_MS[0]);
  const notificationUrl = `${config.paymob.publicApiUrl}${PAYMOB_WEBHOOK_PATH}`;

  const nextIntentionAttempt = (existing?.paymobIntentionAttempt ?? 0) + 1;

  const resetPaymentData = {
    amount: booking.totalAmount,
    currency: 'EGP',
    method: body.method,
    status: PaymentStatus.PENDING,
    failureReason: null,
    paymobOrderId: null,
    paymobTransactionId: null,
    paymobIntentionId: null,
    paymobClientSecret: null,
    paymobIntentionAttempt: nextIntentionAttempt,
    paymobReconcileAnchorAt: anchor,
    paymobReconcileAttempt: 0,
    paymobNextReconcileAt: nextReconcile,
  };

  const payment =
    existing && !existing.deletedAt
      ? await prisma.payment.update({
          where: { id: existing.id },
          data: resetPaymentData,
        })
      : await prisma.payment.create({
          data: {
            bookingId,
            motherId: user.id,
            ...resetPaymentData,
          },
        });

  const merchantOrderId = buildPaymobMerchantOrderId(payment.id, nextIntentionAttempt);

  const amountCents = Math.round(Number(booking.totalAmount) * 100);
  const api = createPaymobApiClient(config.paymob.secretKey, config.paymob.apiBaseUrl);

  const billing_data: Record<string, string | boolean> = {
    apartment: 'NA',
    email: user.email,
    floor: 'NA',
    first_name: user.firstName,
    last_name: user.lastName,
    street: 'NA',
    building: 'NA',
    phone_number: user.phone,
    shipping_method: 'PKG',
    postal_code: '00000',
    city: 'NA',
    country: 'EG',
    state: 'NA',
    delivery_needed: false,
  };

  const redirectionUrl = `${config.paymob.publicApiUrl}${PAYMOB_RETURN_PATH}?bookingId=${encodeURIComponent(bookingId)}`;

  try {
    const intention = await api.createIntention({
      amount: amountCents,
      currency: 'EGP',
      payment_methods: config.paymob.paymentMethodIds,
      billing_data,
      merchant_order_id: merchantOrderId,
      special_reference: merchantOrderId,
      notification_url: notificationUrl,
      redirection_url: redirectionUrl,
      extras: { payment_id: payment.id },
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        paymobIntentionId: intention.id,
        paymobClientSecret: intention.client_secret,
      },
    });

    return {
      paymentId: payment.id,
      clientSecret: intention.client_secret,
      publicKey: config.paymob.publicKey,
      intentionId: intention.id,
    };
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'Paymob intention request failed.';
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: message,
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
        paymobIntentionId: null,
      },
    });
    throw err;
  }
}

/** Poll Paymob for the latest intention state after the customer returns from checkout. */
export async function syncPaymobPaymentForBooking(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<void> {
  if (!config.paymob.enabled) return;

  const user = await getUserByUid(decoded.uid);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: { payment: true },
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');

  const payment = booking.payment;
  if (!payment || payment.deletedAt || payment.status !== PaymentStatus.PENDING) return;
  if (!payment.paymobClientSecret) return;

  const api = createPaymobApiClient(config.paymob.secretKey, config.paymob.apiBaseUrl);
  const element = await api.getIntentionElement(config.paymob.publicKey, payment.paymobClientSecret);
  const mapped = mapIntentionElement(element);

  if (mapped === 'captured') {
    const txns = element.transactions ?? [];
    let tid: string | null = null;
    for (let i = txns.length - 1; i >= 0; i--) {
      const rawId: unknown = txns[i]!['id'];
      if (typeof rawId === 'number') {
        tid = String(rawId);
        break;
      }
      if (typeof rawId === 'string' && rawId.length > 0) {
        tid = rawId;
        break;
      }
    }
    await finalizePaymentCaptured(payment.id, tid);
    return;
  }

  if (mapped === 'failed') {
    await finalizePaymentFailed(payment.id, 'Paymob reported a failed payment.');
  }
}

/**
 * Handles Paymob `notification_url` callbacks. Responds with whether the payload was authenticated
 * and processed (terminal states update the DB; pending transactions are acknowledged only).
 */
export async function processPaymobWebhook(params: {
  rawBody: unknown;
  hmacHex: string | undefined;
}): Promise<{ accepted: boolean }> {
  if (!config.paymob.enabled) {
    throw new AppError('Paymob not configured', 503);
  }

  const hmacHex = params.hmacHex?.trim();
  if (!hmacHex) {
    return { accepted: false };
  }

  const txnObj = extractPaymobTransactionObject(params.rawBody);
  if (!txnObj) {
    return { accepted: false };
  }
  const txn = txnObj as unknown as PaymobTransactionDto;

  const hmacPayload = coerceTransactionHmacPayload(txn);

  const plain = buildTransactionHmacPlaintext(hmacPayload);
  if (!verifyPaymobTransactionHmac(plain, hmacHex, config.paymob.hmacSecret)) {
    return { accepted: false };
  }

  const paymentId = extractMerchantPaymentId(txn);
  if (!paymentId) {
    return { accepted: false };
  }

  const paymobTxnId = txn.id;

  if (transactionSuccess(txn)) {
    await finalizePaymentCaptured(paymentId, String(paymobTxnId));
    return { accepted: true };
  }

  if (transactionFailed(txn)) {
    await finalizePaymentFailed(paymentId, failureReasonFromTxn(txn));
    return { accepted: true };
  }

  return { accepted: true };
}

/** DB-driven reconciliation for intentions that never received a trusted webhook. */
export async function reconcileStalePaymobPayments(): Promise<void> {
  if (!config.paymob.enabled) return;

  const now = new Date();
  const rows = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      status: PaymentStatus.PENDING,
      paymobNextReconcileAt: { lte: now },
      paymobClientSecret: { not: null },
    },
    take: 50,
    orderBy: { paymobNextReconcileAt: 'asc' },
  });

  const api = createPaymobApiClient(config.paymob.secretKey, config.paymob.apiBaseUrl);

  for (const p of rows) {
    if (!p.paymobClientSecret) continue;

    try {
      const element = await api.getIntentionElement(config.paymob.publicKey, p.paymobClientSecret);
      const mapped = mapIntentionElement(element);

      if (mapped === 'captured') {
        const txns = element.transactions ?? [];
        let tid: string | null = null;
        for (let i = txns.length - 1; i >= 0; i--) {
          const rawId: unknown = txns[i]!['id'];
          if (typeof rawId === 'number') {
            tid = String(rawId);
            break;
          }
          if (typeof rawId === 'string' && rawId.length > 0) {
            tid = rawId;
            break;
          }
        }
        await finalizePaymentCaptured(p.id, tid);
        continue;
      }

      if (mapped === 'failed') {
        await finalizePaymentFailed(p.id, 'Paymob reported a failed payment.');
        continue;
      }

      const nextAttempt = p.paymobReconcileAttempt + 1;
      if (nextAttempt >= PAYMOB_RECONCILE_OFFSETS_MS.length) {
        await finalizePaymentTimeout(p.id);
        continue;
      }

      const anchor = p.paymobReconcileAnchorAt ?? p.createdAt;
      const offsetMs = PAYMOB_RECONCILE_OFFSETS_MS.at(nextAttempt)!;
      const nextAt = new Date(anchor.getTime() + offsetMs);
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          paymobReconcileAttempt: nextAttempt,
          paymobNextReconcileAt: nextAt,
        },
      });
    } catch {
      // Transient Paymob/network errors: leave nextReconcileAt unchanged; the tick will retry.
    }
  }
}

export function startPaymobReconciliationScheduler(): void {
  if (!config.paymob.enabled || config.nodeEnv === 'test') return;

  const tick = () => {
    void reconcileStalePaymobPayments();
  };

  setInterval(tick, 15_000);
  setTimeout(tick, 5_000);
}
