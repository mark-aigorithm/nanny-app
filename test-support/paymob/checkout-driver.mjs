/**
 * Pays a hosted checkout in a browser, the way a customer does: types a test
 * card, presses Pay, and gets through 3-D Secure. It works the same against the
 * Paymob fake and Paymob's sandbox.
 *
 * This is for the suites whose *other* actor pays: the admin console's seeded
 * paid bookings, and the mother in the mobile nanny-day flow (through
 * payer.mjs). The webhook is always delivered by whichever Paymob served the
 * page, never posted by the test, so a payment made here reaches the backend
 * exactly as a real one does.
 *
 * It takes a Playwright `page` rather than importing Playwright, so the admin
 * suite (`@playwright/test`) and the mobile runner (`playwright`) each bring
 * their own.
 */
import { CHECKOUT, checkoutUrl } from './mode.mjs';

/** Must match PAYMOB_RETURN_PATH on the backend and in apps/mobile/src/lib/paymobRedirect.ts. */
const RETURN_PATH = '/paymob/return';

/**
 * Real Paymob may render the card fields inside iframes, which a page-level
 * locator does not see into. So this checks every frame and takes the first
 * that has the field.
 */
async function inAnyFrame(page, find, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const frame of page.frames()) {
      const locator = find(frame);
      if ((await locator.count().catch(() => 0)) > 0) return locator.first();
    }
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(250);
  }
}

async function fill(page, label, value, timeoutMs) {
  const field = await inAnyFrame(page, (frame) => frame.getByLabel(label, { exact: false }), timeoutMs);
  if (!field) throw new Error(`Checkout field "${label}" never appeared (checkout.json → labels).`);
  await field.fill(value);
}

async function press(page, name, timeoutMs) {
  const button = await inAnyFrame(page, (frame) => frame.getByRole('button', { name, exact: true }), timeoutMs);
  if (!button) throw new Error(`Checkout button "${name}" never appeared (checkout.json → labels).`);
  await button.click();
}

/**
 * @param {import('playwright').Page} page
 * @param {{ origin: string, publicKey: string, clientSecret: string, card?: string, timeoutMs?: number }} options
 *   `card` is a key of checkout.json → cards ('approved' by default).
 * @returns {Promise<{ success: boolean, returnUrl: string }>}
 *   What the provider's redirect said. Whether the backend has recorded it yet
 *   is a separate question. The fake delivers the webhook before redirecting,
 *   but Paymob races the two.
 */
export async function payCheckout(page, { origin, publicKey, clientSecret, card = 'approved', timeoutMs = 60_000 }) {
  const details = CHECKOUT.cards[card];
  if (!details) throw new Error(`No test card "${card}" in checkout.json.`);
  const { labels } = CHECKOUT;

  // Resolves at the first navigation to the return URL. `commit` because what
  // that page renders is irrelevant; the query string carries the result.
  const returned = page.waitForURL((url) => url.pathname.endsWith(RETURN_PATH), {
    timeout: timeoutMs * 2,
    waitUntil: 'commit',
  });
  // Marked handled now: if a step below throws first, this wait still times out
  // later, and an unhandled rejection would kill the payer process.
  returned.catch(() => {});

  await page.goto(checkoutUrl(origin, publicKey, clientSecret));
  await fill(page, labels.cardNumber, details.number, timeoutMs);
  await fill(page, labels.expiry, details.expiry, timeoutMs);
  await fill(page, labels.cvv, details.cvv, timeoutMs);
  await fill(page, labels.name, details.name, timeoutMs);
  await press(page, labels.pay, timeoutMs);

  // 3-D Secure is a step the issuer decides on, so it may not come. Whichever
  // happens first ends the wait: the challenge page or the redirect home.
  const challenge = inAnyFrame(page, (frame) => frame.getByText(labels.threeDsTitle), timeoutMs).then((found) =>
    found ? 'challenge' : 'none',
  );
  const first = await Promise.race([returned.then(() => 'returned'), challenge]);
  if (first === 'challenge') await press(page, labels.threeDsSubmit, timeoutMs);

  await returned;
  const url = new URL(page.url());
  return { success: url.searchParams.get('success') === 'true', returnUrl: url.toString() };
}
