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
  // The checkout page posts an ordinary HTML form, which is how a browser (and
  // the app's WebView) submits — nothing else on the fake sends form encoding.
  app.use(express.urlencoded({ extended: false }));

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

  // ── Hosted checkout ────────────────────────────────────────────────────────

  /**
   * GET /unifiedcheckout/ — the page the app opens in a WebView.
   *
   * The path and query (`publicKey`, `clientSecret`) are exactly what
   * `buildPaymobCheckoutUrl` produces on mobile, so pointing the app's checkout
   * origin at this fake is the only change needed to complete a payment without
   * Paymob. What renders is deliberately plain HTML: Android exposes WebView
   * content to the accessibility tree, so a UI driver taps the buttons by their
   * visible text.
   */
  app.get('/unifiedcheckout/', (req: Request, res: Response) => {
    const clientSecret = String(req.query['clientSecret'] ?? '');
    const intention = findByClientSecret(clientSecret);

    if (!intention) {
      res.status(404).send(page('Unknown checkout', '<p>No intention matches that client secret.</p>'));
      return;
    }

    res.send(
      page(
        'Test checkout',
        `<p class="amount">EGP ${(intention.amountCents / 100).toFixed(2)}</p>
         <p class="ref">Reference ${escapeHtml(intention.merchantOrderId ?? intention.id)}</p>
         <form method="post" action="/unifiedcheckout/complete">
           <input type="hidden" name="clientSecret" value="${escapeHtml(intention.clientSecret)}" />
           <button type="submit" name="outcome" value="pay" class="pay">Pay now</button>
           <button type="submit" name="outcome" value="decline" class="decline">Decline</button>
         </form>`,
      ),
    );
  });

  /**
   * POST /unifiedcheckout/complete — what the Pay / Decline buttons submit.
   *
   * Mirrors the order real Paymob works in, with one deliberate difference: the
   * webhook is delivered *and awaited* before the redirect. Paymob races the
   * two, so a test that redirected first would have to poll for the backend to
   * catch up; awaiting makes "the WebView reached the return URL" mean "the
   * payment has already been recorded", which is what removes the flake.
   */
  app.post('/unifiedcheckout/complete', (req: Request, res: Response) => {
    void (async () => {
      const body = req.body as { clientSecret?: string; outcome?: string };
      const intention = findByClientSecret(String(body.clientSecret ?? ''));

      if (!intention) {
        res.status(404).send(page('Unknown checkout', '<p>No intention matches that client secret.</p>'));
        return;
      }

      const success = body.outcome !== 'decline';
      const callback = settleIntention(intention, success);

      try {
        await deliverWebhook(intention, callback);
      } catch (err) {
        // Loud rather than silent: with no webhook the payment never lands, and
        // "the button did nothing" is a much harder failure to read than this.
        res
          .status(502)
          .send(
            page(
              'Webhook delivery failed',
              `<p>Could not POST the callback to <code>${escapeHtml(
                intention.notificationUrl ?? '(none)',
              )}</code>.</p><p>Is the backend running on that host?</p><pre>${escapeHtml(
                String(err),
              )}</pre>`,
            ),
          );
        return;
      }

      if (!intention.redirectionUrl) {
        res.send(page(success ? 'Paid' : 'Declined', '<p>No redirection URL was set.</p>'));
        return;
      }

      res.redirect(302, buildReturnUrl(intention, success));
    })();
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

    res.json(settleIntention(intention, success));
  });

  return app;
}

/** A signed callback, in the shape `/__test__/pay` hands to tests. */
type SignedCallback = { hmac: string; body: { type: 'TRANSACTION'; obj: unknown } };

/**
 * Marks an intention settled and signs the resulting callback.
 *
 * Shared by `/__test__/pay` and the checkout page so a payment made through the
 * UI and one made through the control surface are indistinguishable to the
 * backend — the difference is only who posts the webhook.
 */
function settleIntention(intention: Intention, success: boolean): SignedCallback {
  intention.confirmed = success;
  intention.transactionId ??= allocateId();

  const transaction = buildTransaction(intention, success);
  const plaintext = buildTransactionHmacPlaintext(transaction as PaymobTransactionHmacPayload);
  const hmac = computePaymobHmacHex(plaintext, requireHmacSecret());

  return { hmac, body: { type: 'TRANSACTION', obj: transaction } };
}

/**
 * Posts the callback to wherever the backend asked for it, signature in the
 * query string — the same delivery the real Paymob performs server-side, which
 * is why the app can be offline at this moment and the payment still lands.
 */
async function deliverWebhook(intention: Intention, callback: SignedCallback): Promise<void> {
  if (!intention.notificationUrl) return;

  const url = new URL(intention.notificationUrl);
  url.searchParams.set('hmac', callback.hmac);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callback.body),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
  }
}

/**
 * The URL the customer's browser lands on after checkout.
 *
 * Only the parameters the app actually reads are added — `parsePaymobQueryHint`
 * looks at `success`, `pending`, `txn_response_code` and `error_occured`. The
 * backend's own query (`bookingId`, `extensionId`, …) is already on
 * `redirectionUrl` and is preserved.
 */
function buildReturnUrl(intention: Intention, success: boolean): string {
  const url = new URL(intention.redirectionUrl ?? '');
  url.searchParams.set('id', String(intention.transactionId ?? 0));
  url.searchParams.set('order', String(intention.orderId));
  url.searchParams.set('success', String(success));
  url.searchParams.set('pending', 'false');
  url.searchParams.set('error_occured', String(!success));
  url.searchParams.set('txn_response_code', success ? 'APPROVED' : 'DECLINED');
  return url.toString();
}

/** Minimal chrome so the WebView renders something legible at phone width. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 20px; }
  .amount { font-size: 32px; font-weight: 700; margin: 24px 0 4px; }
  .ref { color: #666; margin: 0 0 32px; }
  button { display: block; width: 100%; padding: 16px; margin-bottom: 12px;
           font-size: 18px; border: 0; border-radius: 8px; }
  .pay { background: #1f9d55; color: #fff; }
  .decline { background: #eee; color: #333; }
  pre { white-space: pre-wrap; color: #a00; }
</style>
</head>
<body><h1>${escapeHtml(title)}</h1>${body}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
