import { BookingStatus, PaymentStatus } from '@prisma/client';

// `finalizePaymentCaptured` is module-private. `reconcileStalePaymobPayments` is
// the cleanest exported seam to reach it through: unlike `syncPaymobPaymentForBooking`
// or `processPaymobWebhook`, it needs no user/ownership lookup or HMAC signing —
// just a stale PENDING payment row and a captured intention element.
jest.mock('@backend/db/prisma', () => {
  const payment = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const booking = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  return {
    prisma: {
      payment,
      booking,
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ payment, booking })
          : Promise.all(arg as Promise<unknown>[]),
      ),
    },
  };
});

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

// Same rationale as paymob-intention-ttl.test.ts: avoid pulling in booking.service's
// dependency graph — this suite only needs these three symbols to exist as mocks.
jest.mock('@backend/services/booking.service', () => ({
  bookingInclude: {},
  canTransitionBookingStatus: jest.fn(),
  notifyNannyBookingConfirmed: jest.fn(),
}));

jest.mock('@backend/lib/paymob/client', () => ({
  createPaymobApiClient: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import {
  canTransitionBookingStatus,
  notifyNannyBookingConfirmed,
} from '@backend/services/booking.service';
import { reconcileStalePaymobPayments } from '@backend/services/paymob.service';

const mockPrisma = prisma as unknown as {
  payment: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  booking: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};
const mockCreateApiClient = createPaymobApiClient as jest.Mock;
const mockCanTransition = canTransitionBookingStatus as jest.Mock;
const mockNotifyConfirmed = notifyNannyBookingConfirmed as jest.Mock;

function staleRow(overrides: Record<string, unknown> = {}) {
  const anchor = new Date(Date.now() - 5 * 60_000);
  return {
    id: 100,
    paymobClientSecret: 'secret_100',
    paymobReconcileAttempt: 0,
    paymobReconcileAnchorAt: anchor,
    createdAt: anchor,
    ...overrides,
  };
}

// A single successful, non-pending transaction — mapIntentionElement reads this as 'captured'.
const capturedElement = {
  status: 'succeeded',
  transactions: [{ id: 555, success: true, pending: false }],
};

let getIntentionElement: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getIntentionElement = jest.fn().mockResolvedValue(capturedElement);
  mockCreateApiClient.mockReturnValue({ getIntentionElement });
});

describe('finalizePaymentCaptured (reached via reconcileStalePaymobPayments)', () => {
  it('bookingId present: looks up the booking and confirms it as before', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([staleRow()]);
    // Two findFirst calls: the initial PENDING load, then the confirm gate's
    // CAPTURED check. Route by the queried status so the gate sees a real
    // captured payment rather than the pre-capture row.
    mockPrisma.payment.findFirst.mockImplementation(
      async ({ where }: { where: { status: PaymentStatus } }) =>
        where.status === PaymentStatus.CAPTURED
          ? { id: 100 }
          : { id: 100, bookingId: 42, deletedAt: null, status: PaymentStatus.PENDING },
    );
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: 42,
      status: BookingStatus.APPROVED,
    });
    mockCanTransition.mockReturnValue(true);
    mockPrisma.booking.update.mockResolvedValue({ id: 42, status: BookingStatus.CONFIRMED });

    await reconcileStalePaymobPayments();

    expect(mockPrisma.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 } }),
    );
    expect(mockCanTransition).toHaveBeenCalledWith(BookingStatus.APPROVED, BookingStatus.CONFIRMED);
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: { status: BookingStatus.CONFIRMED },
      }),
    );
    expect(mockNotifyConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, status: BookingStatus.CONFIRMED }),
    );
    // The payment itself is still marked CAPTURED with the transaction id extracted
    // from the intention element.
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          status: PaymentStatus.CAPTURED,
          paymobTransactionId: '555',
        }),
      }),
    );
  });

  it('bookingId null: warns and returns without touching any booking', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockPrisma.payment.findMany.mockResolvedValue([staleRow()]);
    mockPrisma.payment.findFirst.mockResolvedValue({
      id: 100,
      bookingId: null,
      deletedAt: null,
      status: PaymentStatus.PENDING,
    });
    mockPrisma.payment.update.mockResolvedValue({});

    await reconcileStalePaymobPayments();

    // Payment is still recorded as captured...
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({ status: PaymentStatus.CAPTURED }),
      }),
    );
    // ...but the guard fires instead of dereferencing a null bookingId.
    expect(warnSpy).toHaveBeenCalledWith(
      '[paymob] captured payment has no bookingId',
      expect.objectContaining({ paymentId: 100 }),
    );
    expect(mockPrisma.booking.findUnique).not.toHaveBeenCalled();
    expect(mockCanTransition).not.toHaveBeenCalled();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockNotifyConfirmed).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('refuses to confirm a booking when no captured payment can be found', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockPrisma.payment.findMany.mockResolvedValue([staleRow()]);
    // The initial PENDING load succeeds, but the confirm gate's CAPTURED lookup
    // finds nothing — so the booking must NOT be confirmed.
    mockPrisma.payment.findFirst.mockImplementation(
      async ({ where }: { where: { status: PaymentStatus } }) =>
        where.status === PaymentStatus.CAPTURED
          ? null
          : { id: 100, bookingId: 42, deletedAt: null, status: PaymentStatus.PENDING },
    );
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.booking.findUnique.mockResolvedValue({ id: 42, status: BookingStatus.APPROVED });
    mockCanTransition.mockReturnValue(true);

    await reconcileStalePaymobPayments();

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockNotifyConfirmed).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[paymob] refusing to confirm a booking with no captured payment',
      expect.objectContaining({ paymentId: 100, bookingId: 42 }),
    );

    warnSpy.mockRestore();
  });
});
