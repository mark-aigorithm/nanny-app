import { BookingStatus, PaymentPurpose, PaymentStatus } from '@prisma/client';

import { PAYMOB_RECONCILE_OFFSETS_MS } from '@backend/lib/paymob/constants';

/**
 * reconcileStalePaymobPayments — the safety net for webhooks Paymob never
 * delivered. It polls each overdue PENDING intention, settles what Paymob
 * reports as captured/failed through the same per-purpose handlers the webhook
 * uses, backs off along PAYMOB_RECONCILE_OFFSETS_MS while it is still pending,
 * and gives up (FAILED, timed out) after the last offset. A Paymob outage must
 * never lose or settle a payment — it just waits for the next tick.
 */
jest.mock('@backend/db/prisma', () => {
  const payment = { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
  const booking = { findUnique: jest.fn(), update: jest.fn() };
  const bookingAdjustment = { updateMany: jest.fn() };
  return { prisma: { payment, booking, bookingAdjustment, $transaction: jest.fn() } };
});

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
import { applyPaidExtension } from '@backend/services/booking-extension.service';
import {
  notifyNannyBookingConfirmed,
  notifyPaymentOnCancelledBooking,
} from '@backend/services/booking.service';
import {
  finalizePackagePaymentCaptured,
  finalizePackagePaymentFailed,
} from '@backend/services/package-payment.service';
import {
  reconcileStalePaymobPayments,
  startPaymobReconciliationScheduler,
} from '@backend/services/paymob.service';

// ── In-memory tables ────────────────────────────────────────────────────────

type PaymentRow = {
  id: number;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  amount: number;
  bookingId: number | null;
  bookingExtensionId: number | null;
  bookingAdjustmentId: number | null;
  paymobTransactionId: string | null;
  paymobClientSecret: string | null;
  paymobReconcileAttempt: number;
  paymobReconcileAnchorAt: Date | null;
  paymobNextReconcileAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

let payments: Map<number, PaymentRow>;
let bookings: Map<number, { id: number; motherId: number; status: BookingStatus; date: Date }>;
let adjustments: Map<number, { id: number; status: string; paidAt: Date | null; deletedAt: Date | null }>;

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected === null) return actual == null;
    if (typeof expected === 'object' && expected !== null && 'not' in expected) {
      return actual !== (expected as { not: unknown }).not;
    }
    if (typeof expected === 'object' && expected !== null && 'in' in expected) {
      return (expected as { in: unknown[] }).in.includes(actual);
    }
    return actual === expected;
  });
}

function applyData<T extends object>(row: T, data: Record<string, unknown>): T {
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) (row as Record<string, unknown>)[k] = v;
  }
  return row;
}

const db = prisma as unknown as {
  payment: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  booking: { findUnique: jest.Mock; update: jest.Mock };
  bookingAdjustment: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

function wireDb() {
  // The reconciler's own selection (status, due date, has a secret) is pinned
  // by a dedicated test; here findMany just hands back every row we seeded.
  db.payment.findMany.mockImplementation(async () => [...payments.values()].map((p) => ({ ...p })));
  db.payment.findFirst.mockImplementation(async ({ where }: { where: Where }) => {
    const row = [...payments.values()].find((p) => matches(p, where));
    return row ? { ...row } : null;
  });
  db.payment.update.mockImplementation(async ({ where, data }: { where: { id: number }; data: Where }) => {
    const row = payments.get(where.id);
    if (!row) throw new Error(`payment ${where.id} not found`);
    return { ...applyData(row, data) };
  });
  db.payment.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Where }) => {
    const rows = [...payments.values()].filter((p) => matches(p, where));
    rows.forEach((r) => applyData(r, data));
    return { count: rows.length };
  });
  db.booking.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => {
    const row = bookings.get(where.id);
    return row ? { ...row } : null;
  });
  db.booking.update.mockImplementation(async ({ where, data }: { where: { id: number }; data: Where }) => {
    const row = bookings.get(where.id);
    if (!row) throw new Error(`booking ${where.id} not found`);
    return { ...applyData(row, data) };
  });
  db.bookingAdjustment.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Where }) => {
    const rows = [...adjustments.values()].filter((a) => matches(a, where));
    rows.forEach((r) => applyData(r, data));
    return { count: rows.length };
  });
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(db));
}

const ANCHOR = new Date('2026-10-01T10:00:00.000Z');

function addStale(overrides: Partial<PaymentRow> & { id: number }): PaymentRow {
  const row: PaymentRow = {
    purpose: PaymentPurpose.BOOKING,
    status: PaymentStatus.PENDING,
    amount: 318,
    bookingId: 42,
    bookingExtensionId: null,
    bookingAdjustmentId: null,
    paymobTransactionId: null,
    paymobClientSecret: `cs_${overrides.id}`,
    paymobReconcileAttempt: 0,
    paymobReconcileAnchorAt: ANCHOR,
    paymobNextReconcileAt: new Date(ANCHOR.getTime() + PAYMOB_RECONCILE_OFFSETS_MS[0]),
    failureReason: null,
    createdAt: ANCHOR,
    deletedAt: null,
    ...overrides,
  };
  payments.set(row.id, row);
  return row;
}

// ── Paymob intention-element answers ────────────────────────────────────────

const CAPTURED = { status: 'succeeded', transactions: [{ id: 555, success: true, pending: false }] };
const CAPTURED_NO_TXN_ID = { transactions: [{ success: true, pending: false }] };
const DECLINED = { transactions: [{ id: 556, success: false, pending: false }] };
const STILL_OPEN = { status: 'intended', transactions: [] };

let getIntentionElement: jest.Mock;

function paymobAnswers(byClientSecret: Record<string, object | Error>) {
  getIntentionElement.mockImplementation(async (_pk: string, cs: string) => {
    const answer = byClientSecret[cs];
    if (answer === undefined) throw new Error(`unexpected inquiry for ${cs}`);
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

const mutableConfig = config as unknown as { nodeEnv: string; paymob: { enabled: boolean } };

beforeEach(() => {
  jest.clearAllMocks();
  mutableConfig.paymob.enabled = true;
  mutableConfig.nodeEnv = 'test';
  payments = new Map();
  bookings = new Map();
  adjustments = new Map();
  wireDb();
  getIntentionElement = jest.fn();
  (createPaymobApiClient as jest.Mock).mockReturnValue({ getIntentionElement });
});

describe('reconcileStalePaymobPayments — selection', () => {
  it('does nothing at all when Paymob is not configured', async () => {
    mutableConfig.paymob.enabled = false;

    await reconcileStalePaymobPayments();

    expect(db.payment.findMany).not.toHaveBeenCalled();
    expect(createPaymobApiClient).not.toHaveBeenCalled();
  });

  it('polls only live PENDING payments that are due and still have a checkout, oldest-due first, 50 at a time', async () => {
    await reconcileStalePaymobPayments();

    expect(db.payment.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: PaymentStatus.PENDING,
        paymobNextReconcileAt: { lte: expect.any(Date) },
        paymobClientSecret: { not: null },
      },
      take: 50,
      orderBy: { paymobNextReconcileAt: 'asc' },
    });
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('asks Paymob with the public key and each row’s client secret', async () => {
    addStale({ id: 100 });
    paymobAnswers({ cs_100: STILL_OPEN });

    await reconcileStalePaymobPayments();

    expect(createPaymobApiClient).toHaveBeenCalledWith('sk_test', 'https://accept.paymob.com');
    expect(getIntentionElement).toHaveBeenCalledWith('pk_test', 'cs_100');
  });

  it('skips a row whose client secret has been cleared without asking Paymob', async () => {
    addStale({ id: 100, paymobClientSecret: null });

    await reconcileStalePaymobPayments();

    expect(getIntentionElement).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
  });
});

describe('reconcileStalePaymobPayments — captured', () => {
  it('captures a BOOKING payment with the transaction id Paymob reports and confirms the booking', async () => {
    addStale({ id: 100 });
    bookings.set(42, { id: 42, motherId: 10, status: BookingStatus.APPROVED, date: ANCHOR });
    paymobAnswers({ cs_100: CAPTURED });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)).toMatchObject({
      status: PaymentStatus.CAPTURED,
      paymobTransactionId: '555',
      paymobNextReconcileAt: null,
      paymobClientSecret: null,
    });
    expect(bookings.get(42)?.status).toBe(BookingStatus.CONFIRMED);
    expect(notifyNannyBookingConfirmed).toHaveBeenCalledTimes(1);
  });

  it('still captures when Paymob reports a successful transaction without an id', async () => {
    addStale({ id: 100 });
    bookings.set(42, { id: 42, motherId: 10, status: BookingStatus.APPROVED, date: ANCHOR });
    paymobAnswers({ cs_100: CAPTURED_NO_TXN_ID });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)).toMatchObject({ status: PaymentStatus.CAPTURED, paymobTransactionId: null });
    expect(bookings.get(42)?.status).toBe(BookingStatus.CONFIRMED);
  });

  it('escalates a capture it discovers on a booking cancelled while she was paying', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    addStale({ id: 100, amount: 450 });
    bookings.set(42, { id: 42, motherId: 10, status: BookingStatus.CANCELLED, date: ANCHOR });
    paymobAnswers({ cs_100: CAPTURED });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)?.status).toBe(PaymentStatus.CAPTURED);
    expect(bookings.get(42)?.status).toBe(BookingStatus.CANCELLED);
    expect(notifyPaymentOnCancelledBooking).toHaveBeenCalledWith({
      bookingId: 42,
      motherId: 10,
      amount: 450,
      date: ANCHOR,
      reason: 'CANCELLED',
    });
    expect(notifyNannyBookingConfirmed).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it.each([
    [PaymentPurpose.BOOKING_EXTENSION, { bookingExtensionId: 31 }],
    [PaymentPurpose.BOOKING_ADJUSTMENT, { bookingAdjustmentId: 61 }],
  ])('still captures a %s payment when Paymob reports no transaction id', async (purpose, owner) => {
    addStale({ id: 100, purpose, bookingId: null, ...owner });
    adjustments.set(61, { id: 61, status: 'PENDING_PAYMENT', paidAt: null, deletedAt: null });
    paymobAnswers({ cs_100: CAPTURED_NO_TXN_ID });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)).toMatchObject({ status: PaymentStatus.CAPTURED, paymobTransactionId: null });
  });

  it('hands a PACKAGE capture to the package settler', async () => {
    addStale({ id: 100, purpose: PaymentPurpose.PACKAGE, bookingId: null });
    paymobAnswers({ cs_100: CAPTURED });

    await reconcileStalePaymobPayments();

    expect(finalizePackagePaymentCaptured).toHaveBeenCalledWith(100, '555');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('captures a BOOKING_EXTENSION payment and applies the extension', async () => {
    addStale({ id: 100, purpose: PaymentPurpose.BOOKING_EXTENSION, bookingId: null, bookingExtensionId: 31 });
    paymobAnswers({ cs_100: CAPTURED });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)?.status).toBe(PaymentStatus.CAPTURED);
    expect(applyPaidExtension).toHaveBeenCalledWith(31);
    expect(finalizePackagePaymentCaptured).not.toHaveBeenCalled();
  });

  it('captures a BOOKING_ADJUSTMENT payment and marks the balance PAID', async () => {
    addStale({ id: 100, purpose: PaymentPurpose.BOOKING_ADJUSTMENT, bookingId: null, bookingAdjustmentId: 61 });
    adjustments.set(61, { id: 61, status: 'PENDING_PAYMENT', paidAt: null, deletedAt: null });
    paymobAnswers({ cs_100: CAPTURED });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)?.status).toBe(PaymentStatus.CAPTURED);
    expect(adjustments.get(61)?.status).toBe('PAID');
    expect(applyPaidExtension).not.toHaveBeenCalled();
  });
});

describe('reconcileStalePaymobPayments — failed', () => {
  it.each([PaymentPurpose.BOOKING, PaymentPurpose.BOOKING_EXTENSION, PaymentPurpose.BOOKING_ADJUSTMENT])(
    'marks a declined %s payment FAILED',
    async (purpose) => {
      addStale({ id: 100, purpose });
      paymobAnswers({ cs_100: DECLINED });

      await reconcileStalePaymobPayments();

      expect(payments.get(100)).toMatchObject({
        status: PaymentStatus.FAILED,
        failureReason: 'Paymob reported a failed payment.',
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
      });
      expect(finalizePackagePaymentFailed).not.toHaveBeenCalled();
    },
  );

  it('reads a "voided" intention status as failed even with no transaction', async () => {
    addStale({ id: 100 });
    paymobAnswers({ cs_100: { status: 'VOIDED', transactions: [] } });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)?.status).toBe(PaymentStatus.FAILED);
  });

  it('hands a declined PACKAGE payment to the package settler', async () => {
    addStale({ id: 100, purpose: PaymentPurpose.PACKAGE, bookingId: null });
    paymobAnswers({ cs_100: DECLINED });

    await reconcileStalePaymobPayments();

    expect(finalizePackagePaymentFailed).toHaveBeenCalledWith(100, 'Paymob reported a failed payment.');
    expect(payments.get(100)?.status).toBe(PaymentStatus.PENDING); // the package settler owns the write
  });
});

describe('reconcileStalePaymobPayments — still pending: backoff and timeout', () => {
  it('schedules the next poll at the next offset from the intention anchor', async () => {
    addStale({ id: 100, paymobReconcileAttempt: 0 });
    paymobAnswers({ cs_100: STILL_OPEN });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)).toMatchObject({
      status: PaymentStatus.PENDING,
      paymobReconcileAttempt: 1,
      paymobNextReconcileAt: new Date(ANCHOR.getTime() + PAYMOB_RECONCILE_OFFSETS_MS[1]),
    });
  });

  it.each([1, 2, 3])('steps from attempt %i to the matching offset — anchored to T0, not to now', async (attempt) => {
    addStale({ id: 100, paymobReconcileAttempt: attempt });
    paymobAnswers({ cs_100: STILL_OPEN });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)).toMatchObject({
      paymobReconcileAttempt: attempt + 1,
      paymobNextReconcileAt: new Date(ANCHOR.getTime() + PAYMOB_RECONCILE_OFFSETS_MS[attempt + 1]!),
    });
  });

  it('anchors a legacy row with no reconcile anchor to its creation time', async () => {
    const createdAt = new Date('2026-09-30T08:00:00.000Z');
    addStale({ id: 100, paymobReconcileAnchorAt: null, createdAt });
    paymobAnswers({ cs_100: STILL_OPEN });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)?.paymobNextReconcileAt).toEqual(
      new Date(createdAt.getTime() + PAYMOB_RECONCILE_OFFSETS_MS[1]),
    );
  });

  it('times a payment out as FAILED once the last offset has been polled', async () => {
    addStale({ id: 100, paymobReconcileAttempt: PAYMOB_RECONCILE_OFFSETS_MS.length - 1 });
    paymobAnswers({ cs_100: STILL_OPEN });

    await reconcileStalePaymobPayments();

    expect(payments.get(100)).toMatchObject({
      status: PaymentStatus.FAILED,
      failureReason: 'Payment timed out waiting for Paymob confirmation.',
      paymobNextReconcileAt: null,
      paymobClientSecret: null,
    });
  });

  it('times out a PACKAGE payment through the package settler', async () => {
    addStale({ id: 100, purpose: PaymentPurpose.PACKAGE, paymobReconcileAttempt: PAYMOB_RECONCILE_OFFSETS_MS.length - 1 });
    paymobAnswers({ cs_100: STILL_OPEN });

    await reconcileStalePaymobPayments();

    expect(finalizePackagePaymentFailed).toHaveBeenCalledWith(
      100,
      'Payment timed out waiting for Paymob confirmation.',
    );
  });
});

describe('reconcileStalePaymobPayments — Paymob unreachable', () => {
  it('leaves a row exactly as it was when Paymob errors, and carries on with the rest', async () => {
    addStale({ id: 100 });
    addStale({ id: 101, bookingId: 43 });
    bookings.set(43, { id: 43, motherId: 10, status: BookingStatus.APPROVED, date: ANCHOR });
    const before = { ...payments.get(100) };
    paymobAnswers({ cs_100: new Error('ETIMEDOUT'), cs_101: CAPTURED });

    await expect(reconcileStalePaymobPayments()).resolves.toBeUndefined();

    expect(payments.get(100)).toEqual(before);
    expect(payments.get(101)?.status).toBe(PaymentStatus.CAPTURED);
    expect(bookings.get(43)?.status).toBe(BookingStatus.CONFIRMED);
  });

  it('swallows a failure inside a settler too, so one bad row never stalls the batch', async () => {
    addStale({ id: 100, purpose: PaymentPurpose.PACKAGE });
    addStale({ id: 101, bookingId: 43 });
    (finalizePackagePaymentCaptured as jest.Mock).mockRejectedValueOnce(new Error('deadlock'));
    paymobAnswers({ cs_100: CAPTURED, cs_101: DECLINED });

    await expect(reconcileStalePaymobPayments()).resolves.toBeUndefined();

    expect(payments.get(101)?.status).toBe(PaymentStatus.FAILED);
  });
});

describe('startPaymobReconciliationScheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('starts nothing when Paymob is not configured', () => {
    mutableConfig.paymob.enabled = false;
    mutableConfig.nodeEnv = 'production';

    startPaymobReconciliationScheduler();
    jest.advanceTimersByTime(60_000);

    expect(db.payment.findMany).not.toHaveBeenCalled();
  });

  it('starts nothing under test, so suites never poll in the background', () => {
    startPaymobReconciliationScheduler();
    jest.advanceTimersByTime(60_000);

    expect(db.payment.findMany).not.toHaveBeenCalled();
  });

  it('ticks once after 5s and then every 15s', () => {
    mutableConfig.nodeEnv = 'production';

    startPaymobReconciliationScheduler();

    jest.advanceTimersByTime(4_999);
    expect(db.payment.findMany).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); // 5s: the warm-up tick
    expect(db.payment.findMany).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10_000); // 15s: first interval tick
    expect(db.payment.findMany).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(15_000); // 30s
    expect(db.payment.findMany).toHaveBeenCalledTimes(3);
  });
});
