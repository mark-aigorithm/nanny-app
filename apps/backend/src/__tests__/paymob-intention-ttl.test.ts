import { BookingStatus, PaymentStatus } from '@prisma/client';

import { PAYMOB_INTENTION_TTL_MS } from '@backend/lib/paymob/constants';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
    payment: { update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
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

// Avoid pulling in booking.service's dependency graph — the intention flow only
// needs these three symbols to exist, and it never calls them.
jest.mock('@backend/services/booking.service', () => ({
  bookingInclude: {},
  canTransitionBookingStatus: jest.fn(),
  notifyNannyBookingConfirmed: jest.fn(),
}));

// paymob.service reaches booking-extension.service to settle extension
// captures; stubbing it keeps this suite off the notification/firebase chain.
jest.mock('@backend/services/booking-extension.service', () => ({
  applyPaidExtension: jest.fn(),
}));

jest.mock('@backend/lib/paymob/client', () => ({
  createPaymobApiClient: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import { createPaymobIntentionForBooking } from '@backend/services/paymob.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock };
  payment: { update: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
};
const mockCreateApiClient = createPaymobApiClient as jest.Mock;

const mother = {
  id: 10,
  role: 'MOTHER',
  phone: '+201000000000',
  email: 'mum@test.com',
  firstName: 'Mona',
  lastName: 'Mother',
  deletedAt: null,
};

function makePayment(anchorAt: Date) {
  return {
    id: 7,
    status: PaymentStatus.PENDING,
    deletedAt: null,
    paymobClientSecret: 'secret_old',
    paymobIntentionId: 'intention_old',
    paymobIntentionAttempt: 1,
    paymobReconcileAnchorAt: anchorAt,
    createdAt: anchorAt,
  };
}

function bookingWith(payment: ReturnType<typeof makePayment>) {
  return {
    id: 5,
    motherId: 10,
    status: BookingStatus.APPROVED,
    nannyProfileId: 19,
    totalAmount: 318,
    payments: [payment],
  };
}

const decoded = { uid: 'firebase-mother' } as never;

let createIntention: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(mother);
  mockPrisma.payment.update.mockResolvedValue({ id: 7 });
  mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.payment.create.mockResolvedValue({ id: 8 });
  createIntention = jest.fn().mockResolvedValue({ id: 'intention_new', client_secret: 'secret_new' });
  mockCreateApiClient.mockReturnValue({ createIntention });
});

describe('createPaymobIntentionForBooking — link freshness', () => {
  it('reuses the stored checkout link while it is still fresh', async () => {
    const anchor = new Date(Date.now() - 5 * 60_000); // 5 min old → fresh
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith(makePayment(anchor)));

    const result = await createPaymobIntentionForBooking(decoded, 5, { method: 'CARD' } as never);

    expect(result.clientSecret).toBe('secret_old');
    expect(result.intentionId).toBe('intention_old');
    expect(createIntention).not.toHaveBeenCalled();
  });

  it('regenerates a fresh link once the stored one is older than the TTL', async () => {
    const anchor = new Date(Date.now() - (PAYMOB_INTENTION_TTL_MS + 60_000)); // expired
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith(makePayment(anchor)));

    const result = await createPaymobIntentionForBooking(decoded, 5, { method: 'CARD' } as never);

    expect(createIntention).toHaveBeenCalledTimes(1);
    expect(result.clientSecret).toBe('secret_new');
    expect(result.intentionId).toBe('intention_new');
    // A stale link starts a NEW attempt: the old PENDING row is superseded and a
    // fresh payment row is created — not the old one mutated in place.
    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ bookingId: 5, status: PaymentStatus.PENDING }),
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    );
    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bookingId: 5, status: PaymentStatus.PENDING }),
      }),
    );
    // The intention id + secret are persisted onto the newly created row (id 8).
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 8 },
        data: expect.objectContaining({
          paymobIntentionId: 'intention_new',
          paymobClientSecret: 'secret_new',
        }),
      }),
    );
  });

  it('does not supersede or recreate when it resumes the fresh link', async () => {
    const anchor = new Date(Date.now() - 5 * 60_000); // fresh
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith(makePayment(anchor)));

    await createPaymobIntentionForBooking(decoded, 5, { method: 'CARD' } as never);

    // Resuming the same attempt must not retire it or open a second one.
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });
});
