/**
 * A5 — Care Points, granted then spent against a booking.
 *
 * Points are platform-funded: redeeming reduces what the mother owes and what
 * the platform keeps, and must never touch the nanny's earnings. The ledger has
 * to balance in both directions, including when a booking that carried points
 * is cancelled.
 *
 * Defaults in play (reward.service DEFAULT_CONFIG): 100 points buys one care
 * hour, and one hour at the seeded rate is 120 EGP.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny, makeSuperuser } from '../../../test/factories';
import { grantCarePoints } from '../../../test/journeys/admin';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

const POINTS_PER_HOUR = 100;
const HOURLY_RATE = 120;

async function wallet(token: string) {
  const response = await request(app)
    .get('/rewards/wallet')
    .set(...authHeader(token));
  expect(response.status).toBe(200);
  return response.body.data as {
    pointsBalance: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
  };
}

/** A mother with points to spend and an APPROVED booking to spend them on. */
async function motherWithPointsAndBooking(points = 500) {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const admin = await makeSuperuser();

  await grantCarePoints(admin.token, mother.id, points, 'Welcome bonus');

  const booking = await createBookingViaApi(mother.token);
  await claimBooking(nanny.token, booking.id);

  return { mother, nanny, admin, booking, listPrice: Number(booking.totalAmount) };
}

describe('A5 — Care Points', () => {
  it('credits an admin grant to the wallet and its ledger', async () => {
    const mother = await makeMother();
    const admin = await makeSuperuser();

    await grantCarePoints(admin.token, mother.id, 500, 'Welcome bonus');

    expect(await wallet(mother.token)).toMatchObject({
      pointsBalance: 500,
      lifetimeEarned: 500,
      lifetimeRedeemed: 0,
    });

    const history = await request(app)
      .get('/rewards/history')
      .set(...authHeader(mother.token));
    expect(history.status).toBe(200);
    expect(history.body.data[0]).toMatchObject({
      type: 'ADMIN_GRANT',
      points: 500,
      balanceAfter: 500,
    });
  });

  it('redeems points for care hours and charges only the remainder', async () => {
    const { mother, booking, listPrice } = await motherWithPointsAndBooking();

    const redeem = await request(app)
      .post(`/bookings/${booking.id}/redeem-points`)
      .set(...authHeader(mother.token))
      .send({ hours: 2 });
    expect(redeem.status).toBe(200);

    const discounted = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const expectedDiscount = 2 * HOURLY_RATE;

    expect(Number(discounted.rewardCreditAmount)).toBe(expectedDiscount);
    expect(discounted.rewardCreditPoints).toBe(2 * POINTS_PER_HOUR);
    expect(Number(discounted.totalAmount)).toBe(listPrice - expectedDiscount);

    // Platform-funded: the nanny is paid exactly what she was before.
    expect(Number(discounted.nannyAmount)).toBe(Number(booking.nannyAmount));

    expect(await wallet(mother.token)).toMatchObject({
      pointsBalance: 500 - 200,
      lifetimeRedeemed: 200,
    });

    // Paymob is asked for the discounted total, not the list price.
    const session = await payViaPaymob(mother.token, 'booking', booking.id);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(Number(payment.amount)).toBe(listPrice - expectedDiscount);
  });

  it('returns the points when the redemption is undone', async () => {
    const { mother, booking, listPrice } = await motherWithPointsAndBooking();

    await request(app)
      .post(`/bookings/${booking.id}/redeem-points`)
      .set(...authHeader(mother.token))
      .send({ hours: 2 })
      .expect(200);

    const refund = await request(app)
      .post(`/bookings/${booking.id}/redeem-points/refund`)
      .set(...authHeader(mother.token));
    expect(refund.status).toBe(200);

    // The booking is back at its list price with no credit attached…
    const restored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(Number(restored.totalAmount)).toBe(listPrice);
    expect(Number(restored.rewardCreditAmount)).toBe(0);
    expect(restored.rewardCreditPoints).toBe(0);

    // …and the points are spendable again.
    expect((await wallet(mother.token)).pointsBalance).toBe(500);
  });

  it('refuses to spend more points than the wallet holds', async () => {
    // 100 points buys one hour; asking for four needs 400.
    const { mother, booking } = await motherWithPointsAndBooking(100);

    const response = await request(app)
      .post(`/bookings/${booking.id}/redeem-points`)
      .set(...authHeader(mother.token))
      .send({ hours: 4 });

    expect(response.status).toBe(400);
    expect((await wallet(mother.token)).pointsBalance).toBe(100);
  });

  it('refuses a second redemption while one is already applied', async () => {
    const { mother, booking } = await motherWithPointsAndBooking();

    await request(app)
      .post(`/bookings/${booking.id}/redeem-points`)
      .set(...authHeader(mother.token))
      .send({ hours: 1 })
      .expect(200);

    const second = await request(app)
      .post(`/bookings/${booking.id}/redeem-points`)
      .set(...authHeader(mother.token))
      .send({ hours: 1 });

    expect(second.status).toBe(400);
    // The wallet was debited once, not twice.
    expect((await wallet(mother.token)).pointsBalance).toBe(400);
  });

  it('returns points to the wallet when a booking carrying them is cancelled', async () => {
    const { mother, booking } = await motherWithPointsAndBooking();

    await request(app)
      .post(`/bookings/${booking.id}/redeem-points`)
      .set(...authHeader(mother.token))
      .send({ hours: 2 })
      .expect(200);

    const cancel = await request(app)
      .post(`/bookings/${booking.id}/cancel`)
      .set(...authHeader(mother.token))
      .send({ reason: 'Plans changed.' });
    expect(cancel.status).toBe(200);

    // Points must not die with the booking.
    expect((await wallet(mother.token)).pointsBalance).toBe(500);
  });

  it('refuses to redeem against a booking that is not yet approved', async () => {
    const mother = await makeMother();
    const admin = await makeSuperuser();
    await grantCarePoints(admin.token, mother.id, 500, 'Welcome bonus');

    // No nanny has claimed it, so it is still PENDING.
    const booking = await createBookingViaApi(mother.token);

    const response = await request(app)
      .post(`/bookings/${booking.id}/redeem-points`)
      .set(...authHeader(mother.token))
      .send({ hours: 1 });

    expect(response.status).toBe(400);
  });
});
