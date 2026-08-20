/**
 * Proves the journey toolkit end to end before any real journey relies on it.
 *
 * One booking travels the whole modern lifecycle —
 *   PENDING → APPROVED → CONFIRMED → IN_PROGRESS → COMPLETED
 * — where every hop is made by the same actor production uses: the admin
 * approves through the admin route, the mother pays through a real Paymob
 * intention settled by the fake's signed webhook, the nanny checks in with the
 * parent's PIN and checks out. If this passes, a journey spec's failure can be
 * read as a product defect, not as toolkit plumbing.
 */
import { PaymentStatus } from '@prisma/client';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeBooking, makeMother, makeNanny, makeSuperuser } from '../../../test/factories';
import { approveBooking } from '../../../test/journeys/admin';
import { payViaPaymob } from '../../../test/journeys/payment';

/** The lifecycle needs a window that contains "now": check-in opens 15 minutes before start. */
function immediateWindow() {
  const now = Date.now();
  return {
    startTime: new Date(now - 5 * 60_000),
    endTime: new Date(now + 4 * 60 * 60_000),
  };
}

async function bookingStatus(id: number): Promise<string> {
  const row = await prisma.booking.findUniqueOrThrow({ where: { id }, select: { status: true } });
  return row.status;
}

describe('journey toolkit', () => {
  it('drives a booking through the full lifecycle', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const admin = await makeSuperuser();

    const booking = await makeBooking({
      motherId: mother.id,
      nannyProfileId: nanny.nannyProfileId,
      data: immediateWindow(),
    });
    expect(await bookingStatus(booking.id)).toBe('PENDING');

    // Admin approves through the real console route.
    await approveBooking(admin.token, booking.id);
    expect(await bookingStatus(booking.id)).toBe('APPROVED');

    // Mother pays: backend intention → fake checkout → signed webhook.
    const session = await payViaPaymob(mother.token, 'booking', booking.id);
    expect(await bookingStatus(booking.id)).toBe('CONFIRMED');

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: session.paymentId },
    });
    expect(payment.status).toBe(PaymentStatus.CAPTURED);
    expect(Number(payment.amount)).toBe(Number(booking.totalAmount));

    // Parent reveals the start PIN…
    const pinResponse = await request(app)
      .post(`/bookings/${booking.id}/start-pin`)
      .set(...authHeader(mother.token));
    expect(pinResponse.status).toBe(200);
    const { pin } = pinResponse.body.data as { pin: string };
    expect(pin).toMatch(/^\d{4}$/);

    // …and the nanny checks in with it.
    const checkIn = await request(app)
      .post(`/bookings/${booking.id}/check-in`)
      .set(...authHeader(nanny.token))
      .send({ pin });
    expect(checkIn.status).toBe(200);
    expect(await bookingStatus(booking.id)).toBe('IN_PROGRESS');

    const checkOut = await request(app)
      .post(`/bookings/${booking.id}/check-out`)
      .set(...authHeader(nanny.token));
    expect(checkOut.status).toBe(200);
    expect(await bookingStatus(booking.id)).toBe('COMPLETED');
  });
});
