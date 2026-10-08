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
import {
  makeMother,
  makeNanny,
  makePackage,
  makePromoCode,
  makeSuperuser,
} from '../../../test/factories';
import {
  checkIn,
  checkOut,
  claimBooking,
  createBookingViaApi,
  shiftWindowToNow,
} from '../../../test/journeys/booking';
import { grantCarePoints } from '../../../test/journeys/admin';
import {
  createCheckoutSession,
  inspectIntention,
  payViaPaymob,
  purchasePackage,
  settleCheckout,
} from '../../../test/journeys/payment';

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
    // She cancelled it herself, so what she hears is her own summary — what
    // came back, and that her payment is being reviewed.
    const own = await prisma.notification.findFirstOrThrow({
      where: { userId: mother.id, type: 'BOOKING_CANCELLED', referenceId: booking.id },
    });
    expect(own.title).toBe('Booking cancelled');
    expect(own.body).toMatch(/Our team will review your payment/);
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

/**
 * A cancel that lands while the mother is paying would leave her card charged
 * for a cancelled booking. So it waits for an open checkout to finish or
 * close; a checkout that already went through makes it a paid cancellation;
 * and if money still lands on a cancelled booking, the team and she are told.
 */
describe('A17 — cancelling while she is paying', () => {
  async function checkingOut() {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const booking = await createBookingViaApi(mother.token);
    await claimBooking(nanny.token, booking.id);
    const session = await createCheckoutSession(mother.token, 'booking', booking.id);
    return { mother, nanny, booking, session };
  }

  /** Ages the checkout past the life of its Paymob link. */
  async function expireCheckout(paymentId: number) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { paymobReconcileAnchorAt: new Date(Date.now() - 2 * 3_600_000) },
    });
  }

  it('gives every checkout link an expiry, so an old one cannot take money later', async () => {
    const { session } = await checkingOut();
    expect((await inspectIntention(session.clientSecret)).expiration).toBe(90 * 60);
  });

  it('refuses to cancel while the checkout is still open', async () => {
    const { mother, booking } = await checkingOut();

    const response = await cancel(mother.token, booking.id);
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/payment for this booking is in progress/i);
    expect((await reload(booking.id)).status).toBe('APPROVED');
  });

  it('refuses an admin cancel while she is paying, too', async () => {
    const { booking } = await checkingOut();
    const admin = await makeSuperuser();

    const response = await request(app)
      .post(`/admin/bookings/${booking.id}/reject`)
      .set(...authHeader(admin.token))
      .send({ reason: 'Duplicate.' });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/paying for this booking right now/i);
    expect((await reload(booking.id)).status).toBe('APPROVED');
  });

  it('cancels a booking whose payment already went through as a paid booking', async () => {
    const { mother, booking, session } = await checkingOut();
    // Paid at Paymob, but its webhook hasn't reached us yet.
    await settleCheckout(session.clientSecret, { deliverWebhook: false });

    const response = await cancel(mother.token, booking.id);
    expect(response.status).toBe(200);

    expect((await reload(booking.id)).status).toBe('CANCELLED');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe('CAPTURED');
  });

  it('lets the cancel through once the checkout link has expired', async () => {
    const { mother, booking, session } = await checkingOut();
    await expireCheckout(session.paymentId);

    expect((await cancel(mother.token, booking.id)).status).toBe(200);
    expect((await reload(booking.id)).status).toBe('CANCELLED');
  });

  it('tells the team and the mother when money still lands on a cancelled booking', async () => {
    const { mother, booking, session } = await checkingOut();
    const admin = await makeSuperuser();
    await expireCheckout(session.paymentId);
    await cancel(mother.token, booking.id).expect(200);

    await settleCheckout(session.clientSecret);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe('CAPTURED');
    expect((await reload(booking.id)).status).toBe('CANCELLED');

    const toMother = await prisma.notification.findFirst({
      where: { userId: mother.id, referenceId: booking.id, title: 'Payment received for a cancelled booking' },
    });
    expect(toMother?.body).toMatch(/our team will review it/i);
    expect(toMother?.body).not.toMatch(/refund/i);

    const toAdmin = await prisma.notification.findFirst({
      where: { userId: admin.id, referenceId: booking.id, title: 'Payment on a cancelled booking' },
    });
    expect(toAdmin?.body).toMatch(/Open the booking to refund it/);
  });
});

/**
 * A mother calling off a paid booking outside the window gets back everything
 * she prepaid — package hours, Care Points and the promo code's use — with the
 * cancellation itself. Card money is not refunded: the team is told and an
 * admin decides between a refund and Care Points. Inside the window the
 * credits stay spent and the money still goes to an admin.
 */
describe('A17 — what a paid cancellation gives back', () => {
  async function hours(token: string): Promise<number> {
    const response = await request(app).get('/packages/me/hours').set(...authHeader(token));
    return response.body.data.availableHours as number;
  }

  async function points(token: string): Promise<number> {
    const response = await request(app).get('/rewards/wallet').set(...authHeader(token));
    return response.body.data.pointsBalance as number;
  }

  /**
   * A 4-hour booking paid every way at once: a 10% promo code, 2 package
   * hours, 1 hour of Care Points and the rest by card.
   */
  async function paidEveryWay(options: { card?: boolean } = {}) {
    const { card = true } = options;
    const mother = await makeMother();
    const nanny = await makeNanny();
    const admin = await makeSuperuser();

    const pkg = await makePackage({ hours: card ? 2 : 4, price: 200 });
    const purchase = await purchasePackage(mother.token, pkg.id);
    await settleCheckout(purchase.clientSecret);
    await grantCarePoints(admin.token, mother.id, 500, 'Welcome bonus');
    const promo = await makePromoCode({ discountType: 'PERCENTAGE', value: 10, maxUsagePerUser: 1 });

    const booking = await createBookingViaApi(mother.token, {
      durationHours: 4,
      promoCode: promo.code,
      ...(card ? { redeemPointsHours: 1 } : {}),
    });
    await claimBooking(nanny.token, booking.id);
    if (card) await payViaPaymob(mother.token, 'booking', booking.id);

    const row = await reload(booking.id);
    expect(row.status).toBe('CONFIRMED');
    return {
      mother,
      admin,
      booking,
      promo,
      row,
      hoursBefore: await hours(mother.token),
      pointsBefore: await points(mother.token),
    };
  }

  async function adminToldToDecide(adminId: number, bookingId: number): Promise<boolean> {
    return (
      (await prisma.notification.count({
        where: { userId: adminId, referenceId: bookingId, title: 'Refund decision needed' },
      })) > 0
    );
  }

  it('gives back hours, points and the promo code outside the window, and leaves the money to an admin', async () => {
    const { mother, admin, booking, promo, row, hoursBefore, pointsBefore } = await paidEveryWay();
    expect(Number(row.packageHoursApplied)).toBe(2);
    expect(row.rewardCreditPoints).toBeGreaterThan(0);
    await startIn(booking.id, 72);

    await cancel(mother.token, booking.id).expect(200);

    expect(await hours(mother.token)).toBe(hoursBefore + 2);
    expect(await points(mother.token)).toBe(pointsBefore + row.rewardCreditPoints);

    const code = await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } });
    expect(code.usageCount).toBe(0);
    const live = await prisma.promoCodeRedemption.count({
      where: { promoCodeId: promo.id, deletedAt: null },
    });
    expect(live).toBe(0);

    // The card money stays where it is until an admin decides.
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.status).toBe('CAPTURED');
    expect(Number(payment.refundedAmount)).toBe(0);
    expect(await adminToldToDecide(admin.id, booking.id)).toBe(true);

    const told = await prisma.notification.findFirstOrThrow({
      where: { userId: mother.id, referenceId: booking.id, title: 'Booking cancelled' },
    });
    expect(told.body).toMatch(/2 package hours went back to your package/);
    expect(told.body).toMatch(/Care Points went back to your balance/);
    expect(told.body).toContain(`Your promo code ${promo.code} can be used again`);
    expect(told.body).toMatch(/Our team will review your payment/);
    expect(told.body).not.toMatch(/refund/i);
  });

  it('lets her use the promo code again afterwards', async () => {
    const { mother, booking, promo } = await paidEveryWay();
    await startIn(booking.id, 72);
    await cancel(mother.token, booking.id).expect(200);

    const preview = await request(app)
      .post('/bookings/validate-promo')
      .set(...authHeader(mother.token))
      .send({ code: promo.code, subtotal: 400 });
    expect(preview.status).toBe(200);
  });

  it('keeps hours, points and the promo code spent inside the window, and still leaves the money to an admin', async () => {
    const { mother, admin, booking, promo, hoursBefore, pointsBefore } = await paidEveryWay();
    await startIn(booking.id, 6);

    await cancel(mother.token, booking.id).expect(200);

    expect(await hours(mother.token)).toBe(hoursBefore);
    expect(await points(mother.token)).toBe(pointsBefore);
    expect((await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).usageCount).toBe(1);
    expect(await adminToldToDecide(admin.id, booking.id)).toBe(true);
  });

  it('needs no admin when nothing was paid by card', async () => {
    const { mother, admin, booking, row, hoursBefore } = await paidEveryWay({ card: false });
    expect(Number(row.totalAmount)).toBe(0);
    await startIn(booking.id, 72);

    await cancel(mother.token, booking.id).expect(200);

    // The promo came off first, so the package covered only what was left.
    expect(await hours(mother.token)).toBeCloseTo(hoursBefore + Number(row.packageHoursApplied), 2);
    expect(await adminToldToDecide(admin.id, booking.id)).toBe(false);
    const told = await prisma.notification.findFirstOrThrow({
      where: { userId: mother.id, referenceId: booking.id, title: 'Booking cancelled' },
    });
    expect(told.body).not.toMatch(/review your payment/);
  });
});
