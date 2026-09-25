import { PaymentStatus } from '@prisma/client';

jest.mock('@backend/db/prisma', () => {
  const payment = { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
  const packagePurchase = { findUnique: jest.fn() };
  const user = { findUnique: jest.fn() };
  return {
    prisma: {
      payment,
      packagePurchase,
      user,
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ payment, packagePurchase })),
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

jest.mock('@backend/lib/paymob/client', () => ({ createPaymobApiClient: jest.fn() }));

jest.mock('@backend/services/package-hours.service', () => ({
  creditPurchaseHours: jest.fn().mockResolvedValue('CREDITED'),
}));

import { prisma } from '@backend/db/prisma';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import { creditPurchaseHours } from '@backend/services/package-hours.service';
import { PACKAGE_CHECKOUT_TTL_MS } from '@backend/lib/paymob/constants';
import {
  cancelPackageCheckout,
  createPaymobIntentionForPackagePurchase,
} from '@backend/services/package-payment.service';

const m = prisma as unknown as {
  payment: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  packagePurchase: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
};

const decoded = { uid: 'uid-7' } as DecodedIdToken;
let getIntentionElement: jest.Mock;
let createIntention: jest.Mock;

function purchaseWith(payment: Record<string, unknown> | null, overrides: Record<string, unknown> = {}) {
  return { id: 41, userId: 7, status: 'PENDING_PAYMENT', payments: payment ? [payment] : [], ...overrides };
}

const pendingPayment = { id: 100, status: PaymentStatus.PENDING, paymobClientSecret: 'secret_100' };

beforeEach(() => {
  jest.clearAllMocks();
  m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
  getIntentionElement = jest.fn().mockResolvedValue({ status: 'intended', transactions: [] });
  createIntention = jest.fn().mockResolvedValue({ id: 'int_1', client_secret: 'cs_1' });
  (createPaymobApiClient as jest.Mock).mockReturnValue({ getIntentionElement, createIntention });
});

describe('cancelPackageCheckout', () => {
  it('closes a checkout Paymob has no payment for', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));

    await expect(cancelPackageCheckout(decoded, 41)).resolves.toEqual({ status: PaymentStatus.FAILED });

    expect(m.payment.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 100, status: PaymentStatus.PENDING }),
      data: expect.objectContaining({
        status: PaymentStatus.FAILED,
        failureReason: 'Checkout cancelled by the parent.',
        paymobClientSecret: null,
      }),
    });
  });

  it('settles instead of cancelling when Paymob shows the payment went through', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));
    getIntentionElement.mockResolvedValue({ transactions: [{ id: 555, success: true, pending: false }] });
    m.payment.findFirst.mockResolvedValue({ id: 100, packagePurchaseId: 41, status: PaymentStatus.PENDING });

    await expect(cancelPackageCheckout(decoded, 41)).resolves.toEqual({ status: PaymentStatus.CAPTURED });

    expect(m.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.CAPTURED }) }),
    );
    expect(creditPurchaseHours).toHaveBeenCalled();
    expect(m.payment.updateMany).not.toHaveBeenCalled();
  });

  it('refuses (409) while Paymob is still processing a payment', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));
    // An earlier declined card followed by an attempt still in flight.
    getIntentionElement.mockResolvedValue({
      transactions: [
        { id: 554, success: false, pending: false },
        { id: 555, success: false, pending: true },
      ],
    });

    await expect(cancelPackageCheckout(decoded, 41)).rejects.toMatchObject({ statusCode: 409 });
    expect(m.payment.updateMany).not.toHaveBeenCalled();
  });

  it('leaves an already-settled payment alone', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith({ ...pendingPayment, status: PaymentStatus.FAILED }),
    );

    await expect(cancelPackageCheckout(decoded, 41)).resolves.toEqual({ status: PaymentStatus.FAILED });
    expect(getIntentionElement).not.toHaveBeenCalled();
    expect(m.payment.updateMany).not.toHaveBeenCalled();
  });

  it("refuses (403) another parent's purchase", async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment, { userId: 8 }));

    await expect(cancelPackageCheckout(decoded, 41)).rejects.toMatchObject({ statusCode: 403 });
    expect(m.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe('createPaymobIntentionForPackagePurchase', () => {
  it('tells Paymob to expire the checkout link when our open-checkout window closes', async () => {
    m.user.findUnique.mockResolvedValue({
      id: 7, deletedAt: null, phone: '+201000000000', email: 'm@x.com', firstName: 'M', lastName: 'X',
    });
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith(null, { pricePaid: '3000.00' }),
    );
    m.payment.create.mockResolvedValue({ id: 100 });

    await createPaymobIntentionForPackagePurchase(decoded, 41);

    // Seconds, per Paymob's API; left out, the link stays payable for 36 days.
    expect(createIntention).toHaveBeenCalledWith(
      expect.objectContaining({ expiration: PACKAGE_CHECKOUT_TTL_MS / 1000 }),
    );
    expect(PACKAGE_CHECKOUT_TTL_MS / 1000).toBe(900);
  });
});
