/**
 * A17 — cancelling a booking, and what the platform says is owed back.
 *
 * Either party may cancel a booking that has not started. The refund the
 * service quotes follows one rule: a parent cancelling outside the platform's
 * cancellation window, or a nanny cancelling at any point, is owed the full
 * amount; a parent cancelling inside the window loses the console's
 * cancellation fee (`cancellation_fee_percent`, 50 by default). The window is
 * the console's `cancellation_window_hours` (24 by default; 0 makes cancelling
 * always free), and the app reads both off `/bookings/options` so the fee it
 * warns about is the policy the server applies. The quote is advisory —
 * nothing is paid back here, and the mother is never promised a refund: an
 * admin decides, as money or Care Points. Money moves only through the admin
 * refund flow (A3), so a paid booking's payment row must be untouched by the
 * cancellation itself.
 *
 * A nanny dropping a booking that isn't paid yet doesn't cancel it: the request
 * goes back to the open pool, still holding whatever the mother set aside, and
 * she is told another nanny is being found.
 *
 * Whoever cancels, the other party is told. A shift that is under way cannot
 * be cancelled at all — the parent ends it (A18) instead.
 *
 * Journeys A5 and A6 already prove that Care Points and package hours return
 * to the wallet on cancel; this one is about the status, the audit columns,
 * the quote and the notification.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny } from '../../../test/factories';
import {
  checkIn,
  checkOut,
  claimBooking,
  createBookingViaApi,
  shiftWindowToNow,
} from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

const REASON = 'Plans changed.';

function cancel(token: string, bookingId: number, reason = REASON) {
  return request(app)
    .post(`/bookings/${bookingId}/cancel`)
    .set(...authHeader(token))
    .send({ reason });
}

async function reload(id: number) {
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

/**
 * Moves the booking's start to `hoursAhead` from now. A bookable start is
 * "tomorrow 10:00", which is 24 h away only by coincidence of when the suite
 * runs, so the refund rule's boundary has to be placed deliberately.
 */
async function startIn(bookingId: number, hoursAhead: number): Promise<void> {
  const start = Date.now() + hoursAhead * 3_600_000;
  await prisma.booking.update({
    where: { id: bookingId },
    data: { startTime: new Date(start), endTime: new Date(start + 4 * 3_600_000) },
  });
}

/**
 * The window is not in the baseline snapshot the reset restores, so the
 * reader falls back to its 24 h default until a row exists — and the reset's
 * truncate removes the row again after each test.
 */
async function setSetting(key: string, value: number): Promise<void> {
  await prisma.appSettings.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  });
}

async function setCancellationWindowHours(hours: number): Promise<void> {
  await setSetting('cancellation_window_hours', hours);
}

async function wasToldOfCancellation(userId: number, bookingId: number): Promise<boolean> {
  const count = await prisma.notification.count({
    where: { userId, type: 'BOOKING_CANCELLED', referenceId: bookingId },
  });
  return count > 0;
}

/** A claimed, card-paid booking — the state most cancellations happen from. */
async function paidBooking() {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const booking = await createBookingViaApi(mother.token);
  await claimBooking(nanny.token, booking.id);
  const session = await payViaPaymob(mother.token, 'booking', booking.id);
  expect((await reload(booking.id)).status).toBe('CONFIRMED');
  return { mother, nanny, booking, paymentId: session.paymentId };
}

describe('A17 — who may cancel', () => {
  it('lets the mother withdraw an unclaimed request, which leaves every nanny’s pool', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const booking = await createBookingViaApi(mother.token);

    const response = await cancel(mother.token, booking.id);
    expect(response.status).toBe(200);
    expect(response.body.data.booking.status).toBe('CANCELLED');

    const row = await reload(booking.id);
    expect(row.status).toBe('CANCELLED');
    expect(row.cancellationReason).toBe(REASON);
    expect(row.cancelledById).toBe(mother.id);
    expect(row.cancelledAt).not.toBeNull();

    const pool = await request(app).get('/bookings/available').set(...authHeader(nanny.token));
    expect((pool.body.data as Array<{ id: number }>).map((b) => b.id)).not.toContain(booking.id);
  });

  it('refuses anyone who is not a party to the booking', async () => {
    const { booking } = await paidBooking();
    const bystander = await makeMother();
    const otherNanny = await makeNanny();

    expect((await cancel(bystander.token, booking.id)).status).toBe(403);
    expect((await cancel(otherNanny.token, booking.id)).status).toBe(403);
    expect((await reload(booking.id)).status).toBe('CONFIRMED');
  });

  it('refuses to cancel a booking that has already completed', async () => {
    const { mother, nanny, booking } = await paidBooking();
    await shiftWindowToNow(booking.id);
    await checkIn(mother.token, nanny.token, booking.id);
    await checkOut(nanny.token, booking.id);

    const response = await cancel(mother.token, booking.id);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/cannot transition/i);

    const row = await reload(booking.id);
    expect(row.status).toBe('COMPLETED');
    expect(row.cancelledAt).toBeNull();
  });

  it('refuses to cancel a shift that is under way — the parent ends it instead', async () => {
    const { mother, nanny, booking } = await paidBooking();
    await shiftWindowToNow(booking.id);
    await checkIn(mother.token, nanny.token, booking.id);

    for (const token of [mother.token, nanny.token]) {
      const response = await cancel(token, booking.id);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/under way/i);
    }

    const row = await reload(booking.id);
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.cancelledAt).toBeNull();
  });

  it('requires a reason', async () => {
    const { mother, booking } = await paidBooking();
    expect((await cancel(mother.token, booking.id, '')).status).toBe(400);
    expect((await reload(booking.id)).status).toBe('CONFIRMED');
  });
});

describe('A17 — the other party is told', () => {
  it('tells the nanny when the mother cancels', async () => {
    const { mother, nanny, booking } = await paidBooking();
    await cancel(mother.token, booking.id).expect(200);

    expect(await wasToldOfCancellation(nanny.id, booking.id)).toBe(true);
    expect(await wasToldOfCancellation(mother.id, booking.id)).toBe(false);
  });

  it('tells the mother when the nanny cancels, without promising her a refund', async () => {
    const { mother, nanny, booking } = await paidBooking();
    await cancel(nanny.token, booking.id).expect(200);

    expect(await wasToldOfCancellation(mother.id, booking.id)).toBe(true);
    expect(await wasToldOfCancellation(nanny.id, booking.id)).toBe(false);

    // An admin decides between money and Care Points; the message must not pre-empt that.
    const told = await prisma.notification.findFirstOrThrow({
      where: { userId: mother.id, type: 'BOOKING_CANCELLED', referenceId: booking.id },
    });
    expect(told.body).not.toMatch(/refund/i);
    expect(told.body).toMatch(/our team will review your payment/i);
  });

  it('tells nobody when an unclaimed request is withdrawn', async () => {
    const mother = await makeMother();
    const booking = await createBookingViaApi(mother.token);
    await cancel(mother.token, booking.id).expect(200);

    expect(await prisma.notification.count({ where: { type: 'BOOKING_CANCELLED' } })).toBe(0);
  });
});

describe('A17 — the refund quote', () => {
  it('is the full amount when the mother cancels more than 24 hours ahead', async () => {
    const { mother, booking, paymentId } = await paidBooking();
    await startIn(booking.id, 30);

    const response = await cancel(mother.token, booking.id);
    expect(response.status).toBe(200);
    expect(response.body.data.refundAmount).toBe(Number(booking.totalAmount));

    // The quote is what she is owed, not a transfer: the capture stands until
    // an operator refunds it (A3).
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('CAPTURED');
  });

  it('is half when the mother cancels inside 24 hours', async () => {
    const { mother, booking } = await paidBooking();
    await startIn(booking.id, 6);

    const response = await cancel(mother.token, booking.id);
    expect(response.status).toBe(200);
    expect(response.body.data.refundAmount).toBe(Number(booking.totalAmount) / 2);
    expect((await reload(booking.id)).status).toBe('CANCELLED');
  });

  it('is the full amount when the nanny cancels, however close to the start', async () => {
    const { nanny, booking } = await paidBooking();
    await startIn(booking.id, 6);

    const response = await cancel(nanny.token, booking.id);
    expect(response.status).toBe(200);
    expect(response.body.data.refundAmount).toBe(Number(booking.totalAmount));

    const row = await reload(booking.id);
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelledById).toBe(nanny.id);
  });

  it('uses the window the console configures, not a constant', async () => {
    await setCancellationWindowHours(12);

    const outside = await paidBooking();
    await startIn(outside.booking.id, 18);
    const full = await cancel(outside.mother.token, outside.booking.id);
    expect(full.body.data.refundAmount).toBe(Number(outside.booking.totalAmount));

    const inside = await paidBooking();
    await startIn(inside.booking.id, 6);
    const half = await cancel(inside.mother.token, inside.booking.id);
    expect(half.body.data.refundAmount).toBe(Number(inside.booking.totalAmount) / 2);
  });

  it('keeps the fee the console sets, not a fixed half', async () => {
    await setSetting('cancellation_fee_percent', 30);

    const { mother, booking } = await paidBooking();
    await startIn(booking.id, 6);
    const response = await cancel(mother.token, booking.id);
    expect(response.body.data.refundAmount).toBe(
      Math.round(Number(booking.totalAmount) * 0.7 * 100) / 100,
    );
  });

  it('is the full amount inside the window when the fee is zero', async () => {
    await setSetting('cancellation_fee_percent', 0);

    const { mother, booking } = await paidBooking();
    await startIn(booking.id, 6);
    const response = await cancel(mother.token, booking.id);
    expect(response.body.data.refundAmount).toBe(Number(booking.totalAmount));
  });

  it('is always the full amount when the window is zero', async () => {
    await setCancellationWindowHours(0);

    const { mother, booking } = await paidBooking();
    await startIn(booking.id, 1);
    const response = await cancel(mother.token, booking.id);
    expect(response.body.data.refundAmount).toBe(Number(booking.totalAmount));
  });

  it('is published to the app on /bookings/options so the warning matches the charge', async () => {
    await setCancellationWindowHours(12);
    const mother = await makeMother();

    const response = await request(app).get('/bookings/options').set(...authHeader(mother.token));
    expect(response.status).toBe(200);
    expect(response.body.data.cancellationWindowHours).toBe(12);
  });

  it('publishes the fee to the app too', async () => {
    await setSetting('cancellation_fee_percent', 30);
    const mother = await makeMother();

    const response = await request(app).get('/bookings/options').set(...authHeader(mother.token));
    expect(response.body.data.cancellationFeePercent).toBe(30);
  });
});

describe('A17 — a nanny dropping a booking that is not paid yet', () => {
  async function acceptedUnpaid() {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const booking = await createBookingViaApi(mother.token);
    await claimBooking(nanny.token, booking.id);
    expect((await reload(booking.id)).status).toBe('APPROVED');
    return { mother, nanny, booking };
  }

  it('puts the request back in the pool instead of cancelling it', async () => {
    const { nanny, booking } = await acceptedUnpaid();

    const response = await cancel(nanny.token, booking.id);
    expect(response.status).toBe(200);
    expect(response.body.data.refundAmount).toBe(0);

    const row = await reload(booking.id);
    expect(row.status).toBe('PENDING');
    expect(row.nannyProfileId).toBeNull();
    expect(row.cancelledAt).toBeNull();
    expect(row.cancelledById).toBeNull();
  });

  it('keeps everything the mother set aside on the request', async () => {
    const { nanny, booking } = await acceptedUnpaid();
    const before = await reload(booking.id);

    await cancel(nanny.token, booking.id).expect(200);

    const after = await reload(booking.id);
    expect(after.totalAmount).toEqual(before.totalAmount);
    expect(after.discountAmount).toEqual(before.discountAmount);
    expect(after.promoCodeId).toEqual(before.promoCodeId);
    expect(after.packageHoursApplied).toEqual(before.packageHoursApplied);
    expect(after.rewardCreditPoints).toEqual(before.rewardCreditPoints);
  });

  it('tells the mother another nanny is being found — not that it was cancelled', async () => {
    const { mother, nanny, booking } = await acceptedUnpaid();
    await cancel(nanny.token, booking.id).expect(200);

    expect(await wasToldOfCancellation(mother.id, booking.id)).toBe(false);
    const told = await prisma.notification.findFirst({
      where: { userId: mother.id, type: 'BOOKING_REQUESTED', referenceId: booking.id },
    });
    expect(told?.title).toBe('Finding you another nanny');
  });

  it('lets another nanny accept it, and does not offer it back to the one who dropped it', async () => {
    const { nanny, booking } = await acceptedUnpaid();
    const other = await makeNanny();
    await prisma.notification.deleteMany({});

    await cancel(nanny.token, booking.id).expect(200);

    expect(
      await prisma.notification.count({
        where: { userId: nanny.id, type: 'BOOKING_REQUESTED', referenceId: booking.id },
      }),
    ).toBe(0);

    await claimBooking(other.token, booking.id);
    const row = await reload(booking.id);
    expect(row.status).toBe('APPROVED');
    expect(row.nannyProfileId).not.toBeNull();
  });
});
