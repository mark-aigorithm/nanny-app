/**
 * A7 — extending a booking that is already under way.
 *
 * The parent asks, the nanny answers, and only then is there anything to pay
 * for: the money hop is gated on ACCEPTED, so a request the nanny declined or
 * ignored can never be charged. The booking's end time moves only once the
 * extension is paid.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny } from '../../../test/factories';
import {
  checkIn,
  claimBooking,
  createBookingViaApi,
  shiftWindowToNow,
  widenBookingWindow,
} from '../../../test/journeys/booking';
import { createCheckoutSession, payViaPaymob } from '../../../test/journeys/payment';

/** A paid booking that has been checked into — the only state extendable. */
async function bookingUnderWay() {
  // A booking under way sits over the real "now", so its extension would run
  // past the 06:00–22:00 window whenever the suite runs late in the day. Open
  // the window so these assertions are about extensions, not the clock.
  await widenBookingWindow();

  const mother = await makeMother();
  const nanny = await makeNanny();

  const booking = await createBookingViaApi(mother.token, { durationHours: 4 });
  await claimBooking(nanny.token, booking.id);
  await payViaPaymob(mother.token, 'booking', booking.id);
  await shiftWindowToNow(booking.id, 4);
  await checkIn(mother.token, nanny.token, booking.id);

  return { mother, nanny, booking };
}

async function requestExtension(motherToken: string, bookingId: number, hours = 2) {
  const response = await request(app)
    .post(`/bookings/${bookingId}/extensions`)
    .set(...authHeader(motherToken))
    .send({ hours });
  return response;
}

describe('A7 — mid-care extension', () => {
  it('runs request → accept → pay and moves the end time', async () => {
    const { mother, nanny, booking } = await bookingUnderWay();

    const before = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

    const requested = await requestExtension(mother.token, booking.id, 2);
    expect(requested.status).toBe(201);
    const extensionId = requested.body.data.id as number;

    expect(
      (await prisma.bookingExtension.findUniqueOrThrow({ where: { id: extensionId } })).status,
    ).toBe('PENDING_NANNY');

    // Until the nanny agrees, there is nothing to charge for.
    const premature = await request(app)
      .post(`/bookings/extensions/${extensionId}/pay/paymob`)
      .set(...authHeader(mother.token))
      .send({ method: 'CARD' });
    expect(premature.status).toBe(400);

    const accepted = await request(app)
      .post(`/bookings/extensions/${extensionId}/accept`)
      .set(...authHeader(nanny.token));
    expect(accepted.status).toBe(200);
    expect(
      (await prisma.bookingExtension.findUniqueOrThrow({ where: { id: extensionId } })).status,
    ).toBe('ACCEPTED');

    // The booking is untouched until the money lands.
    const stillOriginal = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stillOriginal.endTime.getTime()).toBe(before.endTime.getTime());

    await payViaPaymob(mother.token, 'extension', extensionId);

    const paid = await prisma.bookingExtension.findUniqueOrThrow({ where: { id: extensionId } });
    expect(paid.status).toBe('PAID');

    const extended = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // The new end is derived through a wall-clock string, which carries only
    // seconds, so the millisecond part of the original end is dropped. What
    // matters is that it moved by two hours, not that it kept sub-second noise.
    const movedByMs = extended.endTime.getTime() - before.endTime.getTime();
    expect(movedByMs).toBeGreaterThan(2 * 3_600_000 - 1000);
    expect(movedByMs).toBeLessThanOrEqual(2 * 3_600_000);
    expect(Number(extended.durationHours)).toBe(6);
  });

  it('leaves the booking alone when the nanny declines', async () => {
    const { mother, nanny, booking } = await bookingUnderWay();
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

    const requested = await requestExtension(mother.token, booking.id);
    const extensionId = requested.body.data.id as number;

    const declined = await request(app)
      .post(`/bookings/extensions/${extensionId}/decline`)
      .set(...authHeader(nanny.token));
    expect(declined.status).toBe(200);

    expect(
      (await prisma.bookingExtension.findUniqueOrThrow({ where: { id: extensionId } })).status,
    ).toBe('DECLINED');

    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.endTime.getTime()).toBe(before.endTime.getTime());

    // A declined request must not be payable.
    await expect(
      createCheckoutSession(mother.token, 'extension', extensionId),
    ).rejects.toThrow(/400/);
  });

  it('lets the parent withdraw a request before it is answered', async () => {
    const { mother, booking } = await bookingUnderWay();

    const requested = await requestExtension(mother.token, booking.id);
    const extensionId = requested.body.data.id as number;

    const cancelled = await request(app)
      .post(`/bookings/extensions/${extensionId}/cancel`)
      .set(...authHeader(mother.token));
    expect(cancelled.status).toBe(200);

    expect(
      (await prisma.bookingExtension.findUniqueOrThrow({ where: { id: extensionId } })).status,
    ).toBe('CANCELLED');
  });

  it('allows only one open request per booking', async () => {
    const { mother, booking } = await bookingUnderWay();

    expect((await requestExtension(mother.token, booking.id)).status).toBe(201);

    const second = await requestExtension(mother.token, booking.id);
    expect(second.status).toBe(409);
  });

  it('refuses to extend a booking that is not under way', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();

    // Paid and CONFIRMED, but nobody has checked in yet.
    const booking = await createBookingViaApi(mother.token);
    await claimBooking(nanny.token, booking.id);
    await payViaPaymob(mother.token, 'booking', booking.id);

    const response = await requestExtension(mother.token, booking.id);
    expect(response.status).toBe(400);
  });

  it('refuses an unsupported extension length', async () => {
    const { mother, booking } = await bookingUnderWay();

    // Only the 1/2/3-hour presets are offered.
    const response = await requestExtension(mother.token, booking.id, 7);
    expect(response.status).toBe(400);
  });
});
