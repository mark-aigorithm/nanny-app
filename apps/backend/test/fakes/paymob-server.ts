/**
 * A stand-in for Paymob's API.
 *
 * It exists so the full payment cycle — create intention → checkout → webhook →
 * refund — runs end to end with no live credentials, no real money and no
 * third-party downtime. Only the counterparty is fake: the backend's own
 * client, HMAC verification and webhook handling all run unmodified.
 *
 * The signing helpers are imported from the production `lib/paymob` rather than
 * reimplemented. That is the point: if the plaintext format ever changes, this
 * fake changes with it, so a passing test can never mean "the fake and the
 * verifier agree on a format Paymob doesn't use".
 *
 * Beyond impersonating Paymob it exposes a small control surface under
 * `/__test__` that tests drive directly — see the route comments below.
 */
import express, { type Express, type Request, type Response } from 'express';

import { buildTransactionHmacPlaintext, computePaymobHmacHex } from '@backend/lib/paymob/hmac';
import type { PaymobTransactionHmacPayload } from '@backend/lib/paymob/types';
import { routeParam } from '@backend/lib/route-param';

const DEFAULT_PORT = 4010;

type Intention = {
  id: string;
  clientSecret: string;
  amountCents: number;
  /** Paymob's own order id, referenced by the webhook payload. */
  orderId: number;
  merchantOrderId: string | undefined;
  /**
   * Where the backend asked the webhook to be delivered and the customer to be
   * redirected. Recorded so the checkout page can honour them the way the real
   * Paymob does; tests that post the webhook themselves ignore both.
   */
  notificationUrl: string | undefined;
  redirectionUrl: string | undefined;
  confirmed: boolean;
  transactionId: number | null;
  refundedAmountCents: number;
};

/** In-memory store. The process is per-test-run, so nothing needs to persist. */
const intentions = new Map<string, Intention>();
let nextId = 1;

/** Deterministic ids make failures readable: intention 1 is always the first created. */
function allocateId(): number {
  const value = nextId;
  nextId += 1;
  return value;
}

export function buildPaymobFake(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  /**
   * POST /v1/intention/ — what createPaymobApiClient().createIntention calls.
   * The real API returns far more; the client reads only `id` and
   * `client_secret`, so returning more would be inventing a contract.
   */
  app.post('/v1/intention/', (req: Request, res: Response) => {
    const body = req.body as {
      amount?: number;
      special_reference?: string;
      notification_url?: string;
      redirection_url?: string;
    };

    const id = String(allocateId());
    const intention: Intention = {
      id,
      clientSecret: `cs_test_${id}`,
      amountCents: typeof body.amount === 'number' ? body.amount : 0,
      orderId: allocateId(),
      merchantOrderId: body.special_reference,
      notificationUrl: body.notification_url,
      redirectionUrl: body.redirection_url,
      confirmed: false,
      transactionId: null,
      refundedAmountCents: 0,
    };
    intentions.set(id, intention);

    res.status(201).json({ id, client_secret: intention.clientSecret });
  });

  /**
   * GET /v1/intention/element/:publicKey/:clientSecret/ — the polling read used
   * when a webhook is slow or dropped. Reports whatever state the test has put
   * the intention into.
   */
  app.get('/v1/intention/element/:publicKey/:clientSecret/', (req: Request, res: Response) => {
    // Express 5 types params as `string | string[]`; routeParam is the same
    // normaliser the real routes use.
    const intention = findByClientSecret(routeParam(req.params['clientSecret'] ?? ''));
    if (!intention) {
      res.status(404).json({ detail: 'Intention not found' });
      return;
    }

    res.json({
      id: intention.id,
      client_secret: intention.clientSecret,
      confirmed: intention.confirmed,
      status: intention.confirmed ? 'confirmed' : 'pending',
      special_reference: intention.merchantOrderId ?? null,
      transactions: intention.transactionId
        ? [{ id: intention.transactionId, success: true, pending: false }]
        : [],
    });
  });

  /**
   * POST /api/acceptance/void_refund/refund — the Accept-API refund endpoint.
   * Accumulates the refunded total the way Paymob does, so a partial refund
   * followed by another behaves realistically.
   */
  app.post('/api/acceptance/void_refund/refund', (req: Request, res: Response) => {
    const body = req.body as { transaction_id?: string; amount_cents?: number };
    const intention = findByTransactionId(String(body.transaction_id ?? ''));

    if (!intention) {
      res.status(404).json({ detail: 'Transaction not found' });
      return;
    }

    const amount = typeof body.amount_cents === 'number' ? body.amount_cents : 0;
    const remaining = intention.amountCents - intention.refundedAmountCents;

    if (amount > remaining) {
      // Mirrors Paymob accepting the call but reporting failure, which the
      // client distinguishes from a transport error.
      res.json({ id: allocateId(), refunded_amount_cents: intention.refundedAmountCents, success: false });
      return;
    }

    intention.refundedAmountCents += amount;
    res.json({
      id: allocateId(),
      refunded_amount_cents: intention.refundedAmountCents,
      success: true,
    });
  });

  // ── Control surface ────────────────────────────────────────────────────────

  /**
   * POST /__test__/reset — drop all state. Called between tests so intention
   * ids stay deterministic.
   */
  app.post('/__test__/reset', (_req: Request, res: Response) => {
    intentions.clear();
    nextId = 1;
    res.json({ ok: true });
  });

  /**
   * POST /__test__/pay — marks an intention paid and returns a webhook body
   * with a genuine signature.
   *
   * The test posts the returned `body` to the backend's own
   * `/webhooks/paymob?hmac=…`, so the backend verifies a real HMAC over a real
   * payload. Signing here rather than inside the test keeps the plaintext
   * construction in one place.
   *
   * Note the webhook is echoed back with the `special_reference` the intention
   * was created with, and `extractMerchantPaymentId` requires that to be the
   * **Payment row id** (optionally with Paymob's `-r<n>` retry suffix). A
   * request the backend itself initiated always satisfies this; a hand-rolled
   * intention with an arbitrary reference is rejected with 401 even though its
   * signature is perfectly valid.
   *
   * Body: { intentionId?, clientSecret?, success?: boolean } — the intention
   * may be addressed by either handle. Backend pay routes return only the
   * client secret, so journey helpers use that; earlier tests keep intentionId.
   */
  app.post('/__test__/pay', (req: Request, res: Response) => {
    const { intentionId, clientSecret, success = true } = req.body as {
      intentionId?: string;
      clientSecret?: string;
      success?: boolean;
    };

    const intention =
      intentionId !== undefined
        ? intentions.get(String(intentionId))
        : findByClientSecret(String(clientSecret ?? ''));
    if (!intention) {
      res.status(404).json({ detail: 'Intention not found' });
      return;
    }

    intention.confirmed = success;
    intention.transactionId ??= allocateId();

    const transaction = buildTransaction(intention, success);
    const plaintext = buildTransactionHmacPlaintext(transaction as PaymobTransactionHmacPayload);
    const hmac = computePaymobHmacHex(plaintext, requireHmacSecret());

    res.json({
      hmac,
      body: { type: 'TRANSACTION', obj: transaction },
    });
  });

  return app;
}

function findByClientSecret(clientSecret: string): Intention | undefined {
  for (const intention of intentions.values()) {
    if (intention.clientSecret === clientSecret) return intention;
  }
  return undefined;
}

function findByTransactionId(transactionId: string): Intention | undefined {
  for (const intention of intentions.values()) {
    if (String(intention.transactionId) === transactionId) return intention;
  }
  return undefined;
}

/**
 * The transaction object Paymob posts back. Every field the HMAC plaintext
 * reads must be present — a missing one changes the concatenation and the
 * signature silently stops matching.
 */
function buildTransaction(intention: Intention, success: boolean) {
  return {
    id: intention.transactionId ?? 0,
    amount_cents: intention.amountCents,
    integration_id: Number(firstIntegrationId()),
    owner: 1,
    created_at: '2026-01-01T00:00:00.000000',
    currency: 'EGP',
    error_occured: !success,
    has_parent_transaction: false,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    pending: false,
    success,
    order: {
      id: intention.orderId,
      ...(intention.merchantOrderId === undefined
        ? {}
        : { merchant_order_id: intention.merchantOrderId }),
    },
    source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
    ...(intention.merchantOrderId === undefined
      ? {}
      : { special_reference: intention.merchantOrderId }),
  };
}

function requireHmacSecret(): string {
  const secret = process.env['PAYMOB_HMAC_SECRET'];
  if (!secret) {
    throw new Error(
      'PAYMOB_HMAC_SECRET is not set. The fake must sign with the same secret ' +
        'the backend verifies with — start it via `pnpm test:paymob`, which loads .env.test.',
    );
  }
  return secret;
}

/** The backend validates the callback's integration id against its configured list. */
function firstIntegrationId(): string {
  return (process.env['PAYMOB_PAYMENT_METHOD_IDS'] ?? '0').split(',')[0]?.trim() ?? '0';
}

// Started directly (`pnpm test:paymob`) rather than imported — listen.
if (require.main === module) {
  // Required here rather than at the top so importing `buildPaymobFake` from a
  // test has no side effects; run as a script it needs .env.test for the HMAC
  // secret and integration ids.
  require('../env');

  const port = Number(process.env['PAYMOB_FAKE_PORT'] ?? DEFAULT_PORT);
  buildPaymobFake().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[paymob-fake] listening on http://127.0.0.1:${port}`);
  });
}
