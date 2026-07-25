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

import { refundBookingPayment } from '@backend/services/payment-refund.service';

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
});
