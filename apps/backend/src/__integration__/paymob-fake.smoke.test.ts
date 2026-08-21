/**
 * Proves the Paymob fake honours the contract the production code expects.
 *
 * Two things have to hold for any later payment test to mean anything:
 *
 *   1. The **real** API client can talk to the fake — same URLs, same auth
 *      header, same response shape.
 *   2. A webhook the fake signs is accepted by the **real** verifier. Both
 *      sides build the plaintext with the same production helper, so this
 *      catches the case where that format changes and only one side follows.
 *
 * Requires the fake to be running (`pnpm test:env`).
 */
import { config } from '@backend/lib/config';
import { createPaymobApiClient } from '@backend/lib/paymob/client';
import {
  buildTransactionHmacPlaintext,
  verifyPaymobTransactionHmac,
} from '@backend/lib/paymob/hmac';
import {
  coerceTransactionHmacPayload,
  extractPaymobTransactionObject,
} from '@backend/lib/paymob/parse-webhook';

/** Narrow the union — .env.test sets every Paymob variable, so it is enabled. */
const paymob = config.paymob as Extract<typeof config.paymob, { enabled: true }>;

const client = createPaymobApiClient(paymob.secretKey, paymob.apiBaseUrl);

/** Amounts are in piastres, as Paymob expects: 500.00 EGP. */
const AMOUNT_CENTS = 50_000;

/** Asks the fake to mark an intention paid and hand back a signed webhook. */
async function markPaid(intentionId: string) {
  const response = await fetch(`${paymob.apiBaseUrl}/__test__/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentionId }),
  });

  if (!response.ok) {
    throw new Error(
      `Paymob fake returned ${response.status}. Is it running (pnpm test:paymob)?`,
    );
  }

  return (await response.json()) as { hmac: string; body: unknown };
}

async function createIntention(paymentRowId: number) {
  return client.createIntention({
    amount: AMOUNT_CENTS,
    currency: 'EGP',
    payment_methods: paymob.paymentMethodIds,
    billing_data: { first_name: 'Test', last_name: 'Mother', email: 'mother@test.local' },
    // Both carry the Payment row id — that is how the callback is matched back
    // to a payment (see extractMerchantPaymentId).
    merchant_order_id: String(paymentRowId),
    special_reference: String(paymentRowId),
    notification_url: `${paymob.publicApiUrl}/webhooks/paymob`,
  });
}

describe('paymob fake', () => {
  beforeEach(async () => {
    // Intention ids are allocated sequentially, so clearing state keeps them
    // predictable from one test to the next.
    await fetch(`${paymob.apiBaseUrl}/__test__/reset`, { method: 'POST' });
  });

  it('answers the real API client with a usable intention', async () => {
    const intention = await createIntention(1);

    expect(intention.id).toBeTruthy();
    expect(intention.client_secret).toBeTruthy();
  });

  it('signs a webhook the production verifier accepts', async () => {
    const intention = await createIntention(1);
    const { hmac, body } = await markPaid(intention.id);

    const transaction = extractPaymobTransactionObject(body);
    expect(transaction).not.toBeNull();

    const plaintext = buildTransactionHmacPlaintext(
      coerceTransactionHmacPayload(transaction!),
    );

    expect(verifyPaymobTransactionHmac(plaintext, hmac, paymob.hmacSecret)).toBe(true);
  });

  it('rejects a tampered signature', async () => {
    const intention = await createIntention(1);
    const { body } = await markPaid(intention.id);

    const plaintext = buildTransactionHmacPlaintext(
      coerceTransactionHmacPayload(extractPaymobTransactionObject(body)!),
    );

    // Same length as a real SHA-512 hex digest: a mismatched length would be
    // rejected by the length check alone, never reaching the comparison.
    const forged = 'a'.repeat(128);
    expect(verifyPaymobTransactionHmac(plaintext, forged, paymob.hmacSecret)).toBe(false);
  });

  it('reports the merchant reference the intention was created with', async () => {
    const paymentRowId = 42;
    const intention = await createIntention(paymentRowId);
    const { body } = await markPaid(intention.id);

    const transaction = extractPaymobTransactionObject(body) as {
      order: { merchant_order_id?: string };
    };

    // This is what lets the backend match a callback back to its Payment row.
    expect(transaction.order.merchant_order_id).toBe(String(paymentRowId));
  });

  it('refunds against the captured transaction', async () => {
    const intention = await createIntention(1);
    const { body } = await markPaid(intention.id);
    const transactionId = String(
      (extractPaymobTransactionObject(body) as { id: number }).id,
    );

    const partial = await client.refund({ transactionId, amountCents: 20_000 });
    expect(partial.success).toBe(true);
    expect(partial.refundedAmountCents).toBe(20_000);

    // Paymob accumulates refunds on the original transaction rather than
    // treating each as independent.
    const rest = await client.refund({ transactionId, amountCents: 30_000 });
    expect(rest.refundedAmountCents).toBe(AMOUNT_CENTS);

    // Over-refunding is accepted by the API but reported as unsuccessful —
    // the client distinguishes that from a transport failure.
    const excess = await client.refund({ transactionId, amountCents: 1 });
    expect(excess.success).toBe(false);
  });
});
