import { BookingStatus, PaymentPurpose, PaymentStatus } from '@prisma/client';
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
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import {
  extractLatestTransactionId,
  mapIntentionElement,
} from '@backend/lib/paymob/intention';
import {
  PAYMOB_INTENTION_TTL_MS,
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
import {
  finalizePackagePaymentCaptured,
  finalizePackagePaymentFailed,
} from '@backend/services/package-payment.service';

const PAYMENT_TIMEOUT_REASON = 'Payment timed out waiting for Paymob confirmation.';

/**
 * Which settlement handler owns a payment. PACKAGE payments are settled by
 * package-payment.service (owner's design decision); without this dispatch they
 * would fall into finalizePaymentCaptured's null-bookingId guard and be
 * logged-and-dropped, so the parent would pay and never receive their hours.
 */
async function getPaymentPurpose(paymentId: number): Promise<PaymentPurpose | null> {
  const row = await prisma.payment.findFirst({
    where: { id: paymentId, deletedAt: null },
    select: { purpose: true },
  });
  return row?.purpose ?? null;
}

async function getUserByUid(uid: string) {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

function failureReasonFromTxn(txn: PaymobTransactionDto): string {
  return txn.data?.message || 'Payment declined';
}

async function finalizePaymentCaptured(paymentId: number, paymobTransactionId: string | null) {
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

    // This webhook path only ever finalizes booking payments (package-purchase
    // payments, once introduced, are settled by a separate handler) — but
    // guard defensively rather than crash, since bookingId is now nullable.
    if (!payment.bookingId) {
      // eslint-disable-next-line no-console
      console.warn('[paymob] captured payment has no bookingId', { paymentId });
      return null;
    }

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

async function finalizePaymentFailed(paymentId: number, reason: string) {
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

async function finalizePaymentTimeout(paymentId: number) {
  await finalizePaymentFailed(paymentId, PAYMENT_TIMEOUT_REASON);
}

/** Paymob merchant order id — payment row id on first attempt, suffixed on retries. */
function buildPaymobMerchantOrderId(paymentId: number, attempt: number): string {
  if (attempt <= 1) return `${paymentId}`;
  return `${paymentId}-r${attempt}`;
}

export async function createPaymobIntentionForBooking(
  decoded: DecodedIdToken,
  bookingId: number,
  body: CreatePaymobIntentionRequest,
): Promise<{
  paymentId: number;
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
    include: { payments: { where: { deletedAt: null }, orderBy: { id: 'desc' } } },
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

  const attempts = booking.payments;
  if (attempts.some((p) => p.status === PaymentStatus.CAPTURED)) {
    throw errors.badRequest('This booking is already paid.');
  }

  const latest = attempts[0];
  if (
    latest &&
    latest.status === PaymentStatus.PENDING &&
    latest.paymobClientSecret &&
    latest.paymobIntentionId
  ) {
    // Resuming the SAME attempt while its hosted link is still fresh. Paymob
    // expires the link a couple of hours out, so once it is older than
    // PAYMOB_INTENTION_TTL_MS we fall through and open a new attempt with a
    // working link. paymobReconcileAnchorAt is the intention creation time;
    // createdAt is a safe fallback for legacy rows.
    const intentionCreatedAt = latest.paymobReconcileAnchorAt ?? latest.createdAt;
    if (Date.now() - intentionCreatedAt.getTime() < PAYMOB_INTENTION_TTL_MS) {
      return {
        paymentId: latest.id,
        clientSecret: latest.paymobClientSecret,
        publicKey: config.paymob.publicKey,
        intentionId: latest.paymobIntentionId,
      };
    }
  }

  const anchor = new Date();
  const nextReconcile = new Date(anchor.getTime() + PAYMOB_RECONCILE_OFFSETS_MS[0]);
  const notificationUrl = `${config.paymob.publicApiUrl}${PAYMOB_WEBHOOK_PATH}`;

  const nextIntentionAttempt = (latest?.paymobIntentionAttempt ?? 0) + 1;

  // Retire any still-PENDING attempt so the reconciler stops polling the link
  // the parent has abandoned in favour of this new one.
  await prisma.payment.updateMany({
    where: { bookingId, status: PaymentStatus.PENDING, deletedAt: null },
    data: {
      status: PaymentStatus.FAILED,
      failureReason: 'Superseded by a new payment attempt.',
      paymobNextReconcileAt: null,
      paymobClientSecret: null,
    },
  });

  // Every attempt is its own record — a declined card keeps its FAILED row and
  // this insert starts a clean one, so the history is never overwritten.
  const payment = await prisma.payment.create({
    data: {
      bookingId,
      motherId: user.id,
      amount: booking.totalAmount,
      currency: 'EGP',
      method: body.method,
      status: PaymentStatus.PENDING,
      paymobIntentionAttempt: nextIntentionAttempt,
      paymobReconcileAnchorAt: anchor,
      paymobReconcileAttempt: 0,
      paymobNextReconcileAt: nextReconcile,
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
      extras: { payment_id: String(payment.id) },
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
  bookingId: number,
): Promise<void> {
  if (!config.paymob.enabled) return;

  const user = await getUserByUid(decoded.uid);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: { payments: { where: { deletedAt: null }, orderBy: { id: 'desc' } } },
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');

  const payment = booking.payments[0];
  if (!payment || payment.status !== PaymentStatus.PENDING) return;
  if (!payment.paymobClientSecret) return;

  const api = createPaymobApiClient(config.paymob.secretKey, config.paymob.apiBaseUrl);
  const element = await api.getIntentionElement(config.paymob.publicKey, payment.paymobClientSecret);
  const mapped = mapIntentionElement(element);

  if (mapped === 'captured') {
    await finalizePaymentCaptured(payment.id, extractLatestTransactionId(element));
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
    const purpose = await getPaymentPurpose(paymentId);
    if (purpose === PaymentPurpose.PACKAGE) {
      await finalizePackagePaymentCaptured(paymentId, String(paymobTxnId));
    } else {
      await finalizePaymentCaptured(paymentId, String(paymobTxnId));
    }
    return { accepted: true };
  }

  if (transactionFailed(txn)) {
    const purpose = await getPaymentPurpose(paymentId);
    const reason = failureReasonFromTxn(txn);
    if (purpose === PaymentPurpose.PACKAGE) {
      await finalizePackagePaymentFailed(paymentId, reason);
    } else {
      await finalizePaymentFailed(paymentId, reason);
    }
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

      // The row is already loaded, so purpose dispatch needs no extra query here.
      const isPackage = p.purpose === PaymentPurpose.PACKAGE;

      if (mapped === 'captured') {
        const tid = extractLatestTransactionId(element);
        if (isPackage) {
          await finalizePackagePaymentCaptured(p.id, tid);
        } else {
          await finalizePaymentCaptured(p.id, tid);
        }
        continue;
      }

      if (mapped === 'failed') {
        const reason = 'Paymob reported a failed payment.';
        if (isPackage) {
          await finalizePackagePaymentFailed(p.id, reason);
        } else {
          await finalizePaymentFailed(p.id, reason);
        }
        continue;
      }

      const nextAttempt = p.paymobReconcileAttempt + 1;
      if (nextAttempt >= PAYMOB_RECONCILE_OFFSETS_MS.length) {
        if (isPackage) {
          await finalizePackagePaymentFailed(p.id, PAYMENT_TIMEOUT_REASON);
        } else {
          await finalizePaymentTimeout(p.id);
        }
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
