/**
 * A18 — the mother ends a running shift early.
 *
 * The other way a booking completes: not the nanny checking out, but the
 * parent closing the shift from her app. The booking is COMPLETED either way,
 * but the record must say which happened (`motherEndedAt` vs
 * `nannyCheckedOutAt`), the nanny must be told, and the money must not move —
 * the parent chose to stop early and the nanny turned up for the slot that was
 * booked. Only a shift that is actually under way can be ended this way.
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
  submitReview,
} from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

function endBooking(token: string, bookingId: number) {
  return request(app).post(`/bookings/${bookingId}/end`).set(...authHeader(token));
}

async function reload(id: number) {
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

/** A paid booking, either left CONFIRMED or checked in so it is IN_PROGRESS. */
async function paidBooking(options: { started: boolean }) {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const booking = await createBookingViaApi(mother.token);
  await claimBooking(nanny.token, booking.id);
  await payViaPaymob(mother.token, 'booking', booking.id);
  if (options.started) {
    await shiftWindowToNow(booking.id);
    await checkIn(mother.token, nanny.token, booking.id);
    expect((await reload(booking.id)).status).toBe('IN_PROGRESS');
  }
  return { mother, nanny, booking };
}

describe('A18 — ending a shift early', () => {
  it('completes the booking, records that the parent ended it, and tells the nanny', async () => {
    const { mother, nanny, booking } = await paidBooking({ started: true });
    const before = await reload(booking.id);

    const response = await endBooking(mother.token, booking.id);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('COMPLETED');

    const after = await reload(booking.id);
    expect(after.status).toBe('COMPLETED');
    expect(after.motherEndedAt).not.toBeNull();
    expect(after.nannyCheckedOutAt).toBeNull();

    // The hours she paid for are not refunded.
    expect(after.totalAmount).toEqual(before.totalAmount);
    expect(after.nannyAmount).toEqual(before.nannyAmount);
    expect(after.platformAmount).toEqual(before.platformAmount);

    const told = await prisma.notification.findFirst({
      where: { userId: nanny.id, type: 'BOOKING_ENDED_BY_PARENT', referenceId: booking.id },
    });
    expect(told).not.toBeNull();

    // A completed booking, however it completed, can be reviewed.
    await submitReview(mother.token, booking.id, 4);
  });

  it('is the parent’s action alone', async () => {
    const { nanny, booking } = await paidBooking({ started: true });
    const bystander = await makeMother();

    expect((await endBooking(nanny.token, booking.id)).status).toBe(403);
    expect((await endBooking(bystander.token, booking.id)).status).toBe(403);
    expect((await reload(booking.id)).status).toBe('IN_PROGRESS');
  });

  it('refuses a shift that has not started', async () => {
    const { mother, booking } = await paidBooking({ started: false });

    const response = await endBooking(mother.token, booking.id);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/under way/i);

    const row = await reload(booking.id);
    expect(row.status).toBe('CONFIRMED');
    expect(row.motherEndedAt).toBeNull();
  });

  it('cannot be ended twice, nor checked out after it has been ended', async () => {
    const { mother, nanny, booking } = await paidBooking({ started: true });
    await endBooking(mother.token, booking.id).expect(200);

    expect((await endBooking(mother.token, booking.id)).status).toBe(400);

    const checkOut = await request(app)
      .post(`/bookings/${booking.id}/check-out`)
      .set(...authHeader(nanny.token));
    expect(checkOut.status).toBe(400);

    const row = await reload(booking.id);
    expect(row.status).toBe('COMPLETED');
    expect(row.nannyCheckedOutAt).toBeNull();
  });
});
