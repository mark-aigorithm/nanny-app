import { PaymentMethod, PaymentPurpose, PaymentStatus } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { AppError, errors } from '@backend/lib/errors';
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
import type { DecodedIdToken } from '@backend/lib/firebase';
import { creditPurchaseHours } from '@backend/services/package-hours.service';

/**
 * Settlement handler for PACKAGE-purpose payments — a deliberately separate
 * handler from paymob.service.ts's booking settlement (finalizePaymentCaptured),
 * per the owner's design decision. paymob.service.ts dispatches into this module
 * by `purpose` at every entry point that can capture or fail a payment
 * (processPaymobWebhook, reconcileStalePaymobPayments); without that dispatch a
 * PACKAGE capture would hit finalizePaymentCaptured's null-bookingId guard and
 * be logged-and-dropped forever.
 */

async function getUserByUid(uid: string) {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

/** Paymob merchant order id — payment row id on first attempt, suffixed on retries. */
function buildPaymobMerchantOrderId(paymentId: number, attempt: number): string {
  if (attempt <= 1) return `${paymentId}`;
  return `${paymentId}-r${attempt}`;
}

/**
 * Idempotent: the `status: PENDING` filter means a replayed webhook (or a
 * second reconcile pass) finds no row on the second call and returns —
 * `creditPurchaseHours` is itself idempotent on PENDING_PAYMENT, giving
 * belt-and-braces.
 */
export async function finalizePackagePaymentCaptured(
  paymentId: number,
  paymobTransactionId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, deletedAt: null, status: PaymentStatus.PENDING, purpose: PaymentPurpose.PACKAGE },
    });
    if (!payment || !payment.packagePurchaseId) return; // idempotent: already settled or not ours

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

    // The payment above is now CAPTURED, so creditPurchaseHours' own
    // captured-payment gate passes and the purchase activates.
    const outcome = await creditPurchaseHours(tx, payment.packagePurchaseId);
    if (outcome === 'SLOT_TAKEN') {
      // The parent already holds an active package, so this purchase cannot be
      // activated. The payment stays CAPTURED — the money was taken and must not
      // be erased by rolling back — and the purchase stays PENDING_PAYMENT for a
      // human to refund or activate once the current package clears.
      // eslint-disable-next-line no-console
      console.error('[packages] captured payment could not be activated: active slot taken', {
        paymentId,
        purchaseId: payment.packagePurchaseId,
      });
    }
  });
}

/**
 * Mirrors finalizePaymentFailed, scoped to PACKAGE payments. The purchase row
 * is left in PENDING_PAYMENT — it never becomes ACTIVE, so no hours are
 * granted and the single-active-package rule is never tripped by an
 * abandoned/declined attempt.
 */
export async function finalizePackagePaymentFailed(paymentId: number, reason: string): Promise<void> {
  await prisma.payment.updateMany({
    where: { id: paymentId, deletedAt: null, status: PaymentStatus.PENDING, purpose: PaymentPurpose.PACKAGE },
    data: {
      status: PaymentStatus.FAILED,
      failureReason: reason,
      paymobNextReconcileAt: null,
      paymobClientSecret: null,
    },
  });
}

/** Mirrors createPaymobIntentionForBooking, keyed on a package purchase instead of a booking. */
export async function createPaymobIntentionForPackagePurchase(
  decoded: DecodedIdToken,
  purchaseId: number,
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
  if (!user.phone) {
    throw errors.badRequest('Add a phone number to your profile before paying.');
  }

  const purchase = await prisma.packagePurchase.findUnique({
    where: { id: purchaseId, deletedAt: null },
    include: { payments: { where: { deletedAt: null }, orderBy: { id: 'desc' } } },
  });
  if (!purchase) throw errors.notFound('Package purchase not found.');
  if (purchase.userId !== user.id) throw errors.forbidden('Access denied.');
  if (purchase.status !== 'PENDING_PAYMENT') {
    throw errors.badRequest(`Cannot pay for a purchase in status ${purchase.status}.`);
  }

  const attempts = purchase.payments;
  if (attempts.some((p) => p.status === PaymentStatus.CAPTURED)) {
    throw errors.badRequest('This package purchase is already paid.');
  }

  const latest = attempts[0];
  if (
    latest &&
    latest.status === PaymentStatus.PENDING &&
    latest.paymobClientSecret &&
    latest.paymobIntentionId
  ) {
    // Resuming the SAME attempt, not starting a new one: while the hosted link
    // is still alive, hand back the existing session rather than minting another
    // payment row. paymobReconcileAnchorAt is the intention creation time;
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

  // Attempts are numbered off the history, so the Paymob merchant order id stays
  // unique across retries even though each attempt is now its own row.
  const nextIntentionAttempt = (latest?.paymobIntentionAttempt ?? 0) + 1;

  // Retire any still-PENDING attempt before opening a new one. Left alone it
  // would keep its clientSecret and go on being polled by the reconciler,
  // competing with the attempt the parent is actually looking at.
  await prisma.payment.updateMany({
    where: {
      packagePurchaseId: purchaseId,
      status: PaymentStatus.PENDING,
      deletedAt: null,
    },
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
      packagePurchaseId: purchaseId,
      motherId: user.id,
      purpose: PaymentPurpose.PACKAGE,
      amount: Number(purchase.pricePaid),
      currency: 'EGP',
      // The unified-checkout hosted page lets the parent choose card/wallet/etc.
      // itself; unlike bookings there is no separate method param here.
      method: PaymentMethod.CARD,
      status: PaymentStatus.PENDING,
      paymobIntentionAttempt: nextIntentionAttempt,
      paymobReconcileAnchorAt: anchor,
      paymobReconcileAttempt: 0,
      paymobNextReconcileAt: nextReconcile,
    },
  });

  const merchantOrderId = buildPaymobMerchantOrderId(payment.id, nextIntentionAttempt);

  const amountCents = Math.round(Number(purchase.pricePaid) * 100);
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

  const redirectionUrl = `${config.paymob.publicApiUrl}${PAYMOB_RETURN_PATH}?purchaseId=${encodeURIComponent(purchaseId)}`;

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

/** Poll Paymob for the latest intention state after the parent returns from checkout. */
export async function syncPaymobPaymentForPackagePurchase(
  decoded: DecodedIdToken,
  purchaseId: number,
): Promise<{ status: PaymentStatus }> {
  const user = await getUserByUid(decoded.uid);

  const purchase = await prisma.packagePurchase.findUnique({
    where: { id: purchaseId, deletedAt: null },
    include: {
      // Newest first — the parent just came back from the latest attempt's
      // checkout, so that is the one whose outcome we poll for.
      payments: { where: { deletedAt: null }, orderBy: { id: 'desc' }, take: 1 },
    },
  });
  if (!purchase) throw errors.notFound('Package purchase not found.');
  if (purchase.userId !== user.id) throw errors.forbidden('Access denied.');

  const payment = purchase.payments[0];
  if (!payment) throw errors.notFound('No payment found for this purchase.');

  if (!config.paymob.enabled) return { status: payment.status };
  if (payment.status !== PaymentStatus.PENDING) return { status: payment.status };
  if (!payment.paymobClientSecret) return { status: payment.status };

  const api = createPaymobApiClient(config.paymob.secretKey, config.paymob.apiBaseUrl);
  const element = await api.getIntentionElement(config.paymob.publicKey, payment.paymobClientSecret);
  const mapped = mapIntentionElement(element);

  if (mapped === 'captured') {
    const tid = extractLatestTransactionId(element);
    await finalizePackagePaymentCaptured(payment.id, tid);
    return { status: PaymentStatus.CAPTURED };
  }

  if (mapped === 'failed') {
    await finalizePackagePaymentFailed(payment.id, 'Paymob reported a failed payment.');
    return { status: PaymentStatus.FAILED };
  }

  return { status: PaymentStatus.PENDING };
}
