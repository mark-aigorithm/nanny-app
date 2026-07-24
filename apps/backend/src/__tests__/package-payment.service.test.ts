import { BookingStatus, PaymentStatus } from '@prisma/client';

// Purpose dispatch is the risk this suite exists to pin down. `finalizePaymentCaptured`
// and the new package handler are both reached through `reconcileStalePaymobPayments`:
// unlike `processPaymobWebhook` it needs no HMAC, and unlike `syncPaymobPaymentForBooking`
// it needs no user/ownership lookup — just a stale PENDING row and a captured element.
// (Same seam, and same rationale, as paymob-finalize-captured.test.ts.)
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
  const packagePurchase = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  return {
    prisma: {
      payment,
      booking,
      packagePurchase,
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ payment, booking, packagePurchase })
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

// The hours engine is already unit-tested on its own; here we only care THAT it is
// invoked (and how many times), not what it does internally.
jest.mock('@backend/services/package-hours.service', () => ({
  creditPurchaseHours: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import {
  canTransitionBookingStatus,
  notifyNannyBookingConfirmed,
} from '@backend/services/booking.service';
import { creditPurchaseHours } from '@backend/services/package-hours.service';
import { finalizePackagePaymentCaptured } from '@backend/services/package-payment.service';
import { reconcileStalePaymobPayments } from '@backend/services/paymob.service';

const mockPrisma = prisma as unknown as {
  payment: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  booking: { findUnique: jest.Mock; update: jest.Mock };
};
const mockCreateApiClient = createPaymobApiClient as jest.Mock;
const mockCanTransition = canTransitionBookingStatus as jest.Mock;
const mockNotifyConfirmed = notifyNannyBookingConfirmed as jest.Mock;
const mockCreditPurchaseHours = creditPurchaseHours as jest.Mock;

function staleRow(overrides: Record<string, unknown> = {}) {
  const anchor = new Date(Date.now() - 5 * 60_000);
  return {
    id: 100,
    purpose: 'BOOKING',
    paymobClientSecret: 'secret_100',
    paymobReconcileAttempt: 0,
    paymobReconcileAnchorAt: anchor,
    createdAt: anchor,
    ...overrides,
  };
}

// One successful, non-pending transaction — read as 'captured'.
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

describe('purpose dispatch on capture', () => {
  it('PACKAGE payment: credits hours and never touches the booking path', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockPrisma.payment.findMany.mockResolvedValue([
      staleRow({ purpose: 'PACKAGE' }),
    ]);
    mockPrisma.payment.findFirst.mockResolvedValue({
      id: 100,
      purpose: 'PACKAGE',
      bookingId: null,
      packagePurchaseId: 77,
      deletedAt: null,
      status: PaymentStatus.PENDING,
    });
    mockPrisma.payment.update.mockResolvedValue({});

    await reconcileStalePaymobPayments();

    // The money is recorded...
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({
          status: PaymentStatus.CAPTURED,
          paymobTransactionId: '555',
        }),
      }),
    );
    // ...and the hours are actually granted.
    expect(mockCreditPurchaseHours).toHaveBeenCalledTimes(1);
    expect(mockCreditPurchaseHours).toHaveBeenCalledWith(expect.anything(), 77);

    // The booking-confirmation path is never entered.
    expect(mockPrisma.booking.findUnique).not.toHaveBeenCalled();
    expect(mockCanTransition).not.toHaveBeenCalled();
    expect(mockNotifyConfirmed).not.toHaveBeenCalled();

    // Regression guard for the original trap: a PACKAGE capture must NOT fall through
    // to finalizePaymentCaptured's null-bookingId guard and get logged-and-dropped.
    expect(warnSpy).not.toHaveBeenCalledWith(
      '[paymob] captured payment has no bookingId',
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('BOOKING payment: still confirms the booking exactly as before', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([staleRow({ purpose: 'BOOKING' })]);
    mockPrisma.payment.findFirst.mockResolvedValue({
      id: 100,
      purpose: 'BOOKING',
      bookingId: 42,
      packagePurchaseId: null,
      deletedAt: null,
      status: PaymentStatus.PENDING,
    });
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: 42,
      status: BookingStatus.APPROVED,
    });
    mockCanTransition.mockReturnValue(true);
    mockPrisma.booking.update.mockResolvedValue({
      id: 42,
      status: BookingStatus.CONFIRMED,
    });

    await reconcileStalePaymobPayments();

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: { status: BookingStatus.CONFIRMED },
      }),
    );
    expect(mockNotifyConfirmed).toHaveBeenCalled();
    // Booking payments must never reach the hours engine.
    expect(mockCreditPurchaseHours).not.toHaveBeenCalled();
  });
});

describe('finalizePackagePaymentCaptured idempotency', () => {
  it('credits hours once when the same capture is delivered twice', async () => {
    // Models the DB after the first call: the row is no longer PENDING, so the
    // `status: PENDING` filter finds nothing on the replay.
    mockPrisma.payment.findFirst
      .mockResolvedValueOnce({
        id: 100,
        purpose: 'PACKAGE',
        bookingId: null,
        packagePurchaseId: 77,
        deletedAt: null,
        status: PaymentStatus.PENDING,
      })
      .mockResolvedValueOnce(null);
    mockPrisma.payment.update.mockResolvedValue({});

    await finalizePackagePaymentCaptured(100, '555');
    await finalizePackagePaymentCaptured(100, '555');

    expect(mockCreditPurchaseHours).toHaveBeenCalledTimes(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the payment has no linked purchase', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue({
      id: 100,
      purpose: 'PACKAGE',
      bookingId: null,
      packagePurchaseId: null,
      deletedAt: null,
      status: PaymentStatus.PENDING,
    });

    await finalizePackagePaymentCaptured(100, '555');

    expect(mockCreditPurchaseHours).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });

  it('keeps the payment CAPTURED but does not roll back when the active slot is taken', async () => {
    // The parent paid for a package they cannot activate because they already
    // hold an active one. The money was taken, so the CAPTURED write must stand
    // (no throw, no rollback) and the situation is logged for a human to resolve.
    mockPrisma.payment.findFirst.mockResolvedValue({
      id: 100,
      purpose: 'PACKAGE',
      bookingId: null,
      packagePurchaseId: 77,
      deletedAt: null,
      status: PaymentStatus.PENDING,
    });
    mockPrisma.payment.update.mockResolvedValue({});
    mockCreditPurchaseHours.mockResolvedValue('SLOT_TAKEN');
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(finalizePackagePaymentCaptured(100, '555')).resolves.toBeUndefined();

    // The capture is still recorded — the transaction is NOT rolled back.
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({ status: PaymentStatus.CAPTURED }),
      }),
    );
    expect(errSpy).toHaveBeenCalledWith(
      '[packages] captured payment could not be activated: active slot taken',
      expect.objectContaining({ paymentId: 100, purchaseId: 77 }),
    );
    errSpy.mockRestore();
  });
});
