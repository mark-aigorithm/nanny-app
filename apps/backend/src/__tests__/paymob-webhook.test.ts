import { BookingStatus, PaymentPurpose, PaymentStatus } from '@prisma/client';

/**
 * processPaymobWebhook — the only door through which Paymob tells us money
 * moved. Every rule here protects real money: an unsigned or tampered callback
 * changes nothing, a replay changes nothing twice, each payment purpose is
 * settled by its own handler, and a capture that lands on a booking cancelled
 * mid-checkout is recorded and escalated instead of confirming the booking.
 *
 * Prisma is replaced by a tiny in-memory table (below) rather than one-shot
 * mock values, so replays and state guards (`status: PENDING`) behave as they
 * do against the real database.
 */
jest.mock('@backend/db/prisma', () => {
  const payment = { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
  const booking = { findUnique: jest.fn(), update: jest.fn() };
  const bookingAdjustment = { updateMany: jest.fn() };
  const client = { payment, booking, bookingAdjustment, $transaction: jest.fn() };
  return { prisma: client };
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

// The real transition table (it is pure, in @nanny-app/shared) decides what is
// confirmable; everything else booking.service does is stubbed.
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
import { buildTransactionHmacPlaintext, computePaymobHmacHex } from '@backend/lib/paymob/hmac';
import { coerceTransactionHmacPayload } from '@backend/lib/paymob/parse-webhook';
import { applyPaidExtension } from '@backend/services/booking-extension.service';
import {
  notifyNannyBookingConfirmed,
  notifyPaymentOnCancelledBooking,
} from '@backend/services/booking.service';
import { sendReceiptEmail } from '@backend/services/email.service';
import {
  finalizePackagePaymentCaptured,
  finalizePackagePaymentFailed,
} from '@backend/services/package-payment.service';
import { processPaymobWebhook } from '@backend/services/paymob.service';
import { redeemBookingPromoCodeOnCapture } from '@backend/services/promo-code.service';

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
  failureReason: string | null;
  deletedAt: Date | null;
};
type BookingRow = { id: number; motherId: number; status: BookingStatus; date: Date };
type AdjustmentRow = { id: number; status: string; paidAt: Date | null; deletedAt: Date | null };

let payments: Map<number, PaymentRow>;
let bookings: Map<number, BookingRow>;
let adjustments: Map<number, AdjustmentRow>;

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

/** Prisma ignores `undefined` in `data`; mirror that. */
function applyData<T extends object>(row: T, data: Record<string, unknown>): T {
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) (row as Record<string, unknown>)[k] = v;
  }
  return row;
}

const db = prisma as unknown as {
  payment: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  booking: { findUnique: jest.Mock; update: jest.Mock };
  bookingAdjustment: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

function wireDb() {
  db.payment.findFirst.mockImplementation(async ({ where, select }: { where: Where; select?: object }) => {
    const row = [...payments.values()].find((p) => matches(p, where)) ?? null;
    if (row && select) return Object.fromEntries(Object.keys(select).map((k) => [k, row[k as keyof PaymentRow]]));
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

function addPayment(overrides: Partial<PaymentRow> & { id: number }): PaymentRow {
  const row: PaymentRow = {
    purpose: PaymentPurpose.BOOKING,
    status: PaymentStatus.PENDING,
    amount: 318,
    bookingId: null,
    bookingExtensionId: null,
    bookingAdjustmentId: null,
    paymobTransactionId: null,
    paymobClientSecret: 'cs_live',
    failureReason: null,
    deletedAt: null,
    ...overrides,
  };
  payments.set(row.id, row);
  return row;
}

const BOOKING_DATE = new Date('2026-10-20T00:00:00.000Z');

function addBooking(id: number, status: BookingStatus): BookingRow {
  const row = { id, motherId: 10, status, date: BOOKING_DATE };
  bookings.set(id, row);
  return row;
}

// ── Signed Paymob callbacks ─────────────────────────────────────────────────

function transaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 991,
    amount_cents: 31_800,
    integration_id: 1,
    owner: 100,
    created_at: '2026-10-01T10:00:00.000Z',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    pending: false,
    success: true,
    order: { id: 777, merchant_order_id: '8' },
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    ...overrides,
  };
}

function sign(obj: Record<string, unknown>, secret = 'hmac_test'): string {
  return computePaymobHmacHex(buildTransactionHmacPlaintext(coerceTransactionHmacPayload(obj)), secret);
}

/** A webhook exactly as Paymob sends it: the envelope, plus the signature over `obj`. */
function webhook(overrides: Record<string, unknown> = {}) {
  const obj = transaction(overrides);
  return { rawBody: { type: 'TRANSACTION', obj }, hmacHex: sign(obj) };
}

const SUCCESS = { success: true, pending: false };
const DECLINED = { success: false, pending: false, data: { message: 'Insufficient funds' } };

const paymobConfig = config.paymob as { enabled: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  paymobConfig.enabled = true;
  payments = new Map();
  bookings = new Map();
  adjustments = new Map();
  wireDb();
});

// ── Authentication ──────────────────────────────────────────────────────────

describe('processPaymobWebhook — authentication', () => {
  it('refuses with 503 when Paymob is not configured on this server', async () => {
    paymobConfig.enabled = false;
    await expect(processPaymobWebhook(webhook())).rejects.toMatchObject({ statusCode: 503 });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('rejects a callback whose hmac is %s without touching the database', async (_label, hmacHex) => {
    addPayment({ id: 8, bookingId: 42 });
    const { rawBody } = webhook();

    await expect(processPaymobWebhook({ rawBody, hmacHex })).resolves.toEqual({ accepted: false });
    expect(db.payment.findFirst).not.toHaveBeenCalled();
    expect(payments.get(8)?.status).toBe(PaymentStatus.PENDING);
  });

  it('rejects a callback whose amount was changed after signing', async () => {
    addPayment({ id: 8, bookingId: 42 });
    const { rawBody, hmacHex } = webhook();
    rawBody.obj['amount_cents'] = 100;

    await expect(processPaymobWebhook({ rawBody, hmacHex })).resolves.toEqual({ accepted: false });
    expect(payments.get(8)?.status).toBe(PaymentStatus.PENDING);
  });

  it('rejects a declined transaction re-labelled as successful', async () => {
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.APPROVED);
    const { rawBody, hmacHex } = webhook(DECLINED);
    rawBody.obj['success'] = true;

    await expect(processPaymobWebhook({ rawBody, hmacHex })).resolves.toEqual({ accepted: false });
    expect(payments.get(8)?.status).toBe(PaymentStatus.PENDING);
    expect(bookings.get(42)?.status).toBe(BookingStatus.APPROVED);
  });

  it('rejects a callback signed with someone else’s secret', async () => {
    addPayment({ id: 8, bookingId: 42 });
    const obj = transaction();

    await expect(
      processPaymobWebhook({ rawBody: { type: 'TRANSACTION', obj }, hmacHex: sign(obj, 'not_our_secret') }),
    ).resolves.toEqual({ accepted: false });
    expect(payments.get(8)?.status).toBe(PaymentStatus.PENDING);
  });

  it('accepts the signature in upper case with surrounding whitespace', async () => {
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.APPROVED);
    const { rawBody, hmacHex } = webhook();

    await expect(
      processPaymobWebhook({ rawBody, hmacHex: ` ${hmacHex.toUpperCase()} ` }),
    ).resolves.toEqual({ accepted: true });
  });

  it('rejects a correctly signed callback that names no payment of ours', async () => {
    const { rawBody, hmacHex } = webhook({ order: { id: 777 } });

    await expect(processPaymobWebhook({ rawBody, hmacHex })).resolves.toEqual({ accepted: false });
    expect(db.payment.findFirst).not.toHaveBeenCalled();
  });

  it('accepts a raw transaction object posted without the TRANSACTION envelope', async () => {
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.APPROVED);
    const obj = transaction();

    await expect(processPaymobWebhook({ rawBody: obj, hmacHex: sign(obj) })).resolves.toEqual({ accepted: true });
    expect(payments.get(8)?.status).toBe(PaymentStatus.CAPTURED);
  });

  // The body is read before the signature is checked, so whatever anyone posts
  // must be refused cleanly — never a crash that answers 500.
  it('rejects a malformed body with no order object instead of crashing', async () => {
    const obj = transaction();
    delete obj['order'];
    await expect(processPaymobWebhook({ rawBody: obj, hmacHex: 'a'.repeat(128) })).resolves.toEqual({
      accepted: false,
    });
  });

  // The fields naming our payment aren't signed; the amount is. Holding the
  // signed amount to the named payment's amount is what stops a genuine
  // callback being replayed against a different payment.
  it('refuses a signed capture whose payment reference was swapped to another payment', async () => {
    addPayment({ id: 8, bookingId: 42, amount: 10 });
    addPayment({ id: 9, bookingId: 43, amount: 2000 });
    addBooking(43, BookingStatus.APPROVED);
    const { rawBody, hmacHex } = webhook({ amount_cents: 1_000, order: { id: 777, merchant_order_id: '8' } });
    (rawBody.obj['order'] as { merchant_order_id: string }).merchant_order_id = '9';

    await processPaymobWebhook({ rawBody, hmacHex });
    expect(payments.get(9)?.status).toBe(PaymentStatus.PENDING);
  });
});

// ── Booking payments ────────────────────────────────────────────────────────

describe('processPaymobWebhook — booking capture', () => {
  it('captures the payment, confirms the APPROVED booking, spends the promo, tells the nanny and sends the receipt', async () => {
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.APPROVED);

    await expect(processPaymobWebhook(webhook(SUCCESS))).resolves.toEqual({ accepted: true });

    expect(payments.get(8)).toMatchObject({
      status: PaymentStatus.CAPTURED,
      paymobTransactionId: '991',
      paymobClientSecret: null,
      failureReason: null,
    });
    expect(bookings.get(42)?.status).toBe(BookingStatus.CONFIRMED);
    expect(redeemBookingPromoCodeOnCapture).toHaveBeenCalledWith(db, 42);
    expect(notifyNannyBookingConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
    expect(sendReceiptEmail).toHaveBeenCalledWith(
      expect.objectContaining({ booking: expect.objectContaining({ id: 42 }), paymobTransactionId: '991' }),
    );
    expect(notifyPaymentOnCancelledBooking).not.toHaveBeenCalled();
  });

  it('resolves a retry attempt from its suffixed merchant order id', async () => {
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.APPROVED);

    await processPaymobWebhook(webhook({ order: { id: 777, merchant_order_id: '8-r3' } }));

    expect(payments.get(8)?.status).toBe(PaymentStatus.CAPTURED);
  });

  it('is idempotent: a replayed success confirms, notifies and emails only once', async () => {
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.APPROVED);
    const hook = webhook(SUCCESS);

    await processPaymobWebhook(hook);
    await expect(processPaymobWebhook(hook)).resolves.toEqual({ accepted: true });

    expect(db.booking.update).toHaveBeenCalledTimes(1);
    expect(redeemBookingPromoCodeOnCapture).toHaveBeenCalledTimes(1);
    expect(notifyNannyBookingConfirmed).toHaveBeenCalledTimes(1);
    expect(sendReceiptEmail).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a success for a payment id we have no row for without writing anything', async () => {
    await expect(processPaymobWebhook(webhook(SUCCESS))).resolves.toEqual({ accepted: true });

    expect(db.payment.update).not.toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
    expect(finalizePackagePaymentCaptured).not.toHaveBeenCalled();
    expect(applyPaidExtension).not.toHaveBeenCalled();
  });

  it('acknowledges a success for an already-captured payment without changing anything', async () => {
    addPayment({ id: 8, bookingId: 42, status: PaymentStatus.CAPTURED, paymobTransactionId: '991' });
    addBooking(42, BookingStatus.CONFIRMED);

    await expect(processPaymobWebhook(webhook({ ...SUCCESS, id: 992 }))).resolves.toEqual({ accepted: true });

    expect(payments.get(8)?.paymobTransactionId).toBe('991');
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(notifyNannyBookingConfirmed).not.toHaveBeenCalled();
  });

  // We give up on an attempt (timed out, superseded) well before its Paymob
  // link stops taking money. A success that lands after that is still money
  // she paid, so it is recorded, never dropped.
  it('records a capture that lands on an attempt the reconciler already timed out', async () => {
    addPayment({
      id: 8,
      bookingId: 42,
      status: PaymentStatus.FAILED,
      failureReason: 'Payment timed out waiting for Paymob confirmation.',
      paymobClientSecret: null,
    });
    addBooking(42, BookingStatus.APPROVED);

    await processPaymobWebhook(webhook(SUCCESS));

    expect(payments.get(8)).toMatchObject({ status: PaymentStatus.CAPTURED, paymobTransactionId: '991' });
  });

  it('records the money but confirms nothing when the booking row is gone', async () => {
    addPayment({ id: 8, bookingId: 42 });

    await processPaymobWebhook(webhook(SUCCESS));

    expect(payments.get(8)?.status).toBe(PaymentStatus.CAPTURED);
    expect(notifyNannyBookingConfirmed).not.toHaveBeenCalled();
    expect(notifyPaymentOnCancelledBooking).not.toHaveBeenCalled();
  });
});

describe('processPaymobWebhook — capture on a booking cancelled mid-checkout', () => {
  it.each([BookingStatus.CANCELLED, BookingStatus.REFUNDED])(
    'keeps the money on a %s booking, leaves its status alone and escalates it',
    async (status) => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      addPayment({ id: 8, bookingId: 42, amount: 318 });
      addBooking(42, status);

      await expect(processPaymobWebhook(webhook(SUCCESS))).resolves.toEqual({ accepted: true });

      expect(payments.get(8)).toMatchObject({ status: PaymentStatus.CAPTURED, paymobTransactionId: '991' });
      expect(bookings.get(42)?.status).toBe(status);
      // The amount is reported in EGP from our own row, not Paymob's cents.
      expect(notifyPaymentOnCancelledBooking).toHaveBeenCalledWith({
        bookingId: 42,
        motherId: 10,
        amount: 318,
        date: BOOKING_DATE,
        reason: 'CANCELLED',
      });
      expect(redeemBookingPromoCodeOnCapture).not.toHaveBeenCalled();
      expect(notifyNannyBookingConfirmed).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[paymob] captured payment for a non-confirmable booking',
        expect.objectContaining({ paymentId: 8, bookingId: 42, bookingStatus: status }),
      );
      warnSpy.mockRestore();
    },
  );

  it('escalates a stranded payment only once when Paymob replays the callback', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.CANCELLED);
    const hook = webhook(SUCCESS);

    await processPaymobWebhook(hook);
    await processPaymobWebhook(hook);

    expect(notifyPaymentOnCancelledBooking).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('records a second payment on a booking that was already paid, and escalates it as a duplicate', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.COMPLETED);

    await processPaymobWebhook(webhook(SUCCESS));

    expect(payments.get(8)?.status).toBe(PaymentStatus.CAPTURED);
    expect(bookings.get(42)?.status).toBe(BookingStatus.COMPLETED);
    expect(notifyPaymentOnCancelledBooking).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 42, amount: 318, reason: 'ALREADY_PAID' }),
    );
    expect(notifyNannyBookingConfirmed).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('processPaymobWebhook — declined and pending transactions', () => {
  it("marks a declined booking payment FAILED with Paymob's reason", async () => {
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.APPROVED);

    await expect(processPaymobWebhook(webhook(DECLINED))).resolves.toEqual({ accepted: true });

    expect(payments.get(8)).toMatchObject({
      status: PaymentStatus.FAILED,
      failureReason: 'Insufficient funds',
      paymobClientSecret: null,
    });
    expect(bookings.get(42)?.status).toBe(BookingStatus.APPROVED);
  });

  it.each([
    ['no data at all', { success: false, pending: false }],
    ['an empty message', { success: false, pending: false, data: { message: '' } }],
  ])('falls back to "Payment declined" when the decline carries %s', async (_label, flags) => {
    addPayment({ id: 8, bookingId: 42 });

    await processPaymobWebhook(webhook(flags));

    expect(payments.get(8)?.failureReason).toBe('Payment declined');
  });

  it('never downgrades a captured payment when a stale decline arrives after the success', async () => {
    addPayment({ id: 8, bookingId: 42 });
    addBooking(42, BookingStatus.APPROVED);

    await processPaymobWebhook(webhook(SUCCESS));
    await processPaymobWebhook(webhook({ ...DECLINED, id: 990 }));

    expect(payments.get(8)?.status).toBe(PaymentStatus.CAPTURED);
    expect(bookings.get(42)?.status).toBe(BookingStatus.CONFIRMED);
  });

  it('acknowledges a still-pending transaction without writing anything', async () => {
    addPayment({ id: 8, bookingId: 42 });

    await expect(processPaymobWebhook(webhook({ success: false, pending: true }))).resolves.toEqual({
      accepted: true,
    });

    expect(db.payment.findFirst).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(db.payment.updateMany).not.toHaveBeenCalled();
    expect(payments.get(8)?.status).toBe(PaymentStatus.PENDING);
  });
});

// ── Dispatch by purpose ─────────────────────────────────────────────────────

describe('processPaymobWebhook — dispatch by payment purpose', () => {
  it('hands a PACKAGE capture to the package settler and touches no booking', async () => {
    addPayment({ id: 8, purpose: PaymentPurpose.PACKAGE });

    await expect(processPaymobWebhook(webhook(SUCCESS))).resolves.toEqual({ accepted: true });

    expect(finalizePackagePaymentCaptured).toHaveBeenCalledWith(8, '991');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(payments.get(8)?.status).toBe(PaymentStatus.PENDING); // the package settler owns the write
  });

  it('hands a PACKAGE decline to the package settler with the reason', async () => {
    addPayment({ id: 8, purpose: PaymentPurpose.PACKAGE });

    await processPaymobWebhook(webhook(DECLINED));

    expect(finalizePackagePaymentFailed).toHaveBeenCalledWith(8, 'Insufficient funds');
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });

  it('captures a BOOKING_EXTENSION payment and applies the paid extension', async () => {
    addPayment({ id: 8, purpose: PaymentPurpose.BOOKING_EXTENSION, bookingExtensionId: 31 });

    await expect(processPaymobWebhook(webhook(SUCCESS))).resolves.toEqual({ accepted: true });

    expect(payments.get(8)).toMatchObject({ status: PaymentStatus.CAPTURED, paymobTransactionId: '991' });
    expect(applyPaidExtension).toHaveBeenCalledWith(31);
    expect(db.booking.update).not.toHaveBeenCalled();
    expect(finalizePackagePaymentCaptured).not.toHaveBeenCalled();
  });

  it('applies an extension only once when its capture is replayed', async () => {
    addPayment({ id: 8, purpose: PaymentPurpose.BOOKING_EXTENSION, bookingExtensionId: 31 });
    const hook = webhook(SUCCESS);

    await processPaymobWebhook(hook);
    await processPaymobWebhook(hook);

    expect(applyPaidExtension).toHaveBeenCalledTimes(1);
  });

  it('records an extension capture with no extension id but applies nothing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    addPayment({ id: 8, purpose: PaymentPurpose.BOOKING_EXTENSION, bookingExtensionId: null });

    await processPaymobWebhook(webhook(SUCCESS));

    expect(payments.get(8)?.status).toBe(PaymentStatus.CAPTURED);
    expect(applyPaidExtension).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[paymob] captured extension payment has no bookingExtensionId',
      { paymentId: 8 },
    );
    warnSpy.mockRestore();
  });

  it('marks a declined extension payment FAILED like any other (the extension stays payable)', async () => {
    addPayment({ id: 8, purpose: PaymentPurpose.BOOKING_EXTENSION, bookingExtensionId: 31 });

    await processPaymobWebhook(webhook(DECLINED));

    expect(payments.get(8)).toMatchObject({ status: PaymentStatus.FAILED, failureReason: 'Insufficient funds' });
    expect(applyPaidExtension).not.toHaveBeenCalled();
  });

  it('captures a BOOKING_ADJUSTMENT payment and marks the balance PAID', async () => {
    addPayment({ id: 8, purpose: PaymentPurpose.BOOKING_ADJUSTMENT, bookingAdjustmentId: 61 });
    adjustments.set(61, { id: 61, status: 'PENDING_PAYMENT', paidAt: null, deletedAt: null });

    await expect(processPaymobWebhook(webhook(SUCCESS))).resolves.toEqual({ accepted: true });

    expect(payments.get(8)).toMatchObject({ status: PaymentStatus.CAPTURED, paymobTransactionId: '991' });
    expect(adjustments.get(61)).toMatchObject({ status: 'PAID', paidAt: expect.any(Date) });
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it('never re-stamps a balance that is already PAID when the capture is replayed', async () => {
    addPayment({ id: 8, purpose: PaymentPurpose.BOOKING_ADJUSTMENT, bookingAdjustmentId: 61 });
    adjustments.set(61, { id: 61, status: 'PENDING_PAYMENT', paidAt: null, deletedAt: null });
    const hook = webhook(SUCCESS);

    await processPaymobWebhook(hook);
    const firstPaidAt = adjustments.get(61)?.paidAt;
    await processPaymobWebhook(hook);

    expect(db.bookingAdjustment.updateMany).toHaveBeenCalledTimes(1);
    expect(adjustments.get(61)?.paidAt).toBe(firstPaidAt);
  });

  it('records an adjustment capture with no adjustment id but marks nothing PAID', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    addPayment({ id: 8, purpose: PaymentPurpose.BOOKING_ADJUSTMENT, bookingAdjustmentId: null });

    await processPaymobWebhook(webhook(SUCCESS));

    expect(payments.get(8)?.status).toBe(PaymentStatus.CAPTURED);
    expect(db.bookingAdjustment.updateMany).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[paymob] captured adjustment payment has no bookingAdjustmentId',
      { paymentId: 8 },
    );
    warnSpy.mockRestore();
  });

  it('marks a declined adjustment payment FAILED and leaves the balance due', async () => {
    addPayment({ id: 8, purpose: PaymentPurpose.BOOKING_ADJUSTMENT, bookingAdjustmentId: 61 });
    adjustments.set(61, { id: 61, status: 'PENDING_PAYMENT', paidAt: null, deletedAt: null });

    await processPaymobWebhook(webhook(DECLINED));

    expect(payments.get(8)?.status).toBe(PaymentStatus.FAILED);
    expect(adjustments.get(61)?.status).toBe('PENDING_PAYMENT');
  });
});
