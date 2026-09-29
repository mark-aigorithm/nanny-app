import { BookingStatus, PaymentStatus } from '@prisma/client';

/**
 * A booking whose whole price was covered (a promo, a credit) owes nothing.
 * Paymob refuses an intention for 0 ("amount ≥ 1"), and there is nothing to
 * collect anyway — so it is settled on the spot with a zero payment instead of
 * opening a checkout. These pin the guards around that: it never confirms a
 * booking that owes money, even one whose total changes mid-confirm, and it
 * never drops a payment an earlier checkout may already have taken.
 */
const tx = {
  payment: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  booking: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
    payment: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/lib/config', () => ({
  config: {
    paymob: {
      enabled: true,
      publicKey: 'pk_test',
      secretKey: 'sk_test',
      apiBaseUrl: 'https://accept.paymob.com',
      paymentMethodIds: [1],
      publicApiUrl: 'https://api.test',
    },
  },
}));

jest.mock('@backend/services/booking.service', () => ({
  bookingInclude: {},
  canTransitionBookingStatus: jest.fn(() => true),
  notifyNannyBookingConfirmed: jest.fn(),
}));
jest.mock('@backend/services/booking-extension.service', () => ({ applyPaidExtension: jest.fn() }));
jest.mock('@backend/services/promo-code.service', () => ({ redeemBookingPromoCodeOnCapture: jest.fn() }));
jest.mock('@backend/services/email.service', () => ({ sendReceiptEmail: jest.fn() }));
jest.mock('@backend/lib/paymob/client', () => ({ createPaymobApiClient: jest.fn() }));

import { prisma } from '@backend/db/prisma';
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import { notifyNannyBookingConfirmed } from '@backend/services/booking.service';
import { sendReceiptEmail } from '@backend/services/email.service';
import {
  confirmBookingWithoutPayment,
  createPaymobIntentionForBooking,
} from '@backend/services/paymob.service';
import { redeemBookingPromoCodeOnCapture } from '@backend/services/promo-code.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock };
  payment: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

const mother = {
  id: 10,
  role: 'MOTHER',
  phone: '+201000000000',
  email: 'mum@test.com',
  firstName: 'Mona',
  lastName: 'Mother',
  deletedAt: null,
};

const decoded = { uid: 'firebase-mother' } as never;
const body = { method: 'CARD' } as never;

type Attempt = { id: number; status: PaymentStatus; paymobClientSecret: string | null };

function approvedBooking(totalAmount: number, payments: Attempt[] = []) {
  return { id: 52, motherId: 10, status: BookingStatus.APPROVED, nannyProfileId: 19, totalAmount, payments };
}

/** A checkout opened before the discount, whose Paymob link is still live. */
const openAttempt: Attempt = { id: 7, status: PaymentStatus.PENDING, paymobClientSecret: 'cs_open' };

function paymobReports(element: object | Error) {
  const getIntentionElement =
    element instanceof Error ? jest.fn().mockRejectedValue(element) : jest.fn().mockResolvedValue(element);
  (createPaymobApiClient as jest.Mock).mockReturnValue({ getIntentionElement, createIntention: jest.fn() });
  return getIntentionElement;
}

const PAID = { transactions: [{ id: 991, success: true, pending: false }] };
const UNPAID = { transactions: [], status: 'intended' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(mother);
  mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));
  tx.payment.updateMany.mockResolvedValue({ count: 0 });
  tx.payment.create.mockResolvedValue({ id: 8 });
  tx.payment.findFirst.mockImplementation(async ({ where }: { where: { id?: number } }) =>
    where.id ? { id: where.id, bookingId: 52, status: PaymentStatus.PENDING } : { id: where.id ?? 8 },
  );
  tx.payment.update.mockResolvedValue({ id: 8 });
  tx.booking.findUnique.mockResolvedValue({ id: 52, status: BookingStatus.APPROVED });
  tx.booking.update.mockResolvedValue({ id: 52, status: BookingStatus.CONFIRMED });
  tx.booking.updateMany.mockResolvedValue({ count: 1 });
  (createPaymobApiClient as jest.Mock).mockReturnValue({ createIntention: jest.fn(), getIntentionElement: jest.fn() });
});

describe('createPaymobIntentionForBooking — nothing owed', () => {
  it('settles the booking without Paymob: a zero captured payment, CONFIRMED, promo spent, nanny told', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(0));

    await expect(createPaymobIntentionForBooking(decoded, 52, body)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Nothing to pay — this booking is confirmed.',
    });

    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bookingId: 52, motherId: 10, amount: 0, status: PaymentStatus.PENDING }),
      }),
    );
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 8 }, data: expect.objectContaining({ status: PaymentStatus.CAPTURED }) }),
    );
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 52, status: BookingStatus.APPROVED, totalAmount: { lte: 0 }, deletedAt: null },
      data: { status: BookingStatus.CONFIRMED },
    });
    expect(redeemBookingPromoCodeOnCapture).toHaveBeenCalledWith(tx, 52);
    expect(notifyNannyBookingConfirmed).toHaveBeenCalled();
    expect(sendReceiptEmail).toHaveBeenCalledWith(expect.objectContaining({ paymobTransactionId: null }));
  });

  it('still opens a checkout when something is owed', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(318));
    const createIntention = jest.fn().mockResolvedValue({ id: 'i', client_secret: 's' });
    (createPaymobApiClient as jest.Mock).mockReturnValue({ createIntention });
    mockPrisma.payment.create.mockResolvedValue({ id: 8 });
    mockPrisma.payment.update.mockResolvedValue({ id: 8 });

    const result = await createPaymobIntentionForBooking(decoded, 52, body);

    expect(createIntention).toHaveBeenCalledTimes(1);
    expect(result.clientSecret).toBe('s');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('confirmBookingWithoutPayment', () => {
  it('confirms a fully covered booking through the capture path, without Paymob', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(0));

    await confirmBookingWithoutPayment(decoded, 52);

    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bookingId: 52, motherId: 10, amount: 0, method: 'CARD' }),
      }),
    );
    expect(tx.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ totalAmount: { lte: 0 } }) }),
    );
    expect(redeemBookingPromoCodeOnCapture).toHaveBeenCalledWith(tx, 52);
    expect(notifyNannyBookingConfirmed).toHaveBeenCalled();
    expect(sendReceiptEmail).toHaveBeenCalledWith(expect.objectContaining({ paymobTransactionId: null }));
  });

  it('needs no phone number — nothing is being charged', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mother, phone: null });
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(0));

    await expect(confirmBookingWithoutPayment(decoded, 52)).resolves.toBeUndefined();
  });

  it('refuses a booking that still owes money', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(318));

    await expect(confirmBookingWithoutPayment(decoded, 52)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back when the total went back up between the check and the confirm', async () => {
    // Read as 0; by the write, a Care Points refund has put 318 back on it — the
    // conditional UPDATE matches nothing.
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(0));
    tx.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(confirmBookingWithoutPayment(decoded, 52)).rejects.toMatchObject({ statusCode: 409 });

    // Thrown from inside the transaction, so the zero payment and its capture
    // roll back with it — and nobody is told the booking is confirmed.
    await expect(mockPrisma.$transaction.mock.results[0]?.value).rejects.toMatchObject({ statusCode: 409 });
    expect(notifyNannyBookingConfirmed).not.toHaveBeenCalled();
    expect(sendReceiptEmail).not.toHaveBeenCalled();
  });

  it('refuses a booking that is not awaiting payment', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ ...approvedBooking(0), status: BookingStatus.PENDING });

    await expect(confirmBookingWithoutPayment(decoded, 52)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses someone else's booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ ...approvedBooking(0), motherId: 99 });

    await expect(confirmBookingWithoutPayment(decoded, 52)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('confirmBookingWithoutPayment — a checkout opened earlier', () => {
  it('records the payment Paymob already took and refuses the free confirm', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(0, [openAttempt]));
    const getIntentionElement = paymobReports(PAID);

    await expect(confirmBookingWithoutPayment(decoded, 52)).rejects.toMatchObject({
      statusCode: 400,
      message: 'This booking is already paid.',
    });

    expect(getIntentionElement).toHaveBeenCalledWith('pk_test', 'cs_open');
    // The real payment was captured — the ordinary path, with its transaction id…
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: PaymentStatus.CAPTURED, paymobTransactionId: '991' }),
      }),
    );
    // …and no zero payment was recorded beside it.
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('leaves an unpaid open attempt pending so a late payment is still recorded', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(0, [openAttempt]));
    paymobReports(UNPAID);

    await confirmBookingWithoutPayment(decoded, 52);

    // Only attempts with no Paymob intention behind them are retired.
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ paymobClientSecret: null }) }),
    );
    expect(tx.payment.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
    expect(tx.payment.create).toHaveBeenCalled();
    expect(notifyNannyBookingConfirmed).toHaveBeenCalled();
  });

  it('confirms nothing when Paymob cannot be asked about the open attempt', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(0, [openAttempt]));
    paymobReports(new Error('Paymob unreachable'));

    await expect(confirmBookingWithoutPayment(decoded, 52)).rejects.toThrow('Paymob unreachable');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
