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
import { config } from '@backend/lib/config';
import { AppError } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import { creditPurchaseHours } from '@backend/services/package-hours.service';
import { PACKAGE_CHECKOUT_TTL_MS, PAYMOB_RECONCILE_OFFSETS_MS } from '@backend/lib/paymob/constants';
import {
  cancelPackageCheckout,
  createPaymobIntentionForPackagePurchase,
  finalizePackagePaymentFailed,
  syncPaymobPaymentForPackagePurchase,
} from '@backend/services/package-payment.service';

const m = prisma as unknown as {
  payment: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  packagePurchase: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
};

const mockConfig = config as unknown as { paymob: { enabled: boolean } };

const decoded = { uid: 'uid-7' } as DecodedIdToken;
let getIntentionElement: jest.Mock;
let createIntention: jest.Mock;

function purchaseWith(payment: Record<string, unknown> | null, overrides: Record<string, unknown> = {}) {
  return { id: 41, userId: 7, status: 'PENDING_PAYMENT', payments: payment ? [payment] : [], ...overrides };
}

const pendingPayment = { id: 100, status: PaymentStatus.PENDING, paymobClientSecret: 'secret_100' };

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.paymob.enabled = true;
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

// ── Shared fixtures for the intention / sync / cancel guards ────────────────

const payer = {
  id: 7,
  deletedAt: null,
  phone: '+201000000000',
  email: 'm@x.com',
  firstName: 'M',
  lastName: 'X',
};

describe('createPaymobIntentionForPackagePurchase guards', () => {
  beforeEach(() => {
    m.user.findUnique.mockResolvedValue(payer);
  });

  it('refuses (400) when Paymob is not configured on the server', async () => {
    mockConfig.paymob.enabled = false;

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Paymob is not configured on this server.',
    });
    expect(m.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses (401) a caller with no user row', async () => {
    m.user.findUnique.mockResolvedValue(null);

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('refuses (401) a caller whose account was deleted', async () => {
    m.user.findUnique.mockResolvedValue({ ...payer, deletedAt: new Date() });

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('refuses (400) a parent with no phone number, which Paymob billing requires', async () => {
    m.user.findUnique.mockResolvedValue({ ...payer, phone: null });

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Add a phone number to your profile before paying.',
    });
  });

  it('refuses (404) an unknown or deleted purchase', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(null);

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Package purchase not found.',
    });
  });

  it("refuses (403) to open a checkout for another parent's purchase", async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(null, { userId: 8 }));

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(m.payment.create).not.toHaveBeenCalled();
  });

  it('refuses (400) a purchase that is no longer awaiting payment', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(null, { status: 'ACTIVE' }));

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot pay for a purchase in status ACTIVE.',
    });
  });

  it('refuses (400) a purchase that already has a captured payment', async () => {
    m.packagePurchase.findUnique.mockResolvedValue({
      ...purchaseWith(null),
      payments: [
        { id: 101, status: PaymentStatus.FAILED },
        { id: 100, status: PaymentStatus.CAPTURED },
      ],
    });

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 400,
      message: 'This package purchase is already paid.',
    });
    expect(m.payment.create).not.toHaveBeenCalled();
  });
});

describe('createPaymobIntentionForPackagePurchase resume window', () => {
  const NOW = new Date('2026-06-01T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    m.user.findUnique.mockResolvedValue(payer);
    m.payment.create.mockResolvedValue({ id: 102 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function livePending(overrides: Record<string, unknown> = {}) {
    return {
      id: 101,
      status: PaymentStatus.PENDING,
      paymobClientSecret: 'cs_old',
      paymobIntentionId: 'int_old',
      paymobIntentionAttempt: 1,
      paymobReconcileAnchorAt: new Date(NOW.getTime() - 60_000),
      createdAt: new Date(NOW.getTime() - 60_000),
      ...overrides,
    };
  }

  it('hands back the open checkout instead of minting a new attempt', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith(livePending(), { pricePaid: '3000.00' }),
    );

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).resolves.toEqual({
      paymentId: 101,
      clientSecret: 'cs_old',
      publicKey: 'pk_test',
      intentionId: 'int_old',
    });
    expect(m.payment.updateMany).not.toHaveBeenCalled();
    expect(m.payment.create).not.toHaveBeenCalled();
    expect(createIntention).not.toHaveBeenCalled();
  });

  it('falls back to createdAt when a legacy row has no intention anchor', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith(livePending({ paymobReconcileAnchorAt: null }), { pricePaid: '3000.00' }),
    );

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).resolves.toMatchObject({
      paymentId: 101,
    });

    // …and that fallback expires too.
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith(
        livePending({
          paymobReconcileAnchorAt: null,
          createdAt: new Date(NOW.getTime() - PACKAGE_CHECKOUT_TTL_MS),
        }),
        { pricePaid: '3000.00' },
      ),
    );
    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).resolves.toMatchObject({
      paymentId: 102,
    });
  });

  it('opens a new attempt once the old checkout is exactly at its expiry', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith(
        livePending({ paymobReconcileAnchorAt: new Date(NOW.getTime() - PACKAGE_CHECKOUT_TTL_MS) }),
        { pricePaid: '3000.00' },
      ),
    );

    const r = await createPaymobIntentionForPackagePurchase(decoded, 41);

    expect(r).toEqual({ paymentId: 102, clientSecret: 'cs_1', publicKey: 'pk_test', intentionId: 'int_1' });
    // The stale attempt is retired so the reconciler stops polling it.
    expect(m.payment.updateMany).toHaveBeenCalledWith({
      where: { packagePurchaseId: 41, status: PaymentStatus.PENDING, deletedAt: null },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'Superseded by a new payment attempt.',
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
      },
    });
    // Attempt 2 gets a suffixed merchant order id so it stays unique at Paymob.
    expect(createIntention).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_order_id: '102-r2', special_reference: '102-r2' }),
    );
    expect(m.payment.create.mock.calls[0][0].data).toMatchObject({ paymobIntentionAttempt: 2 });
  });

  it.each([
    ['not PENDING', { status: PaymentStatus.FAILED }],
    ['missing its client secret', { paymobClientSecret: null }],
    ['missing its intention id', { paymobIntentionId: null }],
  ])('does not resume a latest attempt that is %s', async (_label, overrides) => {
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith(livePending(overrides), { pricePaid: '3000.00' }),
    );

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).resolves.toMatchObject({
      paymentId: 102,
    });
    expect(m.payment.create).toHaveBeenCalledTimes(1);
  });

  it('records a first attempt with the purchase price, in piastres to Paymob', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(null, { pricePaid: '1234.56' }));

    await createPaymobIntentionForPackagePurchase(decoded, 41);

    expect(m.payment.create).toHaveBeenCalledWith({
      data: {
        packagePurchaseId: 41,
        motherId: 7,
        purpose: 'PACKAGE',
        amount: 1234.56,
        currency: 'EGP',
        method: 'CARD',
        status: PaymentStatus.PENDING,
        paymobIntentionAttempt: 1,
        paymobReconcileAnchorAt: NOW,
        paymobReconcileAttempt: 0,
        paymobNextReconcileAt: new Date(NOW.getTime() + PAYMOB_RECONCILE_OFFSETS_MS[0]),
      },
    });
    expect(createIntention).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 123456,
        currency: 'EGP',
        payment_methods: [1],
        merchant_order_id: '102',
        notification_url: 'https://api.test/webhooks/paymob',
        redirection_url: 'https://api.test/paymob/return?purchaseId=41',
        extras: { payment_id: '102' },
        billing_data: expect.objectContaining({
          email: 'm@x.com',
          first_name: 'M',
          last_name: 'X',
          phone_number: '+201000000000',
        }),
      }),
    );
    expect(m.payment.update).toHaveBeenCalledWith({
      where: { id: 102 },
      data: { paymobIntentionId: 'int_1', paymobClientSecret: 'cs_1' },
    });
  });

  it('marks the attempt FAILED with the AppError message when Paymob refuses the intention', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(null, { pricePaid: '3000.00' }));
    createIntention.mockRejectedValue(new AppError('Paymob said no', 502));

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 502,
      message: 'Paymob said no',
    });
    expect(m.payment.update).toHaveBeenCalledWith({
      where: { id: 102 },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'Paymob said no',
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
        paymobIntentionId: null,
      },
    });
  });

  it('marks the attempt FAILED with a generic reason when the intention call errors unexpectedly', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(null, { pricePaid: '3000.00' }));
    const boom = new Error('socket hang up');
    createIntention.mockRejectedValue(boom);

    await expect(createPaymobIntentionForPackagePurchase(decoded, 41)).rejects.toBe(boom);
    expect(m.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureReason: 'Paymob intention request failed.' }),
      }),
    );
  });
});

describe('syncPaymobPaymentForPackagePurchase', () => {
  beforeEach(() => {
    m.user.findUnique.mockResolvedValue(payer);
  });

  it('refuses (404) an unknown purchase', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(null);
    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Package purchase not found.',
    });
  });

  it("refuses (403) another parent's purchase", async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment, { userId: 8 }));
    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('refuses (404) a purchase that never opened a payment', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(null));
    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).rejects.toMatchObject({
      statusCode: 404,
      message: 'No payment found for this purchase.',
    });
  });

  it('reports the stored status without asking Paymob when Paymob is disabled', async () => {
    mockConfig.paymob.enabled = false;
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));

    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).resolves.toEqual({
      status: PaymentStatus.PENDING,
    });
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('reports an already-settled payment without asking Paymob', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith({ ...pendingPayment, status: PaymentStatus.CAPTURED }),
    );

    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).resolves.toEqual({
      status: PaymentStatus.CAPTURED,
    });
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('reports a pending payment with no client secret without asking Paymob', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith({ ...pendingPayment, paymobClientSecret: null }),
    );

    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).resolves.toEqual({
      status: PaymentStatus.PENDING,
    });
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('settles the purchase when Paymob shows a captured transaction', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));
    getIntentionElement.mockResolvedValue({ transactions: [{ id: 555, success: true, pending: false }] });
    m.payment.findFirst.mockResolvedValue({ id: 100, packagePurchaseId: 41, status: PaymentStatus.PENDING });

    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).resolves.toEqual({
      status: PaymentStatus.CAPTURED,
    });
    expect(getIntentionElement).toHaveBeenCalledWith('pk_test', 'secret_100');
    expect(m.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({ status: PaymentStatus.CAPTURED, paymobTransactionId: '555' }),
      }),
    );
    expect(creditPurchaseHours).toHaveBeenCalledWith(expect.anything(), 41);
  });

  it('fails the attempt when Paymob reports a declined transaction', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));
    getIntentionElement.mockResolvedValue({ transactions: [{ id: 555, success: false, pending: false }] });

    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).resolves.toEqual({
      status: PaymentStatus.FAILED,
    });
    expect(m.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureReason: 'Paymob reported a failed payment.' }),
      }),
    );
  });

  it('keeps the attempt PENDING while Paymob has no outcome yet', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));

    await expect(syncPaymobPaymentForPackagePurchase(decoded, 41)).resolves.toEqual({
      status: PaymentStatus.PENDING,
    });
    expect(m.payment.update).not.toHaveBeenCalled();
    expect(m.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe('cancelPackageCheckout guards', () => {
  it('refuses (404) an unknown purchase', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(null);
    await expect(cancelPackageCheckout(decoded, 41)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reports FAILED for a checkout that never reached Paymob', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(null));

    await expect(cancelPackageCheckout(decoded, 41)).resolves.toEqual({ status: PaymentStatus.FAILED });
    expect(m.payment.updateMany).not.toHaveBeenCalled();
  });

  it('closes the checkout without asking Paymob when Paymob is disabled', async () => {
    mockConfig.paymob.enabled = false;
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));

    await expect(cancelPackageCheckout(decoded, 41)).resolves.toEqual({ status: PaymentStatus.FAILED });
    expect(getIntentionElement).not.toHaveBeenCalled();
    expect(m.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureReason: 'Checkout cancelled by the parent.' }),
      }),
    );
  });

  it('closes the checkout without asking Paymob when the attempt has no client secret', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(
      purchaseWith({ ...pendingPayment, paymobClientSecret: null }),
    );

    await expect(cancelPackageCheckout(decoded, 41)).resolves.toEqual({ status: PaymentStatus.FAILED });
    expect(getIntentionElement).not.toHaveBeenCalled();
  });

  it('records Paymob’s decline as the reason when the payment had already failed there', async () => {
    m.packagePurchase.findUnique.mockResolvedValue(purchaseWith(pendingPayment));
    getIntentionElement.mockResolvedValue({ status: 'declined' });

    await expect(cancelPackageCheckout(decoded, 41)).resolves.toEqual({ status: PaymentStatus.FAILED });
    expect(m.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureReason: 'Paymob reported a failed payment.' }),
      }),
    );
  });
});

describe('finalizePackagePaymentFailed', () => {
  it('fails only a live PENDING package payment, clearing its checkout secret', async () => {
    m.payment.updateMany.mockResolvedValue({ count: 1 });

    await finalizePackagePaymentFailed(100, 'Card declined');

    expect(m.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 100, deletedAt: null, status: PaymentStatus.PENDING, purpose: 'PACKAGE' },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: 'Card declined',
        paymobNextReconcileAt: null,
        paymobClientSecret: null,
      },
    });
  });

  it('is a silent no-op when the payment was already settled (count 0)', async () => {
    m.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(finalizePackagePaymentFailed(100, 'Card declined')).resolves.toBeUndefined();
  });
});
