/**
 * A8 — an admin edits a paid booking's window and the money re-settles.
 *
 * Lengthening a paid booking raises a balance-due BookingAdjustment the mother
 * settles through a second Paymob checkout; shortening one leaves a refund
 * (A3's territory). The preview must agree with what the commit actually does,
 * and the commit must refuse a stale revision — that optimistic token is the
 * only thing standing between two admins and a lost edit.
 */
import { prisma } from '@backend/db/prisma';

import { makeMother, makeNanny, makeSuperuser } from '../../../test/factories';
import { applyBookingEdit, editBooking, previewBookingEdit } from '../../../test/journeys/admin';
import {
  claimBooking,
  createBookingViaApi,
  wallClockTomorrow,
} from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

const START_HOUR = 10;
const CHILDREN = [{ name: 'Test Child', ageYears: 3, allergies: null }];

function editTo(durationHours: number) {
  return {
    startTime: wallClockTomorrow(START_HOUR),
    endTime: wallClockTomorrow(START_HOUR + durationHours),
    children: CHILDREN,
    skillIds: [] as number[],
  };
}

/** A confirmed, fully-paid 4-hour booking — the starting point for every edit. */
async function paidBooking() {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const admin = await makeSuperuser();

  const booking = await createBookingViaApi(mother.token, {
    startHour: START_HOUR,
    durationHours: 4,
  });
  await claimBooking(nanny.token, booking.id);
  await payViaPaymob(mother.token, 'booking', booking.id);

  return { mother, nanny, admin, booking, paidTotal: Number(booking.totalAmount) };
}

describe('A8 — admin edits booking times', () => {
  it('previews the delta without changing anything', async () => {
    const { admin, booking, paidTotal } = await paidBooking();

    // The preview reports the settlement at the top level, alongside the
    // revision token a later commit must echo.
    const preview = (await previewBookingEdit(admin.token, booking.id, editTo(6))) as {
      delta: number;
      balanceDueAmount: number;
      revision: string;
    };

    expect(preview.delta).toBeGreaterThan(0);
    expect(preview.balanceDueAmount).toBe(preview.delta);

    // A preview is a dry run: the booking is untouched and no obligation exists.
    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(Number(unchanged.totalAmount)).toBe(paidTotal);
    // durationHours is Decimal(…) in the schema, so compare numerically.
    expect(Number(unchanged.durationHours)).toBe(4);
    expect(await prisma.bookingAdjustment.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it('lengthening a paid booking raises a balance due the mother can settle', async () => {
    const { mother, admin, booking, paidTotal } = await paidBooking();

    const { settlement } = await editBooking(admin.token, booking.id, editTo(6));

    expect(settlement.delta).toBeGreaterThan(0);
    expect(settlement.balanceDueAmount).toBe(settlement.delta);
    expect(settlement.refundableAmount).toBe(0);
    expect(settlement.adjustmentId).not.toBeNull();

    const edited = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(Number(edited.durationHours)).toBe(6);
    expect(Number(edited.totalAmount)).toBe(paidTotal + settlement.delta);

    const adjustment = await prisma.bookingAdjustment.findUniqueOrThrow({
      where: { id: settlement.adjustmentId! },
    });
    expect(adjustment.status).toBe('PENDING_PAYMENT');
    expect(Number(adjustment.amountEgp)).toBe(settlement.delta);

    // The mother is told, then pays the difference through a second checkout.
    const balanceNote = await prisma.notification.findFirst({
      where: { userId: mother.id, type: 'BOOKING_BALANCE_DUE' },
    });
    expect(balanceNote).not.toBeNull();

    await payViaPaymob(mother.token, 'adjustment', adjustment.id);

    const settled = await prisma.bookingAdjustment.findUniqueOrThrow({
      where: { id: adjustment.id },
    });
    expect(settled.status).toBe('PAID');

    // The booking is now paid in full again. An adjustment payment hangs off
    // `bookingAdjustmentId`, not `bookingId` — Payment is polymorphic over what
    // it settles — so both legs have to be summed to see the whole picture.
    const payments = await prisma.payment.findMany({
      where: {
        status: 'CAPTURED',
        OR: [{ bookingId: booking.id }, { bookingAdjustmentId: adjustment.id }],
      },
    });
    const captured = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    expect(captured).toBe(Number(edited.totalAmount));
  });

  it('shortening a paid booking refunds rather than charges', async () => {
    const { admin, booking } = await paidBooking();

    const { settlement } = await editBooking(admin.token, booking.id, editTo(3));

    expect(settlement.delta).toBeLessThan(0);
    expect(settlement.refundableAmount).toBe(Math.abs(settlement.delta));
    expect(settlement.balanceDueAmount).toBe(0);
    expect(settlement.adjustmentId).toBeNull();
    expect(await prisma.bookingAdjustment.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it('rejects a commit carrying a stale revision', async () => {
    const { admin, booking } = await paidBooking();

    const preview = (await previewBookingEdit(admin.token, booking.id, editTo(6))) as {
      revision: string;
    };

    // Someone else edits first, moving `updatedAt` under this admin's feet.
    await editBooking(admin.token, booking.id, editTo(5));

    await expect(
      applyBookingEdit(admin.token, booking.id, {
        ...editTo(6),
        revision: preview.revision,
        acknowledgeSoftWarnings: true,
      }),
    ).rejects.toThrow(/409/);
  });
});
