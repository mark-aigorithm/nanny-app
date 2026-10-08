import { PaymentStatus } from '@prisma/client';

const paymentStore = {
  findMany: jest.fn(),
  updateMany: jest.fn(),
};

jest.mock('@backend/db/prisma', () => ({
  prisma: { payment: paymentStore },
}));

jest.mock('@backend/lib/config', () => ({
  config: {
    paymob: {
      enabled: true,
      publicKey: 'pk',
      secretKey: 'sk',
      apiBaseUrl: 'https://accept.paymob.com',
    },
  },
}));

const refundMock = jest.fn();
jest.mock('@backend/lib/paymob/client', () => ({
  createPaymobApiClient: () => ({ refund: refundMock }),
}));

import { config } from '@backend/lib/config';
import { refundBookingPayment } from '@backend/services/payment-refund.service';

const mockConfig = config as unknown as { paymob: { enabled: boolean } };

function payment(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    amount: 100,
    refundedAmount: 0,
    status: PaymentStatus.CAPTURED,
    paymobTransactionId: 'txn_1',
    ...over,
  };
}

describe('refundBookingPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.paymob.enabled = true;
    refundMock.mockResolvedValue({ id: 'r1', refundedAmountCents: null, success: true });
    paymentStore.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects when no single captured payment can cover the amount', async () => {
    paymentStore.findMany.mockResolvedValue([payment({ amount: 30 })]);
    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 50 })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('partial refund keeps the payment CAPTURED and increments refundedAmount', async () => {
    paymentStore.findMany.mockResolvedValue([payment({ amount: 100, refundedAmount: 0 })]);
    const res = await refundBookingPayment({ bookingId: 1, amountEgp: 40 });

    expect(refundMock).toHaveBeenCalledWith({ transactionId: 'txn_1', amountCents: 4000 });
    expect(res).toEqual({ paymentId: 1, refundedAmount: 40, status: PaymentStatus.CAPTURED });
    expect(paymentStore.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.CAPTURED, refundedAmount: 40 }),
      }),
    );
  });

  it('full refund flips the payment to REFUNDED', async () => {
    paymentStore.findMany.mockResolvedValue([payment({ amount: 100, refundedAmount: 60 })]);
    const res = await refundBookingPayment({ bookingId: 1, amountEgp: 40 });
    expect(res.status).toBe(PaymentStatus.REFUNDED);
    expect(res.refundedAmount).toBe(100);
  });

  it('surfaces a conflict when the conditional update matches no rows (race)', async () => {
    paymentStore.findMany.mockResolvedValue([payment()]);
    paymentStore.updateMany.mockResolvedValue({ count: 0 });
    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 10 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('refuses (400) when Paymob is not configured, before touching the ledger', async () => {
    mockConfig.paymob.enabled = false;

    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 10 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Paymob is not configured on this server.',
    });
    expect(paymentStore.findMany).not.toHaveBeenCalled();
  });

  it.each([0, -5, 0.004])('refuses (400) a refund of %p EGP, which rounds to nothing', async (amountEgp) => {
    await expect(refundBookingPayment({ bookingId: 1, amountEgp })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Refund amount must be positive.',
    });
    expect(paymentStore.findMany).not.toHaveBeenCalled();
  });

  it('looks only at live captured payments of the booking that have a Paymob transaction, newest first', async () => {
    paymentStore.findMany.mockResolvedValue([payment()]);

    await refundBookingPayment({ bookingId: 9, amountEgp: 10 });

    expect(paymentStore.findMany).toHaveBeenCalledWith({
      where: {
        bookingId: 9,
        status: PaymentStatus.CAPTURED,
        deletedAt: null,
        paymobTransactionId: { not: null },
      },
      orderBy: { id: 'desc' },
    });
  });

  it('refunds from the newest payment that can cover the whole amount, skipping ones that cannot', async () => {
    paymentStore.findMany.mockResolvedValue([
      payment({ id: 3, amount: 20, paymobTransactionId: 'txn_3' }),
      payment({ id: 2, amount: 100, refundedAmount: 90, paymobTransactionId: 'txn_2' }),
      payment({ id: 1, amount: 100, paymobTransactionId: 'txn_1' }),
    ]);

    const res = await refundBookingPayment({ bookingId: 1, amountEgp: 50 });

    expect(refundMock).toHaveBeenCalledWith({ transactionId: 'txn_1', amountCents: 5000 });
    expect(res.paymentId).toBe(1);
  });

  it('never splits a refund across two payments that could only cover it together', async () => {
    paymentStore.findMany.mockResolvedValue([
      payment({ id: 2, amount: 30, paymobTransactionId: 'txn_2' }),
      payment({ id: 1, amount: 30, paymobTransactionId: 'txn_1' }),
    ]);

    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 50 })).rejects.toMatchObject({
      message:
        'No single captured payment can cover this refund. Refund a smaller amount or use Care Points.',
    });
  });

  it('refuses a booking with no captured payments at all', async () => {
    paymentStore.findMany.mockResolvedValue([]);
    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('refuses a payment row with no Paymob transaction to refund against', async () => {
    paymentStore.findMany.mockResolvedValue([payment({ paymobTransactionId: null })]);
    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 10 })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('refuses an over-refund of a partly refunded payment', async () => {
    paymentStore.findMany.mockResolvedValue([payment({ amount: 100, refundedAmount: 70 })]);
    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 30.01 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('accepts refunding exactly the remaining balance despite Decimal float noise', async () => {
    // 0.1 + 0.2 style residue must not make the last cent unrefundable.
    paymentStore.findMany.mockResolvedValue([payment({ amount: 0.3, refundedAmount: 0.1 + 0.0 })]);
    const res = await refundBookingPayment({ bookingId: 1, amountEgp: 0.2 });
    expect(res).toEqual({ paymentId: 1, refundedAmount: 0.3, status: PaymentStatus.REFUNDED });
  });

  it('rounds the requested amount to 2dp before refunding and recording it', async () => {
    paymentStore.findMany.mockResolvedValue([payment({ amount: '100.00', refundedAmount: '10.10' })]);

    const res = await refundBookingPayment({ bookingId: 1, amountEgp: 12.345 });

    expect(refundMock).toHaveBeenCalledWith({ transactionId: 'txn_1', amountCents: 1235 });
    expect(res.refundedAmount).toBe(22.45);
  });

  it('refuses (400) and writes nothing when Paymob rejects the refund', async () => {
    paymentStore.findMany.mockResolvedValue([payment()]);
    refundMock.mockResolvedValue({ id: null, refundedAmountCents: null, success: false });

    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 10 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Paymob rejected the refund.',
    });
    expect(paymentStore.updateMany).not.toHaveBeenCalled();
  });

  it('records the refund conditionally on the refundedAmount it read', async () => {
    paymentStore.findMany.mockResolvedValue([payment({ refundedAmount: 5 })]);

    await refundBookingPayment({ bookingId: 1, amountEgp: 10 });

    expect(paymentStore.updateMany).toHaveBeenCalledWith({
      where: { id: 1, refundedAmount: 5, deletedAt: null },
      data: { refundedAmount: 15, refundedAt: expect.any(Date), status: PaymentStatus.CAPTURED },
    });
  });

  it('explains that the Paymob refund may have gone through when the ledger write loses a race', async () => {
    paymentStore.findMany.mockResolvedValue([payment()]);
    paymentStore.updateMany.mockResolvedValue({ count: 0 });

    await expect(refundBookingPayment({ bookingId: 1, amountEgp: 10 })).rejects.toMatchObject({
      message:
        'The payment changed while refunding. The Paymob refund may have succeeded — verify before retrying.',
    });
  });
});
