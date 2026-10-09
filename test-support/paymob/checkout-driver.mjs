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
 * Paymob renders its 3-D Secure step in an iframe, and may one day move the
 * card fields into one, which a page-level locator does not see into. So this
 * checks every frame and takes the first that has the element.
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

/**
 * What the page showed instead, for an error that otherwise only says what was
 * missing: the URL and the visible text of every frame.
 */
async function describe(page) {
  const texts = await Promise.all(
    page.frames().map(async (frame) => {
      const text = await frame.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
      return text.replace(/\s+/g, ' ').trim().slice(0, 300);
    }),
  );
  return `The page was ${page.url()} showing: ${texts.filter(Boolean).join(' | ') || '(nothing)'}`;
}

/** Paymob's card fields have no visible labels, only placeholders. */
async function fill(page, placeholder, value, timeoutMs) {
  const field = await inAnyFrame(page, (frame) => frame.getByPlaceholder(placeholder, { exact: true }), timeoutMs);
  if (!field) {
    throw new Error(`Checkout field "${placeholder}" never appeared (checkout.json → labels). ${await describe(page)}`);
  }
  await field.fill(value);
}

/**
 * A browser context to pay in. Paymob's checkout sits behind a firewall that
 * answers 403 Forbidden to a user agent naming HeadlessChrome, which is what a
 * plain headless launch sends. So this sends the one the same Chrome sends
 * headed. Playwright Test's "Desktop Chrome" profile does the same on its own,
 * but a context opened outside a test does not get it.
 *
 * @param {import('playwright').Browser} browser
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function checkoutContext(browser) {
  const probe = await browser.newPage();
  const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  await probe.context().close();
  return browser.newContext({ userAgent });
}

/**
 * @param {import('playwright').Page} page
 * @param {{ origin: string, publicKey: string, clientSecret: string, card?: string, timeoutMs?: number }} options
 *   `card` is a key of checkout.json → cards ('approved' by default).
 * @returns {Promise<{ success: boolean, returnUrl: string | null }>}
 *   `success` is what the checkout showed. An approved card lands on the return
 *   URL, which comes back as `returnUrl`. A declined one stops on Paymob's
 *   "Payment declined" page, which never redirects, so `returnUrl` is null.
 *   Whether the backend has recorded the payment yet is a separate question:
 *   the fake delivers the webhook before answering, but Paymob races the two.
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

  // The button reads "Pay EGP <amount>", so it is matched by its prefix.
  const pay = await inAnyFrame(
    page,
    (frame) => frame.getByRole('button', { name: new RegExp(`^${labels.pay}\\b`) }),
    timeoutMs,
  );
  if (!pay) {
    throw new Error(`Checkout button "${labels.pay} …" never appeared (checkout.json → labels). ${await describe(page)}`);
  }
  await pay.click();

  // Test cards pass 3-D Secure without a challenge. What follows is either the
  // redirect home or the declined page, which stays put.
  // The loser keeps polling until the page closes, which then throws; that is
  // swallowed rather than left to kill the payer as an unhandled rejection.
  const declined = inAnyFrame(page, (frame) => frame.getByText(labels.declined), timeoutMs * 2).then(
    (found) => (found ? 'declined' : 'none'),
    () => 'none',
  );
  const first = await Promise.race([returned.then(() => 'returned'), declined]);
  if (first === 'declined') return { success: false, returnUrl: null };

  await returned;
  const url = new URL(page.url());
  return { success: url.searchParams.get('success') === 'true', returnUrl: url.toString() };
}
