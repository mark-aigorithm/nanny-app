/**
 * A9 — the payment callback path under adverse conditions.
 *
 * Money arrives out-of-band, so the three cases that decide whether a booking
 * can be trusted are: the webhook never arrives, it arrives twice, and it
 * arrives forged. Only a real HMAC path can prove any of them, which is why
 * these run against the fake's genuine signatures rather than stubs.
 */
import { PaymentStatus } from '@prisma/client';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny, makeSuperuser } from '../../../test/factories';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';
import {
  createCheckoutSession,
  deliverPaymobWebhook,
  settleCheckout,
} from '../../../test/journeys/payment';

/** An APPROVED booking with an open Paymob intention, ready to be settled. */
async function bookingAwaitingCallback() {
  const mother = await makeMother();
  const nanny = await makeNanny();

  const booking = await createBookingViaApi(mother.token);
  await claimBooking(nanny.token, booking.id);
  const session = await createCheckoutSession(mother.token, 'booking', booking.id);

  return { mother, nanny, booking, session };
}

function statusOf(id: number) {
  return prisma.booking
    .findUniqueOrThrow({ where: { id }, select: { status: true } })
    .then((row) => row.status);
}

describe('A9 — payment webhook resilience', () => {
  it('reconciles a dropped webhook through the sync endpoint', async () => {
    const { mother, booking, session } = await bookingAwaitingCallback();

    // The customer paid, but the callback never reached us.
    await settleCheckout(session.clientSecret, { deliverWebhook: false });
    expect(await statusOf(booking.id)).toBe('APPROVED');

    // The app polls when the checkout WebView returns.
    const sync = await request(app)
      .post(`/bookings/${booking.id}/pay/paymob/sync`)
      .set(...authHeader(mother.token));
    expect(sync.status).toBe(200);

    expect(await statusOf(booking.id)).toBe('CONFIRMED');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe(PaymentStatus.CAPTURED);
  });

  it('treats a replayed webhook as a no-op', async () => {
    const { booking, session } = await bookingAwaitingCallback();

    const { hmac, body } = await settleCheckout(session.clientSecret);
    expect(await statusOf(booking.id)).toBe('CONFIRMED');

    // Paymob retries on any non-200; the second delivery must change nothing.
    expect(await deliverPaymobWebhook(hmac, body)).toBe(200);

    expect(await statusOf(booking.id)).toBe('CONFIRMED');
    const captured = await prisma.payment.findMany({
      where: { bookingId: booking.id, status: PaymentStatus.CAPTURED },
    });
    expect(captured).toHaveLength(1);
  });

  it('rejects a forged signature and leaves the booking unpaid', async () => {
    const { booking, session } = await bookingAwaitingCallback();

    const { body } = await settleCheckout(session.clientSecret, { deliverWebhook: false });

    // Same length as a real SHA-512 digest, so it fails on comparison rather
    // than on the cheap length check.
    expect(await deliverPaymobWebhook('a'.repeat(128), body)).toBe(401);

    expect(await statusOf(booking.id)).toBe('APPROVED');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe(PaymentStatus.PENDING);
  });

  it('rejects a webhook carrying no signature at all', async () => {
    const { session } = await bookingAwaitingCallback();
    const { body } = await settleCheckout(session.clientSecret, { deliverWebhook: false });

    const response = await request(app).post('/webhooks/paymob').send(body as object);
    expect(response.status).toBe(401);
  });

  it('records a declined payment without confirming the booking', async () => {
    const { booking, session } = await bookingAwaitingCallback();

    await settleCheckout(session.clientSecret, { success: false });

    expect(await statusOf(booking.id)).toBe('APPROVED');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe(PaymentStatus.FAILED);
  });

  it('records a payment that arrives after we gave up on the checkout', async () => {
    const { booking, session } = await bookingAwaitingCallback();
    const { hmac, body } = await settleCheckout(session.clientSecret, { deliverWebhook: false });

    // The reconciler timed the attempt out a few minutes in — but its Paymob
    // link was still payable, and she paid on it.
    await prisma.payment.update({
      where: { id: session.paymentId },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'Payment timed out waiting for Paymob confirmation.',
        paymobClientSecret: null,
        paymobNextReconcileAt: null,
      },
    });

    expect(await deliverPaymobWebhook(hmac, body)).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe(PaymentStatus.CAPTURED);
    expect(await statusOf(booking.id)).toBe('CONFIRMED');
  });

  it('records a second payment on a booking that is already paid, and tells the team and her', async () => {
    const { mother, booking, session: first } = await bookingAwaitingCallback();
    const admin = await makeSuperuser();

    // The first checkout goes stale, so opening it again starts a new attempt
    // and retires the old one — whose link is still payable.
    await prisma.payment.update({
      where: { id: first.paymentId },
      data: { paymobReconcileAnchorAt: new Date(Date.now() - 2 * 3_600_000) },
    });
    const second = await createCheckoutSession(mother.token, 'booking', booking.id);
    expect(second.paymentId).not.toBe(first.paymentId);

    await settleCheckout(second.clientSecret);
    expect(await statusOf(booking.id)).toBe('CONFIRMED');

    // She pays on the old link too.
    await settleCheckout(first.clientSecret);

    const captured = await prisma.payment.count({
      where: { bookingId: booking.id, status: PaymentStatus.CAPTURED },
    });
    expect(captured).toBe(2);
    expect(await statusOf(booking.id)).toBe('CONFIRMED');

    expect(
      await prisma.notification.count({
        where: { userId: admin.id, referenceId: booking.id, title: 'Duplicate payment on a booking' },
      }),
    ).toBe(1);
    const toMother = await prisma.notification.findFirst({
      where: { userId: mother.id, referenceId: booking.id, title: 'A second payment was received' },
    });
    expect(toMother?.body).not.toMatch(/refund/i);

    // The console sees the extra money as an overpayment it can give back.
    const detail = await request(app)
      .get(`/admin/bookings/${booking.id}`)
      .set(...authHeader(admin.token));
    expect(detail.body.data.refundKind).toBe('OVERPAID');
    expect(detail.body.data.refundableAmount).toBe(Number(booking.totalAmount));
  });

  it('refuses a genuine signed callback pointed at a different payment', async () => {
    const cheap = await bookingAwaitingCallback();
    // A longer booking, so its payment is for a different amount.
    const mother = await makeMother();
    const nanny = await makeNanny();
    const dear = await createBookingViaApi(mother.token, { durationHours: 6 });
    await claimBooking(nanny.token, dear.id);
    const dearSession = await createCheckoutSession(mother.token, 'booking', dear.id);

    const { hmac, body } = await settleCheckout(cheap.session.clientSecret, { deliverWebhook: false });

    // Every field that names our payment is outside the signature — point them
    // all at the other payment and replay the genuine signature.
    const swapped = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    const txn = (swapped['obj'] ?? swapped) as Record<string, unknown>;
    const ref = String(dearSession.paymentId);
    txn['special_reference'] = ref;
    txn['extras'] = { payment_id: ref };
    (txn['order'] as Record<string, unknown>)['merchant_order_id'] = ref;

    expect(await deliverPaymobWebhook(hmac, swapped)).toBe(401);

    const target = await prisma.payment.findUniqueOrThrow({ where: { id: dearSession.paymentId } });
    expect(target.status).toBe(PaymentStatus.PENDING);
    expect(await statusOf(dear.id)).toBe('APPROVED');
  });

  it('answers a malformed body with a refusal, not a server error', async () => {
    const empty = await request(app).post('/webhooks/paymob').query({ hmac: 'a'.repeat(128) }).send({});
    expect(empty.status).toBe(401);

    const noOrder = await request(app)
      .post('/webhooks/paymob')
      .query({ hmac: 'a'.repeat(128) })
      .send({ type: 'TRANSACTION', obj: { id: 1, success: true, pending: false } });
    expect(noOrder.status).toBe(401);
  });
});
