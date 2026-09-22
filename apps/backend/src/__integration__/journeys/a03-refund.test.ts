/**
 * A3 — refunding a paid booking.
 *
 * A refund needs an overpayment to exist, and the only way one arises is an
 * admin shortening an already-paid booking. So the journey is: pay in full,
 * edit the booking down, then give the difference back — either to the card
 * (a real refund call to the Paymob fake, accumulated on the original
 * transaction) or as Care Points.
 *
 * Both routes have to close the overpayment, not just move money: points that
 * left the figure untouched would let the same difference go back a second time
 * to the card, and would make a later edit back up to the original length look
 * like it cost her nothing.
 */
import { PaymentStatus } from '@prisma/client';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny, makeSuperuser } from '../../../test/factories';
import { editBooking, getAdminBookingDetail, refundBooking } from '../../../test/journeys/admin';
import {
  claimBooking,
  createBookingViaApi,
  wallClockTomorrow,
} from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

const START_HOUR = 10;
const CHILDREN = [{ name: 'Test Child', ageYears: 3, allergies: null }];

/** Books 6 hours, claims and pays it, then shortens it to 4 to create an overpayment. */
async function paidBookingWithOverpayment() {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const admin = await makeSuperuser();

  const booking = await createBookingViaApi(mother.token, {
    startHour: START_HOUR,
    durationHours: 6,
  });
  await claimBooking(nanny.token, booking.id);
  const session = await payViaPaymob(mother.token, 'booking', booking.id);

  const paidTotal = Number(booking.totalAmount);

  const { settlement } = await editBooking(admin.token, booking.id, {
    startTime: wallClockTomorrow(START_HOUR),
    endTime: wallClockTomorrow(START_HOUR + 4),
    children: CHILDREN,
    skillIds: [],
  });

  return { mother, admin, booking, session, paidTotal, settlement };
}

describe('A3 — refund a paid booking', () => {
  it('shortening a paid booking leaves a refundable overpayment, not a charge', async () => {
    const { settlement, paidTotal } = await paidBookingWithOverpayment();

    expect(settlement.delta).toBeLessThan(0);
    expect(settlement.refundableAmount).toBeGreaterThan(0);
    expect(settlement.balanceDueAmount).toBe(0);
    // A downward edit must never raise a balance-due obligation.
    expect(settlement.adjustmentId).toBeNull();
    expect(settlement.amountPaid).toBe(paidTotal);
  });

  it('refunds the overpayment to the card through the real Paymob path', async () => {
    const { admin, booking, session, settlement } = await paidBookingWithOverpayment();
    const refundable = settlement.refundableAmount;

    const result = (await refundBooking(admin.token, booking.id, {
      method: 'PAYMOB',
      reason: 'Booking shortened by our team.',
    })) as { method: string; refundedAmount: number; grantedPoints: number | null };

    expect(result.method).toBe('PAYMOB');
    expect(result.refundedAmount).toBe(refundable);
    expect(result.grantedPoints).toBeNull();

    // The ledger moved, and a partial refund leaves the payment CAPTURED.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(Number(payment.refundedAmount)).toBe(refundable);
    expect(payment.status).toBe(PaymentStatus.CAPTURED);
    expect(payment.refundedAt).not.toBeNull();
  });

  it('keeps the overpayment visible on the booking until it is returned', async () => {
    // The editor offers a refund right after saving; if that is dismissed, the
    // detail page is where an admin finds the money still owed — so the figure
    // has to come from the booking itself, not from the edit response.
    const { admin, booking, settlement, paidTotal } = await paidBookingWithOverpayment();

    const before = await getAdminBookingDetail(admin.token, booking.id);
    expect(before.amountPaid).toBe(paidTotal);
    expect(before.refundableAmount).toBe(settlement.refundableAmount);

    await refundBooking(admin.token, booking.id, { method: 'PAYMOB', reason: 'Settled later.' });

    const after = await getAdminBookingDetail(admin.token, booking.id);
    expect(after.refundableAmount).toBe(0);
    expect(after.amountPaid).toBe(after.totalAmount);
  });

  it('refuses a second refund once the overpayment is exhausted', async () => {
    const { admin, booking } = await paidBookingWithOverpayment();

    await refundBooking(admin.token, booking.id, { method: 'PAYMOB', reason: 'First refund.' });

    // Nothing is overpaid any more, so the guard rejects before Paymob is called.
    await expect(
      refundBooking(admin.token, booking.id, { method: 'PAYMOB', reason: 'Again.' }),
    ).rejects.toThrow(/400/);
  });

  it('refuses to refund more than was overpaid', async () => {
    const { admin, booking, settlement } = await paidBookingWithOverpayment();

    await expect(
      refundBooking(admin.token, booking.id, {
        method: 'PAYMOB',
        amount: settlement.refundableAmount + 100,
        reason: 'Too much.',
      }),
    ).rejects.toThrow(/400/);
  });

  it('can settle the overpayment as Care Points instead of money', async () => {
    const { mother, admin, booking, session, settlement } = await paidBookingWithOverpayment();
    const refundable = settlement.refundableAmount;

    const result = (await refundBooking(admin.token, booking.id, {
      method: 'CARE_POINTS',
      points: 250,
      reason: 'Goodwill for the change.',
    })) as {
      method: string;
      refundedAmount: number | null;
      grantedPoints: number;
      settledAmount: number;
    };

    expect(result.method).toBe('CARE_POINTS');
    expect(result.grantedPoints).toBe(250);
    expect(result.refundedAmount).toBeNull();
    // How many points is the admin's call; the EGP it settles is the overpayment.
    expect(result.settledAmount).toBe(refundable);

    // No money moved — the card payment is untouched.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(Number(payment.refundedAmount)).toBe(0);

    // The points are visible to the mother on her own wallet endpoint.
    const wallet = await request(app)
      .get('/rewards/wallet')
      .set(...authHeader(mother.token));
    expect(wallet.status).toBe(200);
    expect(wallet.body.data).toMatchObject({ pointsBalance: 250, lifetimeEarned: 250 });

    // The booking records what was settled, so the console stops offering it...
    const detail = await getAdminBookingDetail(admin.token, booking.id);
    expect(detail.refundedAsPointsAmount).toBe(refundable);
    expect(detail.refundedAsPointsAt).not.toBeNull();
    expect(detail.refundableAmount).toBe(0);

    // ...and the same money cannot then also go back to her card.
    await expect(
      refundBooking(admin.token, booking.id, { method: 'PAYMOB', reason: 'And the cash too.' }),
    ).rejects.toThrow(/400/);

    // The ledger entry names the booking whose overpayment it settled.
    const entry = await prisma.rewardLedgerEntry.findFirstOrThrow({
      where: { userId: mother.id, type: 'ADMIN_GRANT' },
    });
    expect(entry.bookingId).toBe(booking.id);
  });

  it('charges the settled amount back when the booking is priced up again', async () => {
    // The mother is made whole with points, then the booking grows back to its
    // original length. The points were a real refund, so she owes that money
    // again — the cash she paid no longer covers the new total on its own.
    const { admin, booking, settlement } = await paidBookingWithOverpayment();
    const refundable = settlement.refundableAmount;

    await refundBooking(admin.token, booking.id, {
      method: 'CARE_POINTS',
      points: 250,
      reason: 'Goodwill for the change.',
    });

    const { settlement: reRaised } = await editBooking(admin.token, booking.id, {
      startTime: wallClockTomorrow(START_HOUR),
      endTime: wallClockTomorrow(START_HOUR + 6),
      children: CHILDREN,
      skillIds: [],
    });

    expect(reRaised.refundedAsPointsAmount).toBe(refundable);
    expect(reRaised.balanceDueAmount).toBe(refundable);
    expect(reRaised.adjustmentId).not.toBeNull();

    const adjustment = await prisma.bookingAdjustment.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(Number(adjustment.amountEgp)).toBe(refundable);
  });
});
