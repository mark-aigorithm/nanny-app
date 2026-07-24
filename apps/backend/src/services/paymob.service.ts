import { BookingExtensionStatus, BookingStatus, PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';
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
import { applyPaidExtension } from '@backend/services/booking-extension.service';
import { redeemBookingPromoCodeOnCapture } from '@backend/services/promo-code.service';

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

    // Defensive gate: a booking is only ever CONFIRMED off a genuinely captured
    // payment. The capture above satisfies this on the normal path; the explicit
    // check keeps "CONFIRMED ⟹ a payment was captured" enforced even if capture
    // and confirm are ever split apart.
    const capturedPayment = await tx.payment.findFirst({
      where: { bookingId: booking.id, status: PaymentStatus.CAPTURED, deletedAt: null },
      select: { id: true },
    });
    if (!capturedPayment) {
      // eslint-disable-next-line no-console
      console.warn('[paymob] refusing to confirm a booking with no captured payment', {
        paymentId,
        bookingId: booking.id,
      });
      return null;
    }

    // The money is captured and the booking is about to be confirmed — this is
    // the only moment a reserved promo code is actually spent. Idempotent, so a
    // replayed webhook can't increment the code's usage twice.
    await redeemBookingPromoCodeOnCapture(tx, booking.id);

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

  return openIntention({
    user: { ...user, phone: user.phone },
    owner: { bookingId },
    purpose: PaymentPurpose.BOOKING,
    amount: booking.totalAmount,
    attempts,
    redirectionQuery: `bookingId=${encodeURIComponent(bookingId)}`,
    method: body.method,
  });
}

/**
 * Open (or resume) a Paymob intention for whatever a payment is FOR. Bookings
 * and mid-shift extensions differ only in the row that owns the payment and the
 * amount owed — every step below (resume a fresh attempt, retire an abandoned
 * one, insert a new attempt, call Paymob, unwind on failure) is identical, and
 * duplicating it per payment type is how the two would drift apart.
 */
async function openIntention(params: {
  user: { id: number; email: string; firstName: string; lastName: string; phone: string };
  owner: { bookingId: number } | { bookingExtensionId: number };
  purpose: PaymentPurpose;
  amount: Prisma.Decimal;
  attempts: { id: number; status: PaymentStatus; paymobClientSecret: string | null; paymobIntentionId: string | null; paymobIntentionAttempt: number; paymobReconcileAnchorAt: Date | null; createdAt: Date }[];
  redirectionQuery: string;
  method: CreatePaymobIntentionRequest['method'];
}): Promise<{
  paymentId: number;
  clientSecret: string;
  publicKey: string;
  intentionId: string;
}> {
  // Re-assert enablement here rather than trusting the caller: binding it to a
  // const and throwing on the disabled case narrows it to the configured shape
  // for the rest of the function.
  const paymob = config.paymob;
  if (!paymob.enabled) {
    throw errors.badRequest('Paymob is not configured on this server.');
  }
  const { user, owner, attempts } = params;

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
        publicKey: paymob.publicKey,
        intentionId: latest.paymobIntentionId,
      };
    }
  }

  const anchor = new Date();
  const nextReconcile = new Date(anchor.getTime() + PAYMOB_RECONCILE_OFFSETS_MS[0]);
  const notificationUrl = `${paymob.publicApiUrl}${PAYMOB_WEBHOOK_PATH}`;

  const nextIntentionAttempt = (latest?.paymobIntentionAttempt ?? 0) + 1;

  // Retire any still-PENDING attempt so the reconciler stops polling the link
  // the parent has abandoned in favour of this new one.
  await prisma.payment.updateMany({
    where: { ...owner, status: PaymentStatus.PENDING, deletedAt: null },
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
      ...owner,
      purpose: params.purpose,
      motherId: user.id,
      amount: params.amount,
      currency: 'EGP',
      method: params.method,
      status: PaymentStatus.PENDING,
      paymobIntentionAttempt: nextIntentionAttempt,
      paymobReconcileAnchorAt: anchor,
      paymobReconcileAttempt: 0,
      paymobNextReconcileAt: nextReconcile,
    },
  });

  const merchantOrderId = buildPaymobMerchantOrderId(payment.id, nextIntentionAttempt);

  const amountCents = Math.round(Number(params.amount) * 100);
  const api = createPaymobApiClient(paymob.secretKey, paymob.apiBaseUrl);

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

  const redirectionUrl = `${paymob.publicApiUrl}${PAYMOB_RETURN_PATH}?${params.redirectionQuery}`;

  try {
    const intention = await api.createIntention({
      amount: amountCents,
      currency: 'EGP',
      payment_methods: paymob.paymentMethodIds,
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
      publicKey: paymob.publicKey,
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

/**
 * Checkout for extra hours the nanny has already agreed to. The mother is only
 * ever sent here once the extension is ACCEPTED and still owes money — a
 * request the nanny hasn't answered has no agreed price to charge.
 */
export async function createPaymobIntentionForExtension(
  decoded: DecodedIdToken,
  extensionId: number,
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
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can pay for extra hours.');
  if (!user.phone) {
    throw errors.badRequest('Add a phone number to your profile before paying.');
  }

  const extension = await prisma.bookingExtension.findFirst({
    where: { id: extensionId, deletedAt: null },
    include: { payments: { where: { deletedAt: null }, orderBy: { id: 'desc' } } },
  });
  if (!extension) throw errors.notFound('Extension request not found.');
  if (extension.motherId !== user.id) throw errors.forbidden('Access denied.');

  if (extension.status !== BookingExtensionStatus.ACCEPTED) {
    throw errors.badRequest(
      `These extra hours can't be paid for — the request is ${extension.status.toLowerCase()}.`,
    );
  }
  if (extension.expiresAt.getTime() <= Date.now()) {
    throw errors.badRequest('This extension request has expired. Ask your nanny again.');
  }
  if (Number(extension.totalAmount) <= 0) {
    throw errors.badRequest('There is nothing to pay for this extension.');
  }

  const attempts = extension.payments;
  if (attempts.some((p) => p.status === PaymentStatus.CAPTURED)) {
    throw errors.badRequest('These extra hours are already paid for.');
  }

  return openIntention({
    user: { ...user, phone: user.phone },
    owner: { bookingExtensionId: extensionId },
    purpose: PaymentPurpose.BOOKING_EXTENSION,
    amount: extension.totalAmount,
    attempts,
    // Carries both ids so the app can land on the booking and know which
    // extension it just paid for.
    redirectionQuery: `bookingId=${encodeURIComponent(extension.bookingId)}&extensionId=${encodeURIComponent(extensionId)}`,
    method: body.method,
  });
}

/**
 * Settle a captured extension payment. Unlike a booking payment there is no
 * status transition to guard — `applyPaidExtension` owns that, and is itself
 * idempotent on the extension's status, so a replayed webhook is a no-op.
 */
async function finalizeExtensionPaymentCaptured(
  paymentId: number,
  paymobTransactionId: string | null,
) {
  const extensionId = await prisma.$transaction(async (tx) => {
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

    if (!payment.bookingExtensionId) {
      // eslint-disable-next-line no-console
      console.warn('[paymob] captured extension payment has no bookingExtensionId', { paymentId });
      return null;
    }
    return payment.bookingExtensionId;
  });

  if (extensionId != null) await applyPaidExtension(extensionId);
}

/**
 * Which settlement handler owns a payment purpose. A failed extension payment
 * needs no special handling — the row is marked FAILED like any other and the
 * extension stays ACCEPTED so the mother can retry until its deadline.
 */
function isExtensionPurpose(purpose: PaymentPurpose | null): boolean {
  return purpose === PaymentPurpose.BOOKING_EXTENSION;
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
    } else if (isExtensionPurpose(purpose)) {
      await finalizeExtensionPaymentCaptured(paymentId, String(paymobTxnId));
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
      const isExtension = isExtensionPurpose(p.purpose);

      if (mapped === 'captured') {
        const tid = extractLatestTransactionId(element);
        if (isPackage) {
          await finalizePackagePaymentCaptured(p.id, tid);
        } else if (isExtension) {
          await finalizeExtensionPaymentCaptured(p.id, tid);
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
