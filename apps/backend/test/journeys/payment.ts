/**
 * Payment advancement — the one place a journey turns "owes money" into "paid".
 *
 * The shape mirrors production exactly: the intention is created *through the
 * backend* (so the merchant reference is a real Payment row id — hand-rolled
 * intentions are rejected by the webhook verifier), the fake marks it paid, and
 * the signed webhook is delivered to the app under test over supertest. Nothing
 * is short-circuited; a booking reaches CONFIRMED only because the real
 * verifier accepted a real signature.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { config } from '@backend/lib/config';

import { authHeader } from '../auth';

/** .env.test sets every Paymob variable, so the integration config is always enabled. */
const paymob = config.paymob as Extract<typeof config.paymob, { enabled: true }>;

export type PayableKind = 'booking' | 'extension' | 'adjustment';

const INTENTION_ROUTES: Record<PayableKind, (id: number) => string> = {
  booking: (id) => `/bookings/${id}/pay/paymob`,
  extension: (id) => `/bookings/extensions/${id}/pay/paymob`,
  adjustment: (id) => `/bookings/adjustments/${id}/pay/paymob`,
};

export type CheckoutSession = {
  paymentId: number;
  clientSecret: string;
  publicKey: string;
};

/** Opens a Paymob intention through the backend, as the mobile checkout does. */
export async function createCheckoutSession(
  token: string,
  kind: PayableKind,
  id: number,
): Promise<CheckoutSession> {
  const response = await request(app)
    .post(INTENTION_ROUTES[kind](id))
    .set(...authHeader(token))
    .send({ method: 'CARD' });

  if (response.status !== 201) {
    throw new Error(
      `Creating a ${kind} intention for id ${id} failed with ${response.status}: ` +
        JSON.stringify(response.body),
    );
  }

  return response.body.data as CheckoutSession;
}

export type SettleOptions = {
  /** `false` simulates a declined card: the webhook reports success=false. */
  success?: boolean;
  /**
   * `false` simulates Paymob's webhook never arriving — the fake still marks
   * the intention confirmed, so a later `/pay/paymob/sync` can reconcile it.
   */
  deliverWebhook?: boolean;
};

export type SettledCheckout = {
  hmac: string;
  body: unknown;
  /** HTTP status the backend's webhook endpoint returned; null if not delivered. */
  webhookStatus: number | null;
};

/**
 * Completes (or declines) a checkout the way the card sheet would: the fake
 * signs the transaction webhook and it is posted to `/webhooks/paymob`.
 */
export async function settleCheckout(
  clientSecret: string,
  options: SettleOptions = {},
): Promise<SettledCheckout> {
  const { success = true, deliverWebhook = true } = options;

  const payResponse = await fetch(`${paymob.apiBaseUrl}/__test__/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientSecret, success }),
  });

  if (!payResponse.ok) {
    throw new Error(
      `Paymob fake /__test__/pay returned ${payResponse.status}. ` +
        'Is it running (pnpm test:env), and was the intention created through the backend?',
    );
  }

  const { hmac, body } = (await payResponse.json()) as { hmac: string; body: unknown };

  if (!deliverWebhook) {
    return { hmac, body, webhookStatus: null };
  }

  const webhook = await deliverPaymobWebhook(hmac, body);
  if (webhook !== 200) {
    throw new Error(`The backend rejected the fake's webhook with ${webhook}.`);
  }

  return { hmac, body, webhookStatus: webhook };
}

/**
 * Posts a (possibly tampered or repeated) webhook to the app under test and
 * returns the status code — exposed separately so resilience tests can replay
 * or forge deliveries without going through a checkout.
 */
export async function deliverPaymobWebhook(hmac: string, body: unknown): Promise<number> {
  const response = await request(app)
    .post('/webhooks/paymob')
    .query({ hmac })
    .send(body as object);
  return response.status;
}

/**
 * The whole hop in one call: intention → fake checkout → signed webhook.
 * Returns the session so callers can assert on the Payment row.
 */
export async function payViaPaymob(
  token: string,
  kind: PayableKind,
  id: number,
  options: SettleOptions = {},
): Promise<CheckoutSession> {
  const session = await createCheckoutSession(token, kind, id);
  await settleCheckout(session.clientSecret, options);
  return session;
}

/** Clears the fake's in-memory intentions; call from beforeEach alongside the DB reset. */
export async function resetPaymobFake(): Promise<void> {
  await fetch(`${paymob.apiBaseUrl}/__test__/reset`, { method: 'POST' });
}
