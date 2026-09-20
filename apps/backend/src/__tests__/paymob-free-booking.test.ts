import { BookingStatus, PaymentStatus } from '@prisma/client';

/**
 * A booking whose whole price was covered (a promo, a credit) owes nothing.
 * Paymob refuses an intention for 0 ("amount ≥ 1"), and there is nothing to
 * collect anyway — so the pay endpoint settles it on the spot instead of
 * opening a checkout.
 */
const tx = {
  payment: { findFirst: jest.fn(), update: jest.fn() },
  booking: { findUnique: jest.fn(), update: jest.fn() },
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
import { createPaymobIntentionForBooking } from '@backend/services/paymob.service';
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

function approvedBooking(totalAmount: number) {
  return { id: 52, motherId: 10, status: BookingStatus.APPROVED, nannyProfileId: 19, totalAmount, payments: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(mother);
  mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.payment.create.mockResolvedValue({ id: 8 });
  mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));
  tx.payment.findFirst
    .mockResolvedValueOnce({ id: 8, bookingId: 52, status: PaymentStatus.PENDING })
    .mockResolvedValueOnce({ id: 8 });
  tx.payment.update.mockResolvedValue({ id: 8 });
  tx.booking.findUnique.mockResolvedValue({ id: 52, status: BookingStatus.APPROVED });
  tx.booking.update.mockResolvedValue({ id: 52, status: BookingStatus.CONFIRMED });
  (createPaymobApiClient as jest.Mock).mockReturnValue({ createIntention: jest.fn() });
});

describe('createPaymobIntentionForBooking — nothing owed', () => {
  it('settles the booking without Paymob: a zero captured payment, CONFIRMED, promo spent, nanny told', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(0));

    await expect(createPaymobIntentionForBooking(decoded, 52, body)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Nothing to pay — this booking is confirmed.',
    });

    expect(createPaymobApiClient).not.toHaveBeenCalled();
    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bookingId: 52, motherId: 10, amount: 0, status: PaymentStatus.PENDING }),
      }),
    );
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 8 }, data: expect.objectContaining({ status: PaymentStatus.CAPTURED }) }),
    );
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 52 }, data: { status: BookingStatus.CONFIRMED } }),
    );
    expect(redeemBookingPromoCodeOnCapture).toHaveBeenCalledWith(tx, 52);
    expect(notifyNannyBookingConfirmed).toHaveBeenCalled();
    expect(sendReceiptEmail).toHaveBeenCalledWith(expect.objectContaining({ paymobTransactionId: null }));
  });

  it('still opens a checkout when something is owed', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking(318));
    const createIntention = jest.fn().mockResolvedValue({ id: 'i', client_secret: 's' });
    (createPaymobApiClient as jest.Mock).mockReturnValue({ createIntention });
    mockPrisma.payment.update.mockResolvedValue({ id: 8 });

    const result = await createPaymobIntentionForBooking(decoded, 52, body);

    expect(createIntention).toHaveBeenCalledTimes(1);
    expect(result.clientSecret).toBe('s');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
