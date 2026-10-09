/**
 * The hosted-checkout loop — the half of a payment the app cannot drive itself.
 *
 * Every other payment test posts the webhook from inside the test process. That
 * proves the backend's half, but skips the part a mobile payment depends on:
 * the customer opens a page in a WebView, pays with a test card there, and the
 * *payment provider* delivers the callback server-side before bouncing the
 * browser back to a return URL the app recognises.
 *
 * This spec drives that loop with no mobile code involved. Passing means the
 * fake serves the exact URL `buildPaymobCheckoutUrl` builds, honours the
 * `notification_url` and `redirection_url` the backend put on the intention,
 * and that the app's redirect parser would read the landing URL as success.
 *
 * Because the fake posts the webhook over the network, the app under test has
 * to be reachable at `PUBLIC_API_URL` — so unlike its siblings this file starts
 * a real listener instead of relying on supertest alone.
 */
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';

import { PaymentStatus } from '@prisma/client';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { PAYMOB_RETURN_PATH } from '@backend/lib/paymob/constants';
import { config } from '@backend/lib/config';

import { makeMother, makeNanny } from '../../../test/factories';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';
import { createCheckoutSession } from '../../../test/journeys/payment';

/** .env.test sets every Paymob variable, so the integration config is enabled. */
const paymob = config.paymob as Extract<typeof config.paymob, { enabled: true }>;

/**
 * The URL the mobile app builds. Kept as a local copy of
 * `apps/mobile/src/lib/paymobCheckout.ts` rather than imported — the backend
 * cannot import from the mobile package, and a divergence here is exactly what
 * this spec should fail on.
 */
function checkoutUrl(publicKey: string, clientSecret: string): string {
  const params = new URLSearchParams({ publicKey, clientSecret });
  return `${paymob.apiBaseUrl}/unifiedcheckout/?${params.toString()}`;
}

/**
 * The test cards every E2E driver types, read from the same file the fake
 * judges them by (test-support/paymob/checkout.json).
 */
const CHECKOUT = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'test-support', 'paymob', 'checkout.json'), 'utf8'),
) as {
  labels: Record<string, string>;
  cards: Record<'approved' | 'declined', { number: string; expiry: string; cvv: string; name: string }>;
};

/**
 * Submits the card form the way the WebView does, and returns the page the
 * fake answers with: "paid" with a refresh to the return URL, or "declined"
 * with none, as on Paymob's sandbox.
 */
async function payWithCard(clientSecret: string, card: 'approved' | 'declined') {
  const { number, expiry, cvv, name } = CHECKOUT.cards[card];
  const response = await fetch(`${paymob.apiBaseUrl}/unifiedcheckout/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ clientSecret, cardNumber: number, expiry, cvv, name }),
  });
  const html = await response.text();

  if (response.status >= 500) {
    throw new Error(`The fake failed to settle the checkout: ${html}`);
  }

  return { status: response.status, html };
}

/** Where the "paid" page sends the WebView, read off its meta refresh. */
function returnUrlOf(html: string): URL | null {
  const match = /http-equiv="refresh" content="\d+;url=([^"]+)"/.exec(html);
  return match?.[1] ? new URL(match[1].replace(/&amp;/g, '&')) : null;
}

/** A mother with an APPROVED booking waiting to be paid. */
async function bookingAwaitingPayment() {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const booking = await createBookingViaApi(mother.token, { durationHours: 4 });
  await claimBooking(nanny.token, booking.id);
  return { mother, booking };
}

/**
 * Makes the app reachable at `PUBLIC_API_URL`.
 *
 * The fake is a separate process, so it cannot reach an in-process supertest
 * app — `notification_url` has to resolve to a real socket, at the address the
 * intention was created with.
 *
 * Returns null when a backend is already serving that port: `pnpm start:test`
 * is usually left running for the admin E2E suite, and it boots the same app
 * from the same `.env.test` against the same database, so the loop is
 * unaffected. Anything else holding the port is an error rather than a
 * silently wrong test.
 */
async function serveOnPublicApiPort(): Promise<Server | null> {
  const port = Number(new URL(paymob.publicApiUrl).port);

  try {
    return await new Promise<Server>((resolve, reject) => {
      const server = app.listen(port, '127.0.0.1', () => resolve(server));
      server.on('error', reject);
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
  }

  const health = await fetch(`${paymob.publicApiUrl}/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `Port ${port} is held by something that is not the NannyApp backend, so the fake's ` +
        'webhook would be delivered to it instead. Free the port and try again.',
    );
  }

  return null;
}

describe('A13 — hosted checkout loop', () => {
  /** Null when an already-running backend is serving the port — see above. */
  let server: Server | null = null;

  beforeAll(async () => {
    server = await serveOnPublicApiPort();
  });

  afterAll(async () => {
    const started = server;
    if (!started) return;
    await new Promise<void>((resolve, reject) => {
      started.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('serves a checkout page for the intention the app opens', async () => {
    const { mother, booking } = await bookingAwaitingPayment();
    const session = await createCheckoutSession(mother.token, 'booking', booking.id);

    const response = await fetch(checkoutUrl(session.publicKey, session.clientSecret));
    const html = await response.text();

    expect(response.status).toBe(200);
    // The amount is the customer's confirmation they are paying the right
    // thing; the placeholders and the button are what every UI driver types
    // into and taps, on this fake and on Paymob's real page alike.
    expect(html).toContain(`${CHECKOUT.labels['pay']} 480.00`);
    for (const key of ['cardNumber', 'expiry', 'cvv', 'name'] as const) {
      expect(html).toContain(`placeholder="${CHECKOUT.labels[key]}"`);
    }
  });

  it('404s a checkout for an unknown client secret', async () => {
    const response = await fetch(checkoutUrl('test_public_key', 'cs_test_nonexistent'));

    expect(response.status).toBe(404);
  });

  it('pays a booking end to end without the test posting the webhook', async () => {
    const { mother, booking } = await bookingAwaitingPayment();
    const session = await createCheckoutSession(mother.token, 'booking', booking.id);

    const { status, html } = await payWithCard(session.clientSecret, 'approved');

    // ── The page that sends the WebView home ──────────────────────
    expect(status).toBe(200);
    expect(html).toContain(CHECKOUT.labels['paid']);
    const landing = returnUrlOf(html);
    if (!landing) throw new Error('The paid page does not redirect to the return URL.');
    expect(landing.pathname).toBe(PAYMOB_RETURN_PATH);
    expect(landing.searchParams.get('success')).toBe('true');
    expect(landing.searchParams.get('error_occured')).toBe('false');
    // The backend's own query survives the round trip — this is how the app
    // knows which booking it just paid for.
    expect(landing.searchParams.get('bookingId')).toBe(String(booking.id));

    // ── The callback the fake delivered on its own ────────────────
    // Nothing in this test posted a webhook. The booking moved because the
    // fake POSTed a signed callback to the notification_url the backend set,
    // and the real verifier accepted it.
    const paid = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(paid.status).toBe('CONFIRMED');

    const payment = await prisma.payment.findFirstOrThrow({
      where: { id: session.paymentId },
    });
    expect(payment.status).toBe(PaymentStatus.CAPTURED);
  });

  it('leaves the booking unpaid when the card is declined', async () => {
    const { mother, booking } = await bookingAwaitingPayment();
    const session = await createCheckoutSession(mother.token, 'booking', booking.id);

    const { status, html } = await payWithCard(session.clientSecret, 'declined');

    // Paymob's sandbox stops on its own "Payment declined" page and never
    // redirects, so the fake does the same. The webhook still tells the backend.
    expect(status).toBe(200);
    expect(html).toContain(CHECKOUT.labels['declined']);
    expect(returnUrlOf(html)).toBeNull();

    const declined = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(declined.status).toBe('APPROVED');

    const payment = await prisma.payment.findFirstOrThrow({
      where: { id: session.paymentId },
    });
    expect(payment.status).toBe(PaymentStatus.FAILED);
  });

  it('serves the return page the WebView lands on', async () => {
    // The app detects completion by URL, but a blank or erroring page would
    // still be visible to the customer for the moment before it closes.
    const response = await fetch(`${paymob.publicApiUrl}${PAYMOB_RETURN_PATH}?success=true`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('return to the app');
  });
});
