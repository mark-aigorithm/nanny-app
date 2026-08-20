/**
 * The hosted-checkout loop — the half of a payment the app cannot drive itself.
 *
 * Every other payment test posts the webhook from inside the test process. That
 * proves the backend's half, but skips the part a mobile payment depends on:
 * the customer opens a page in a WebView, presses a button there, and the
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
import type { Server } from 'node:http';

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

/** Presses one of the checkout page's buttons, without following the redirect. */
async function pressCheckoutButton(clientSecret: string, outcome: 'pay' | 'decline') {
  const response = await fetch(`${paymob.apiBaseUrl}/unifiedcheckout/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ clientSecret, outcome }),
    // The redirect target is the assertion — following it would hide it, and
    // would also hit the return page for no reason.
    redirect: 'manual',
  });

  if (response.status >= 500) {
    throw new Error(`The fake failed to settle the checkout: ${await response.text()}`);
  }

  return response;
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
 * Starts the app where the backend told Paymob to send the callback.
 *
 * The fake is a separate process, so it cannot reach an in-process supertest
 * app — `notification_url` has to resolve to a real socket. The port comes from
 * `PUBLIC_API_URL` because that is the value the intention was created with.
 */
async function listenOnPublicApiPort(): Promise<Server> {
  const port = Number(new URL(paymob.publicApiUrl).port);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(
              `Port ${port} is already in use, so the fake's webhook would be delivered to ` +
                'another process. Stop whatever is serving it (usually `pnpm start:test`, ' +
                'started for the admin E2E run) and try again.',
            )
          : err,
      );
    });
  });
}

describe('A13 — hosted checkout loop', () => {
  let server: Server;

  beforeAll(async () => {
    server = await listenOnPublicApiPort();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('serves a checkout page for the intention the app opens', async () => {
    const { mother, booking } = await bookingAwaitingPayment();
    const session = await createCheckoutSession(mother.token, 'booking', booking.id);

    const response = await fetch(checkoutUrl(session.publicKey, session.clientSecret));
    const html = await response.text();

    expect(response.status).toBe(200);
    // The amount is the customer's confirmation they are paying the right
    // thing; the buttons are what a UI driver taps by visible text.
    expect(html).toContain('480.00');
    expect(html).toContain('Pay now');
    expect(html).toContain('Decline');
  });

  it('404s a checkout for an unknown client secret', async () => {
    const response = await fetch(checkoutUrl('test_public_key', 'cs_test_nonexistent'));

    expect(response.status).toBe(404);
  });

  it('pays a booking end to end without the test posting the webhook', async () => {
    const { mother, booking } = await bookingAwaitingPayment();
    const session = await createCheckoutSession(mother.token, 'booking', booking.id);

    const response = await pressCheckoutButton(session.clientSecret, 'pay');

    // ── The redirect the WebView follows ──────────────────────────
    expect(response.status).toBe(302);
    const landing = new URL(response.headers.get('location') ?? '');
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

  it('leaves the booking unpaid when the customer declines', async () => {
    const { mother, booking } = await bookingAwaitingPayment();
    const session = await createCheckoutSession(mother.token, 'booking', booking.id);

    const response = await pressCheckoutButton(session.clientSecret, 'decline');

    expect(response.status).toBe(302);
    const landing = new URL(response.headers.get('location') ?? '');
    // `parsePaymobQueryHint` reads any of these as a failure; the fake sets all
    // three, as Paymob does on a declined card.
    expect(landing.searchParams.get('success')).toBe('false');
    expect(landing.searchParams.get('error_occured')).toBe('true');
    expect(landing.searchParams.get('txn_response_code')).toBe('DECLINED');

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
