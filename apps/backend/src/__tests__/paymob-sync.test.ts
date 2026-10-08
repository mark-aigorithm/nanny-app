import { BookingStatus, PaymentPurpose, PaymentStatus } from '@prisma/client';

import { PAYMOB_INTENTION_TTL_MS } from '@backend/lib/paymob/constants';

/**
 * Asking Paymob directly how a booking checkout stands, outside the webhook:
 * when the mother returns from checkout (syncPaymobPaymentForBooking) and just
 * before a booking is cancelled (bookingPaymentInProgress). Whatever Paymob
 * answers is settled on the spot through the same capture/fail paths the
 * webhook uses.
 */
const tx = {
  payment: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  booking: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
    payment: { findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/lib/config', () => ({
  config: {
    nodeEnv: 'test',
    paymob: {
      enabled: true,
      publicKey: 'pk_test',
      secretKey: 'sk_test',
      hmacSecret: 'hmac_test',
      apiBaseUrl: 'https://accept.paymob.com',
      paymentMethodIds: [1],
      publicApiUrl: 'https://api.test',
    },
  },
}));

jest.mock('@backend/services/booking.service', () => ({
  bookingInclude: {},
  canTransitionBookingStatus: jest.requireActual('@nanny-app/shared').canTransitionBookingStatus,
  notifyMotherBookingConfirmedFree: jest.fn(),
  notifyNannyBookingConfirmed: jest.fn(),
  notifyPaymentOnCancelledBooking: jest.fn(),
}));
jest.mock('@backend/services/booking-extension.service', () => ({ applyPaidExtension: jest.fn() }));
jest.mock('@backend/services/promo-code.service', () => ({ redeemBookingPromoCodeOnCapture: jest.fn() }));
jest.mock('@backend/services/email.service', () => ({ sendReceiptEmail: jest.fn() }));
jest.mock('@backend/services/package-payment.service', () => ({
  finalizePackagePaymentCaptured: jest.fn(),
  finalizePackagePaymentFailed: jest.fn(),
}));
jest.mock('@backend/lib/paymob/client', () => ({ createPaymobApiClient: jest.fn() }));

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import {
  notifyNannyBookingConfirmed,
  notifyPaymentOnCancelledBooking,
} from '@backend/services/booking.service';
import {
  bookingPaymentInProgress,
  confirmBookingWithoutPayment,
  syncPaymobPaymentForBooking,
} from '@backend/services/paymob.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock };
  payment: { findFirst: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};
const paymobConfig = config.paymob as { enabled: boolean };

const mother = { id: 10, role: 'MOTHER', phone: '+201000000000', deletedAt: null };
const decoded = { uid: 'firebase-mother' } as never;

const PAID = { transactions: [{ id: 991, success: true, pending: false }] };
const DECLINED = { transactions: [{ id: 992, success: false, pending: false }] };
const STILL_OPEN = { status: 'intended', transactions: [] };

let getIntentionElement: jest.Mock;

function paymobReports(element: object | Error) {
  if (element instanceof Error) getIntentionElement.mockRejectedValue(element);
  else getIntentionElement.mockResolvedValue(element);
}

type Attempt = {
  id: number;
  status: PaymentStatus;
  paymobClientSecret: string | null;
  paymobReconcileAnchorAt: Date | null;
  createdAt: Date;
};

function openAttempt(overrides: Partial<Attempt> = {}): Attempt {
  const openedAt = new Date(Date.now() - 2 * 60_000);
  return {
    id: 7,
    status: PaymentStatus.PENDING,
    paymobClientSecret: 'cs_open',
    paymobReconcileAnchorAt: openedAt,
    createdAt: openedAt,
    ...overrides,
  };
}

function bookingWith(payments: Attempt[], overrides: Record<string, unknown> = {}) {
  return { id: 52, motherId: 10, status: BookingStatus.APPROVED, nannyProfileId: 19, totalAmount: 318, payments, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  paymobConfig.enabled = true;
  mockPrisma.user.findUnique.mockResolvedValue(mother);
  mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));
  // Inside the capture transaction: the attempt is still PENDING, and once
  // captured the confirm gate finds it.
  tx.payment.findFirst.mockImplementation(async ({ where }: { where: { status: PaymentStatus } }) =>
    where.status === PaymentStatus.CAPTURED
      ? { id: 7 }
      : { id: 7, bookingId: 52, amount: 318, status: PaymentStatus.PENDING },
  );
  tx.payment.update.mockResolvedValue({ id: 7 });
  tx.booking.findUnique.mockResolvedValue({ id: 52, motherId: 10, status: BookingStatus.APPROVED, date: new Date() });
  tx.booking.update.mockResolvedValue({ id: 52, status: BookingStatus.CONFIRMED });
  getIntentionElement = jest.fn();
  (createPaymobApiClient as jest.Mock).mockReturnValue({ getIntentionElement });
});

describe('syncPaymobPaymentForBooking', () => {
  it('is a no-op when Paymob is not configured', async () => {
    paymobConfig.enabled = false;

    await expect(syncPaymobPaymentForBooking(decoded, 52)).resolves.toBeUndefined();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses an unknown caller with 401', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(syncPaymobPaymentForBooking(decoded, 52)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('404s for a booking that does not exist', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);
    await expect(syncPaymobPaymentForBooking(decoded, 52)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("403s for someone else's booking, without asking Paymob", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith([openAttempt()], { motherId: 99 }));

    await expect(syncPaymobPaymentForBooking(decoded, 52)).rejects.toMatchObject({ statusCode: 403 });
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no payment attempt', []],
    ['the latest attempt is already captured', [openAttempt({ status: PaymentStatus.CAPTURED })]],
    ['the latest attempt already failed', [openAttempt({ status: PaymentStatus.FAILED })]],
    ['the latest attempt has no checkout behind it', [openAttempt({ paymobClientSecret: null })]],
    // Only the newest attempt is the live one — an older pending one is the reconciler's job.
    ['only an older attempt is pending', [openAttempt({ id: 8, status: PaymentStatus.FAILED }), openAttempt()]],
  ])('does not ask Paymob when %s', async (_label, payments) => {
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith(payments));

    await syncPaymobPaymentForBooking(decoded, 52);

    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('captures and confirms a checkout Paymob reports as paid', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith([openAttempt()]));
    paymobReports(PAID);

    await syncPaymobPaymentForBooking(decoded, 52);

    expect(getIntentionElement).toHaveBeenCalledWith('pk_test', 'cs_open');
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: PaymentStatus.CAPTURED, paymobTransactionId: '991' }),
      }),
    );
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 52 }, data: { status: BookingStatus.CONFIRMED } }),
    );
    expect(notifyNannyBookingConfirmed).toHaveBeenCalledTimes(1);
  });

  it('marks a checkout Paymob reports as declined FAILED', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith([openAttempt()]));
    paymobReports(DECLINED);

    await syncPaymobPaymentForBooking(decoded, 52);

    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 7, deletedAt: null, status: PaymentStatus.PENDING },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'Paymob reported a failed payment.',
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
      },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('changes nothing while Paymob still reports the checkout open', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith([openAttempt()]));
    paymobReports(STILL_OPEN);

    await syncPaymobPaymentForBooking(decoded, 52);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('surfaces a Paymob outage to the caller and changes nothing', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith([openAttempt()]));
    paymobReports(new Error('Paymob intention inquiry failed: Bad Gateway'));

    await expect(syncPaymobPaymentForBooking(decoded, 52)).rejects.toThrow('Bad Gateway');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe('bookingPaymentInProgress — before a booking is cancelled', () => {
  it('says no when Paymob is not configured, without querying', async () => {
    paymobConfig.enabled = false;

    await expect(bookingPaymentInProgress(52)).resolves.toBe(false);
    expect(mockPrisma.payment.findFirst).not.toHaveBeenCalled();
  });

  it('looks only at the newest live BOOKING attempt that still has a checkout', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null);

    await expect(bookingPaymentInProgress(52)).resolves.toBe(false);
    expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith({
      where: {
        bookingId: 52,
        purpose: PaymentPurpose.BOOKING,
        status: PaymentStatus.PENDING,
        paymobClientSecret: { not: null },
        deletedAt: null,
      },
      orderBy: { id: 'desc' },
    });
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('says yes while Paymob still reports a fresh checkout open', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(openAttempt());
    paymobReports(STILL_OPEN);

    await expect(bookingPaymentInProgress(52)).resolves.toBe(true);
    expect(getIntentionElement).toHaveBeenCalledWith('pk_test', 'cs_open');
  });

  it('says no for a checkout whose link has expired, without asking Paymob', async () => {
    const openedAt = new Date(Date.now() - PAYMOB_INTENTION_TTL_MS);
    mockPrisma.payment.findFirst.mockResolvedValue(openAttempt({ paymobReconcileAnchorAt: openedAt, createdAt: openedAt }));

    await expect(bookingPaymentInProgress(52)).resolves.toBe(false);
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('judges a legacy attempt with no anchor by its creation time', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(
      openAttempt({ paymobReconcileAnchorAt: null, createdAt: new Date(Date.now() - PAYMOB_INTENTION_TTL_MS - 1) }),
    );

    await expect(bookingPaymentInProgress(52)).resolves.toBe(false);
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('settles a checkout that already went through — confirmed, not "in progress"', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(openAttempt());
    paymobReports(PAID);

    await expect(bookingPaymentInProgress(52)).resolves.toBe(false);
    // The caller re-reads the booking and so cancels a paid (CONFIRMED) one.
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: BookingStatus.CONFIRMED } }),
    );
    expect(notifyPaymentOnCancelledBooking).not.toHaveBeenCalled();
  });

  it('closes a checkout Paymob reports as declined and lets the cancel through', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(openAttempt());
    paymobReports(DECLINED);

    await expect(bookingPaymentInProgress(52)).resolves.toBe(false);
    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.FAILED }) }),
    );
  });

  it('lets the cancel through when Paymob cannot be reached, and logs it', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPrisma.payment.findFirst.mockResolvedValue(openAttempt());
    const outage = new Error('ETIMEDOUT');
    paymobReports(outage);

    await expect(bookingPaymentInProgress(52)).resolves.toBe(false);
    expect(errSpy).toHaveBeenCalledWith('[paymob] could not check an open checkout before cancelling', {
      bookingId: 52,
      err: outage,
    });
    errSpy.mockRestore();
  });
});

describe('confirmBookingWithoutPayment — earlier checkouts', () => {
  it('lets only a mother confirm a booking', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mother, role: 'NANNY' });

    await expect(confirmBookingWithoutPayment(decoded, 52)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only mothers can confirm bookings.',
    });
    expect(mockPrisma.booking.findUnique).not.toHaveBeenCalled();
  });

  it('refuses rather than guess when Paymob is switched off but an earlier checkout is still open', async () => {
    // The free confirm itself needs no Paymob, but an open attempt has to be
    // checked first — and with Paymob off that check cannot be made.
    paymobConfig.enabled = false;
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith([openAttempt()], { totalAmount: 0 }));

    await expect(confirmBookingWithoutPayment(decoded, 52)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Paymob is not configured on this server.',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks an earlier checkout Paymob reports as declined FAILED and confirms the booking for free', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(bookingWith([openAttempt()], { totalAmount: 0 }));
    paymobReports(DECLINED);
    tx.payment.create.mockResolvedValue({ id: 9 });
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.booking.findUnique.mockResolvedValue({ id: 52, status: BookingStatus.APPROVED });

    await confirmBookingWithoutPayment(decoded, 52);

    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 7 }),
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    );
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 0 }) }),
    );
  });

  it('checks only PENDING attempts that have a checkout behind them', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      bookingWith(
        [
          openAttempt({ id: 3, status: PaymentStatus.FAILED }),
          openAttempt({ id: 4, paymobClientSecret: null }),
        ],
        { totalAmount: 0 },
      ),
    );
    tx.payment.create.mockResolvedValue({ id: 9 });
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.booking.updateMany.mockResolvedValue({ count: 1 });

    await confirmBookingWithoutPayment(decoded, 52);

    expect(getIntentionElement).not.toHaveBeenCalled();
    expect(tx.payment.create).toHaveBeenCalled();
  });
});
