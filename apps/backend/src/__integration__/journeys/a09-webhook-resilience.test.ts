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
import { makeMother, makeNanny } from '../../../test/factories';
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
});
