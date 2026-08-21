/**
 * A1 — the flagship booking journey, end to end over real HTTP.
 *
 * Broadcast → nanny claims → admin approves → mother pays through a real
 * Paymob intention settled by a signed webhook → PIN check-in → care log →
 * check-out → review. Money assertions come from the shared pricing engine,
 * never hand arithmetic; every hop is made by the actor production uses.
 */
import { calculatePriceBreakdown } from '@nanny-app/shared';
import { PaymentStatus } from '@prisma/client';
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
  submitReview,
} from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

const DURATION_HOURS = 4;

/** Platform defaults, as seeded: 120 EGP/h, 80/20 nanny/platform split. */
const EXPECTED = calculatePriceBreakdown({
  baseRate: 120,
  durationHours: DURATION_HOURS,
  nannyPercent: 80,
  platformPercent: 20,
});

async function reloadBooking(id: number) {
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

describe('A1 — booking lifecycle', () => {
  it('runs broadcast → claim → approve → pay → care → review', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();

    // ── Broadcast ─────────────────────────────────────────────────
    const created = await createBookingViaApi(mother.token, {
      durationHours: DURATION_HOURS,
    });
    expect(created.status).toBe('PENDING');
    // Priced by the platform engine at creation, before any nanny is known.
    expect(Number(created.totalAmount)).toBe(EXPECTED.totalAmount);

    // ── Nanny claims the request ─────────────────────────────────
    // A claim is what makes a broadcast payable: the atomic first-to-accept
    // update moves it straight to APPROVED. (The admin PENDING→APPROVED path
    // exists for assigned bookings and is covered by the toolkit smoke + A2.)
    await claimBooking(nanny.token, created.id);
    const claimed = await reloadBooking(created.id);
    expect(claimed.status).toBe('APPROVED');
    expect(claimed.nannyProfileId).toBe(nanny.nannyProfileId);
    expect(claimed.nannyDecision).toBe('ACCEPTED');

    // The mother is told to pay.
    const approvalNote = await prisma.notification.findFirst({
      where: { userId: mother.id, type: 'BOOKING_APPROVED' },
    });
    expect(approvalNote).not.toBeNull();

    // ── Mother pays ──────────────────────────────────────────────
    const session = await payViaPaymob(mother.token, 'booking', created.id);
    const confirmed = await reloadBooking(created.id);
    expect(confirmed.status).toBe('CONFIRMED');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe(PaymentStatus.CAPTURED);
    expect(Number(payment.amount)).toBe(EXPECTED.totalAmount);

    // The nanny/platform split persisted on the booking matches the engine.
    expect(Number(confirmed.nannyAmount)).toBe(EXPECTED.nannyAmount);
    expect(Number(confirmed.platformAmount)).toBe(EXPECTED.platformAmount);
    expect(EXPECTED.nannyAmount + EXPECTED.platformAmount).toBe(EXPECTED.totalAmount);

    // ── Care segment ─────────────────────────────────────────────
    // A bookable start is ≥ the lead time away; move the paid booking's window
    // over "now" so the check-in clock gate opens (see journeys/booking.ts).
    await shiftWindowToNow(created.id, DURATION_HOURS);
    await checkIn(mother.token, nanny.token, created.id);
    expect((await reloadBooking(created.id)).status).toBe('IN_PROGRESS');

    // Nanny writes a care log entry; the parent sees it in her feed.
    const logResponse = await request(app)
      .post(`/bookings/${created.id}/care-logs`)
      .set(...authHeader(nanny.token))
      .send({ type: 'MEAL', notes: 'Lunch eaten, no fuss.' });
    expect(logResponse.status).toBe(201);

    const feed = await request(app)
      .get(`/bookings/${created.id}/care-logs`)
      .set(...authHeader(mother.token));
    expect(feed.status).toBe(200);
    expect(feed.body.data).toHaveLength(1);
    expect(feed.body.data[0]).toMatchObject({ type: 'MEAL', notes: 'Lunch eaten, no fuss.' });

    // ── Check-out and review ─────────────────────────────────────
    await checkOut(nanny.token, created.id);
    expect((await reloadBooking(created.id)).status).toBe('COMPLETED');

    await submitReview(mother.token, created.id, 5, 'Wonderful with our daughter.');

    // The denormalised rating cache moved with the review.
    const profile = await prisma.nannyProfile.findUniqueOrThrow({
      where: { id: nanny.nannyProfileId },
    });
    expect(Number(profile.rating)).toBe(5);
  });
});
