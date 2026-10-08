import { BookingExtensionStatus, BookingStatus, PaymentPurpose, PaymentStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';
import { PAYMOB_INTENTION_TTL_MS, PAYMOB_RECONCILE_OFFSETS_MS } from '@backend/lib/paymob/constants';

/**
 * Opening a Paymob checkout for each thing a mother can owe money on — a
 * booking, extra hours, or a balance after an admin edit. These pin who may
 * pay, what they are refused for, exactly what is sent to Paymob (amount in
 * cents, the retry-safe merchant reference, where Paymob calls back), and that
 * a Paymob failure leaves a FAILED attempt behind rather than a dangling one.
 * The link-freshness rules live in paymob-intention-ttl.test.ts.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
    bookingExtension: { findFirst: jest.fn() },
    bookingAdjustment: { findFirst: jest.fn() },
    payment: { update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
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
      paymentMethodIds: [11, 12],
      publicApiUrl: 'https://api.test',
    },
  },
}));

jest.mock('@backend/services/booking.service', () => ({
  bookingInclude: {},
  canTransitionBookingStatus: jest.fn(),
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
  createPaymobIntentionForAdjustment,
  createPaymobIntentionForBooking,
  createPaymobIntentionForExtension,
} from '@backend/services/paymob.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock };
  bookingExtension: { findFirst: jest.Mock };
  bookingAdjustment: { findFirst: jest.Mock };
  payment: { update: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};
const paymobConfig = config.paymob as { enabled: boolean };

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

type Attempt = {
  id: number;
  status: PaymentStatus;
  paymobClientSecret: string | null;
  paymobIntentionId: string | null;
  paymobIntentionAttempt: number;
  paymobReconcileAnchorAt: Date | null;
  createdAt: Date;
};

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  const now = new Date();
  return {
    id: 7,
    status: PaymentStatus.FAILED,
    paymobClientSecret: null,
    paymobIntentionId: null,
    paymobIntentionAttempt: 1,
    paymobReconcileAnchorAt: now,
    createdAt: now,
    ...overrides,
  };
}

function approvedBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    motherId: 10,
    status: BookingStatus.APPROVED,
    nannyProfileId: 19,
    totalAmount: 318,
    payments: [] as Attempt[],
    ...overrides,
  };
}

function acceptedExtension(overrides: Record<string, unknown> = {}) {
  return {
    id: 31,
    bookingId: 5,
    motherId: 10,
    status: BookingExtensionStatus.ACCEPTED,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    totalAmount: 120.5,
    payments: [] as Attempt[],
    ...overrides,
  };
}

function pendingAdjustment(overrides: Record<string, unknown> = {}) {
  return {
    id: 61,
    bookingId: 5,
    motherId: 10,
    status: 'PENDING_PAYMENT',
    amountEgp: 75.25,
    payments: [] as Attempt[],
    ...overrides,
  };
}

let createIntention: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  paymobConfig.enabled = true;
  mockPrisma.user.findUnique.mockResolvedValue(mother);
  mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking());
  mockPrisma.bookingExtension.findFirst.mockResolvedValue(acceptedExtension());
  mockPrisma.bookingAdjustment.findFirst.mockResolvedValue(pendingAdjustment());
  mockPrisma.payment.create.mockResolvedValue({ id: 8 });
  mockPrisma.payment.update.mockResolvedValue({ id: 8 });
  mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });
  createIntention = jest.fn().mockResolvedValue({ id: 'int_new', client_secret: 'cs_new' });
  (createPaymobApiClient as jest.Mock).mockReturnValue({ createIntention });
});

// ── Who may pay ─────────────────────────────────────────────────────────────

const checkouts = [
  ['booking', () => createPaymobIntentionForBooking(decoded, 5, body)],
  ['extension', () => createPaymobIntentionForExtension(decoded, 31, body)],
  ['adjustment', () => createPaymobIntentionForAdjustment(decoded, 61, body)],
] as const;

describe.each(checkouts)('%s checkout — common refusals', (_label, open) => {
  it('refuses when Paymob is not configured, before looking anyone up', async () => {
    paymobConfig.enabled = false;

    await expect(open()).rejects.toMatchObject({
      statusCode: 400,
      message: 'Paymob is not configured on this server.',
    });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses an unknown caller with 401', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(open()).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses a deleted account with 401', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mother, deletedAt: new Date() });
    await expect(open()).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses anyone who is not a mother with 403', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mother, role: 'NANNY' });
    await expect(open()).rejects.toMatchObject({ statusCode: 403 });
    expect(createIntention).not.toHaveBeenCalled();
  });

  it('asks for a phone number first — Paymob needs one in the billing data', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mother, phone: null });
    await expect(open()).rejects.toMatchObject({
      statusCode: 400,
      message: 'Add a phone number to your profile before paying.',
    });
    expect(createIntention).not.toHaveBeenCalled();
  });
});

describe('booking checkout — refusals', () => {
  it.each([
    ['the booking does not exist', null, 404],
    ["it is someone else's booking", approvedBooking({ motherId: 99 }), 403],
    ['the booking is not approved yet', approvedBooking({ status: BookingStatus.PENDING }), 400],
    ['the booking is already cancelled', approvedBooking({ status: BookingStatus.CANCELLED }), 400],
    ['no nanny is assigned', approvedBooking({ nannyProfileId: null }), 400],
    [
      'the booking is already paid',
      approvedBooking({ payments: [attempt({ status: PaymentStatus.CAPTURED })] }),
      400,
    ],
  ])('refuses when %s', async (_label, booking, statusCode) => {
    mockPrisma.booking.findUnique.mockResolvedValue(booking);

    await expect(createPaymobIntentionForBooking(decoded, 5, body)).rejects.toMatchObject({ statusCode });
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    expect(createIntention).not.toHaveBeenCalled();
  });
});

describe('extension checkout — refusals', () => {
  it.each([
    ['the extension does not exist', null, 404, 'Extension request not found.'],
    ["it is someone else's extension", acceptedExtension({ motherId: 99 }), 403, 'Access denied.'],
    [
      'the nanny has not accepted it',
      acceptedExtension({ status: BookingExtensionStatus.PENDING_NANNY }),
      400,
      "These extra hours can't be paid for — the request is pending_nanny.",
    ],
    [
      'its payment window has passed',
      acceptedExtension({ expiresAt: new Date(Date.now() - 1) }),
      400,
      'This extension request has expired. Ask your nanny again.',
    ],
    [
      'nothing is owed on it',
      acceptedExtension({ totalAmount: 0 }),
      400,
      'There is nothing to pay for this extension.',
    ],
    [
      'it is already paid',
      acceptedExtension({ payments: [attempt({ status: PaymentStatus.CAPTURED })] }),
      400,
      'These extra hours are already paid for.',
    ],
  ])('refuses when %s', async (_label, extension, statusCode, message) => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(extension);

    await expect(createPaymobIntentionForExtension(decoded, 31, body)).rejects.toMatchObject({
      statusCode,
      message,
    });
    expect(createIntention).not.toHaveBeenCalled();
  });
});

describe('adjustment checkout — refusals', () => {
  it.each([
    ['the balance does not exist', null, 404, 'Balance due not found.'],
    ["it is someone else's balance", pendingAdjustment({ motherId: 99 }), 403, 'Access denied.'],
    [
      'it was cancelled',
      pendingAdjustment({ status: 'CANCELLED' }),
      400,
      "This balance can't be paid — it is cancelled.",
    ],
    [
      'nothing is owed on it',
      pendingAdjustment({ amountEgp: 0 }),
      400,
      'There is nothing to pay for this adjustment.',
    ],
    [
      'it is already paid',
      pendingAdjustment({ payments: [attempt({ status: PaymentStatus.CAPTURED })] }),
      400,
      'This balance is already paid.',
    ],
  ])('refuses when %s', async (_label, adjustment, statusCode, message) => {
    mockPrisma.bookingAdjustment.findFirst.mockResolvedValue(adjustment);

    await expect(createPaymobIntentionForAdjustment(decoded, 61, body)).rejects.toMatchObject({
      statusCode,
      message,
    });
    expect(createIntention).not.toHaveBeenCalled();
  });
});

// ── What is sent to Paymob ──────────────────────────────────────────────────

describe('opening a new checkout', () => {
  it('records a PENDING attempt anchored now, polled first at the first reconcile offset', async () => {
    const before = Date.now();

    await createPaymobIntentionForBooking(decoded, 5, body);

    const { data } = mockPrisma.payment.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      bookingId: 5,
      purpose: PaymentPurpose.BOOKING,
      motherId: 10,
      amount: 318,
      currency: 'EGP',
      method: 'CARD',
      status: PaymentStatus.PENDING,
      paymobIntentionAttempt: 1,
      paymobReconcileAttempt: 0,
    });
    const anchor = (data['paymobReconcileAnchorAt'] as Date).getTime();
    expect(anchor).toBeGreaterThanOrEqual(before);
    expect((data['paymobNextReconcileAt'] as Date).getTime()).toBe(anchor + PAYMOB_RECONCILE_OFFSETS_MS[0]);
  });

  it('sends Paymob the amount in cents, our payment id as every reference, and our callback URLs', async () => {
    const result = await createPaymobIntentionForBooking(decoded, 5, body);

    expect(createPaymobApiClient).toHaveBeenCalledWith('sk_test', 'https://accept.paymob.com');
    expect(createIntention).toHaveBeenCalledWith({
      amount: 31_800,
      currency: 'EGP',
      payment_methods: [11, 12],
      billing_data: expect.objectContaining({
        email: 'mum@test.com',
        first_name: 'Mona',
        last_name: 'Mother',
        phone_number: '+201000000000',
        country: 'EG',
      }),
      merchant_order_id: '8',
      special_reference: '8',
      notification_url: 'https://api.test/webhooks/paymob',
      redirection_url: 'https://api.test/paymob/return?bookingId=5',
      extras: { payment_id: '8' },
      // The hosted link stops taking money when we stop reusing it.
      expiration: PAYMOB_INTENTION_TTL_MS / 1000,
    });
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { paymobIntentionId: 'int_new', paymobClientSecret: 'cs_new' },
    });
    expect(result).toEqual({
      paymentId: 8,
      clientSecret: 'cs_new',
      publicKey: 'pk_test',
      intentionId: 'int_new',
    });
  });

  it.each([
    [120.5, 12_050],
    [0.01, 1],
    // 1.15 * 100 is 114.99999999999999 in floating point — must still be 115, not 114.
    [1.15, 115],
    ['318.40', 31_840], // a Prisma Decimal stringifies like this
  ])('converts %p EGP to %i cents', async (totalAmount, cents) => {
    mockPrisma.booking.findUnique.mockResolvedValue(approvedBooking({ totalAmount }));

    await createPaymobIntentionForBooking(decoded, 5, body);

    expect(createIntention).toHaveBeenCalledWith(expect.objectContaining({ amount: cents }));
  });

  it('suffixes the merchant reference on a retry so Paymob never sees a duplicate order id', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      approvedBooking({ payments: [attempt({ status: PaymentStatus.FAILED, paymobIntentionAttempt: 2 })] }),
    );

    await createPaymobIntentionForBooking(decoded, 5, body);

    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymobIntentionAttempt: 3 }) }),
    );
    expect(createIntention).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant_order_id: '8-r3',
        special_reference: '8-r3',
        // The un-suffixed id still travels in extras so the webhook can find the row.
        extras: { payment_id: '8' },
      }),
    );
  });

  it('retires every still-PENDING attempt for the same booking before opening the new one', async () => {
    await createPaymobIntentionForBooking(decoded, 5, body);

    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 5, status: PaymentStatus.PENDING, deletedAt: null },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'Superseded by a new payment attempt.',
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
      },
    });
    expect(mockPrisma.payment.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.payment.create.mock.invocationCallOrder[0]!,
    );
  });

  it('opens a new attempt when the pending one never got an intention id', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      approvedBooking({
        payments: [attempt({ status: PaymentStatus.PENDING, paymobClientSecret: 'cs_old', paymobIntentionId: null })],
      }),
    );

    const result = await createPaymobIntentionForBooking(decoded, 5, body);

    expect(createIntention).toHaveBeenCalledTimes(1);
    expect(result.clientSecret).toBe('cs_new');
  });

  it('falls back to createdAt to judge freshness on a legacy attempt with no anchor', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      approvedBooking({
        payments: [
          attempt({
            status: PaymentStatus.PENDING,
            paymobClientSecret: 'cs_old',
            paymobIntentionId: 'int_old',
            paymobReconcileAnchorAt: null,
            createdAt: new Date(Date.now() - 60_000),
          }),
        ],
      }),
    );

    const result = await createPaymobIntentionForBooking(decoded, 5, body);

    expect(result).toEqual({ paymentId: 7, clientSecret: 'cs_old', publicKey: 'pk_test', intentionId: 'int_old' });
    expect(createIntention).not.toHaveBeenCalled();
  });
});

describe('when Paymob refuses or cannot be reached', () => {
  it("marks the new attempt FAILED with Paymob's message and rethrows the 502", async () => {
    const refusal = new AppError('Paymob intention failed: amount must be >= 1', 502);
    createIntention.mockRejectedValue(refusal);

    await expect(createPaymobIntentionForBooking(decoded, 5, body)).rejects.toBe(refusal);

    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'Paymob intention failed: amount must be >= 1',
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
        paymobIntentionId: null,
      },
    });
  });

  it('records a generic reason for a network error (no internals leak into the row)', async () => {
    const timeout = new TypeError('fetch failed: ETIMEDOUT 10.0.0.1:443');
    createIntention.mockRejectedValue(timeout);

    await expect(createPaymobIntentionForBooking(decoded, 5, body)).rejects.toBe(timeout);

    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 8 },
        data: expect.objectContaining({
          status: PaymentStatus.FAILED,
          failureReason: 'Paymob intention request failed.',
        }),
      }),
    );
  });
});

describe('extension checkout', () => {
  it('opens a BOOKING_EXTENSION attempt owned by the extension, for its agreed price', async () => {
    const result = await createPaymobIntentionForExtension(decoded, 31, body);

    expect(mockPrisma.bookingExtension.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 31, deletedAt: null } }),
    );
    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingExtensionId: 31, status: PaymentStatus.PENDING, deletedAt: null } }),
    );
    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingExtensionId: 31,
          purpose: PaymentPurpose.BOOKING_EXTENSION,
          amount: 120.5,
        }),
      }),
    );
    expect(mockPrisma.payment.create.mock.calls[0][0].data).not.toHaveProperty('bookingId');
    expect(createIntention).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12_050,
        redirection_url: 'https://api.test/paymob/return?bookingId=5&extensionId=31',
      }),
    );
    expect(result.paymentId).toBe(8);
  });

  it('resumes a fresh pending extension checkout instead of opening another', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(
      acceptedExtension({
        payments: [attempt({ status: PaymentStatus.PENDING, paymobClientSecret: 'cs_old', paymobIntentionId: 'int_old' })],
      }),
    );

    const result = await createPaymobIntentionForExtension(decoded, 31, body);

    expect(result.clientSecret).toBe('cs_old');
    expect(createIntention).not.toHaveBeenCalled();
  });
});

describe('adjustment checkout', () => {
  it('opens a BOOKING_ADJUSTMENT attempt owned by the adjustment, for the balance due', async () => {
    const result = await createPaymobIntentionForAdjustment(decoded, 61, body);

    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingAdjustmentId: 61, status: PaymentStatus.PENDING, deletedAt: null } }),
    );
    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingAdjustmentId: 61,
          purpose: PaymentPurpose.BOOKING_ADJUSTMENT,
          amount: 75.25,
        }),
      }),
    );
    expect(createIntention).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 7_525,
        redirection_url: 'https://api.test/paymob/return?bookingId=5&adjustmentId=61',
      }),
    );
    expect(result.intentionId).toBe('int_new');
  });
});
