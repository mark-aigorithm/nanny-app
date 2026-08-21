/**
 * A4 — a promo code, from preview through to consumption.
 *
 * The rule worth proving is that a code is *reserved* when a booking claims it
 * but only *consumed* when that booking is paid. Anything less lets a mother
 * sit on unpaid requests all claiming the same one-per-customer code.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny, makePromoCode } from '../../../test/factories';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

/** 4 hours at the seeded 120 EGP/h. */
const UNDISCOUNTED_SUBTOTAL = 480;

describe('A4 — promo codes', () => {
  it('previews a percentage discount against a subtotal', async () => {
    const mother = await makeMother();
    const promo = await makePromoCode({ discountType: 'PERCENTAGE', value: 25 });

    const response = await request(app)
      .post('/bookings/validate-promo')
      .set(...authHeader(mother.token))
      .send({ code: promo.code, subtotal: UNDISCOUNTED_SUBTOTAL });

    expect(response.status).toBe(200);
    expect(response.body.data.discountAmount).toBe(120);
  });

  it('never discounts more than the amount owed', async () => {
    const mother = await makeMother();
    const promo = await makePromoCode({ discountType: 'FLAT', value: 10_000 });

    const response = await request(app)
      .post('/bookings/validate-promo')
      .set(...authHeader(mother.token))
      .send({ code: promo.code, subtotal: UNDISCOUNTED_SUBTOTAL });

    expect(response.status).toBe(200);
    expect(response.body.data.discountAmount).toBe(UNDISCOUNTED_SUBTOTAL);
  });

  it('charges the discounted total and consumes the code only on payment', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const promo = await makePromoCode({ discountType: 'PERCENTAGE', value: 25, maxUsage: 1 });

    const booking = await createBookingViaApi(mother.token, { promoCode: promo.code });

    // The discount is on the booking from creation…
    const created = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(created.promoCodeId).toBe(promo.id);
    expect(Number(created.discountAmount)).toBe(120);
    expect(Number(created.totalAmount)).toBe(UNDISCOUNTED_SUBTOTAL - 120);

    // …but the code is not consumed until the money actually arrives.
    expect((await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).usageCount).toBe(0);
    expect(await prisma.promoCodeRedemption.count({ where: { promoCodeId: promo.id } })).toBe(0);

    await claimBooking(nanny.token, booking.id);
    const session = await payViaPaymob(mother.token, 'booking', booking.id);

    // Paymob was charged the discounted amount, not the list price.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(Number(payment.amount)).toBe(UNDISCOUNTED_SUBTOTAL - 120);

    expect((await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).usageCount).toBe(1);
    const redemptions = await prisma.promoCodeRedemption.findMany({
      where: { promoCodeId: promo.id },
    });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]).toMatchObject({ userId: mother.id, bookingId: booking.id });
  });

  it('counts an unpaid booking against the usage cap while it holds the code', async () => {
    const mother = await makeMother();
    const promo = await makePromoCode({ maxUsage: 1 });

    await createBookingViaApi(mother.token, { promoCode: promo.code, startHour: 10 });

    // The code is reserved, not yet consumed — a second booking must still be
    // refused, or the cap would be meaningless until payment.
    const second = await request(app)
      .post('/bookings')
      .set(...authHeader(mother.token))
      .send({
        startTime: tomorrowAt(14),
        endTime: tomorrowAt(18),
        children: [{ name: 'Test Child', ageYears: 3, allergies: null }],
        promoCode: promo.code,
      });

    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/fully redeemed/i);
  });

  it('refuses an expired code', async () => {
    const mother = await makeMother();
    const promo = await makePromoCode({ expiresAt: new Date(Date.now() - 60_000) });

    const response = await request(app)
      .post('/bookings/validate-promo')
      .set(...authHeader(mother.token))
      .send({ code: promo.code, subtotal: UNDISCOUNTED_SUBTOTAL });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/expired/i);
  });

  it('refuses a deactivated code', async () => {
    const mother = await makeMother();
    const promo = await makePromoCode({ isActive: false });

    const response = await request(app)
      .post('/bookings/validate-promo')
      .set(...authHeader(mother.token))
      .send({ code: promo.code, subtotal: UNDISCOUNTED_SUBTOTAL });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/no longer active/i);
  });

  it('refuses an unknown code', async () => {
    const mother = await makeMother();

    const response = await request(app)
      .post('/bookings/validate-promo')
      .set(...authHeader(mother.token))
      .send({ code: 'NOPE-NOT-REAL', subtotal: UNDISCOUNTED_SUBTOTAL });

    expect(response.status).toBe(404);
  });

  it('enforces a per-user cap across separate paid bookings', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const promo = await makePromoCode({ maxUsagePerUser: 1 });

    const first = await createBookingViaApi(mother.token, {
      promoCode: promo.code,
      startHour: 10,
    });
    await claimBooking(nanny.token, first.id);
    await payViaPaymob(mother.token, 'booking', first.id);

    const second = await request(app)
      .post('/bookings')
      .set(...authHeader(mother.token))
      .send({
        startTime: tomorrowAt(14),
        endTime: tomorrowAt(18),
        children: [{ name: 'Test Child', ageYears: 3, allergies: null }],
        promoCode: promo.code,
      });

    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already used/i);
  });
});

/** Wall-clock tomorrow at `hour`, matching CreateBookingSchema's offset-free format. */
function tomorrowAt(hour: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00`;
}
