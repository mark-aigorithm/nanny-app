/**
 * B6 — a listing's life, from a mother posting it to a buyer messaging her
 * about it.
 *
 * The console is the only surface driven here. Everything on the app's side of
 * the flow — posting, editing, browsing the feed, tapping "Contact seller" — is
 * advanced over HTTP by `helpers/backend.ts`, which is the suite's standing rule
 * for a flow that spans two surfaces: one driver per spec, always.
 *
 * Two things about the modelling are worth knowing before reading further,
 * because both change what an assertion is allowed to mean.
 *
 * A listing **is** a community post. There is no marketplace table; the console
 * moderates `CommunityPost` rows of type `marketplace`, and the same rows are
 * what the app's feed renders. So "did it reach the marketplace" is a question
 * about `/community/posts`, not about an admin list.
 *
 * And an author always sees her own listing, in any moderation state, so that
 * "My listings" can show her a rejection and let her fix it. Visibility is
 * therefore only ever asserted through a **buyer's** token. Asked with the
 * seller's, every one of these tests would pass before the admin had done
 * anything at all.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  approveListingAsAdmin,
  contactSeller,
  editListing,
  findInMarketplaceFeed,
  listMyListings,
  listingVisibleTo,
  rejectListingAsAdmin,
  seedListing,
  seedMother,
  seedOfficialListing,
  superuserToken,
} from './helpers/backend';
import { actionsFor, chooseOption, gotoConsole, rowFor } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

/**
 * Every test here provisions two accounts through the Auth emulator and posts a
 * listing before the browser does anything, which alone can outrun Playwright's
 * 30s default. Raised so that a genuine failure is reported as the assertion
 * that failed, rather than as a timeout on whatever step happened to be running.
 */
test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(90_000);
});

/** One toast, not "some toast": several can be on screen at once. */
function toast(page: Page, text: string): Locator {
  return page.getByRole('status').filter({ hasText: text });
}

type Queue = 'Pending review' | 'Live' | 'Rejected' | 'All';

async function openQueue(page: Page, queue: Queue = 'Pending review'): Promise<void> {
  await gotoConsole(page, '/marketplace');
  // The page opens on the pending queue, which is the only one an admin has to
  // act on; anything else needs the filter.
  if (queue !== 'Pending review') await chooseOption(page, 'Status', queue);
}

/**
 * Walks the queue to whichever page holds a listing, and returns its row.
 *
 * Neither "first page" nor "last page" is correct. The pending queue is
 * **oldest-first** — it is a work queue, so the longest wait is served first —
 * while every other filter is newest-first with official listings pinned above
 * the rest. The E2E database is never truncated, so both ends drift further from
 * "the listing this spec just posted" with every run that has ever executed.
 * Walking is the only answer that does not depend on which filter is showing.
 *
 * Driven by whether *Next page* is still enabled rather than by the page count,
 * so it cannot walk off the end while a page-size change is still in flight.
 */
async function findRow(page: Page, title: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Records per page' }).click();
  await page.getByRole('option', { name: '100', exact: true }).click();

  const indicator = page.locator('.pagination-page');
  const next = page.getByRole('button', { name: 'Next page' });
  await expect(indicator).toBeVisible();

  for (let guard = 0; guard < 30; guard += 1) {
    const row = rowFor(page, title);
    if ((await row.count()) > 0) return row;
    if (await next.isDisabled()) break;

    // The indicator reads from the response's own `meta.page`, so it only
    // changes once the next page's rows are the ones rendered — which makes it
    // a safe signal that "not found here" is about the new page, not the old.
    const before = await indicator.innerText();
    await next.click();
    await expect(indicator).not.toHaveText(before);
  }

  throw new Error(`“${title}” is not in this queue.`);
}

/** Opens a listing's row menu and picks one of its items. */
async function chooseAction(page: Page, title: string, item: string): Promise<void> {
  await actionsFor(page, title).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('a new listing waits for review and reaches nobody meanwhile', async ({ page }) => {
  const listing = await seedListing();
  const buyer = await seedMother();

  // Invisible to a buyer both ways it could be reached: by link and by feed.
  expect(await listingVisibleTo(buyer.token, listing.id)).toBe(false);
  expect(await findInMarketplaceFeed(buyer.token, listing.id)).toBeNull();

  // Visible to its author, though — this is the case that makes a
  // seller-token assertion worthless, so it is pinned rather than assumed.
  expect(await listingVisibleTo(listing.seller.token, listing.id)).toBe(true);

  await openQueue(page);
  const row = await findRow(page, listing.title);
  await expect(row).toContainText('Pending review');
  await expect(row).toContainText(listing.seller.displayName);
});

test('approving publishes it and opens the seller’s inbox', async ({ page }) => {
  const listing = await seedListing();
  const buyer = await seedMother();

  // Messaging is gated on the same approval, so it is refused up front — and a
  // listing nobody may see is reported as missing, not as forbidden.
  expect((await contactSeller(buyer.token, listing.id)).status).toBe(404);

  await openQueue(page);
  await findRow(page, listing.title);
  await chooseAction(page, listing.title, 'Approve');
  await expect(toast(page, 'Listing approved')).toBeVisible();

  expect(await listingVisibleTo(buyer.token, listing.id)).toBe(true);
  const inFeed = await findInMarketplaceFeed(buyer.token, listing.id);
  expect(inFeed?.title).toBe(listing.title);

  // "Contact seller" creates the conversation rather than requiring one to
  // exist, which is the whole reason a buyer can act on a listing at all.
  const contact = await contactSeller(buyer.token, listing.id);
  expect(contact.status).toBe(201);
  expect(contact.conversationId).not.toBeNull();
});

test('rejecting sends the seller the reason', async ({ page }) => {
  const REASON = 'Photos are too blurry to see the item.';
  const listing = await seedListing();
  const buyer = await seedMother();

  await openQueue(page);
  await findRow(page, listing.title);
  await chooseAction(page, listing.title, 'Reject');

  await page.getByLabel('Reason').fill(REASON);
  await page.getByRole('button', { name: 'Reject listing' }).click();
  await expect(toast(page, 'Listing rejected')).toBeVisible();

  // The reason is the point: it is what the seller is shown, and what she is
  // expected to act on. A status alone would tell her nothing.
  const mine = await listMyListings(listing.seller.token);
  const entry = mine.find((item) => item.id === listing.id);
  expect(entry?.moderationStatus).toBe('rejected');
  expect(entry?.rejectionReason).toBe(REASON);

  expect(await listingVisibleTo(buyer.token, listing.id)).toBe(false);
});

test('a rejected listing the seller fixes comes back to the queue', async ({ page }) => {
  const admin = await superuserToken();
  const listing = await seedListing();
  const buyer = await seedMother();

  await rejectListingAsAdmin(admin, listing.id, 'Needs a clearer photo.');

  // The seller edits the price rather than the title, so the console row is
  // still findable by the same text — and so the assertion is about the
  // resubmission, not about a row that changed its name.
  await editListing(listing.seller.token, listing.id, { price: 1200 });

  const resubmitted = (await listMyListings(listing.seller.token)).find(
    (item) => item.id === listing.id,
  );
  expect(resubmitted?.moderationStatus).toBe('pending');
  // Cleared, not merely superseded — the old reason must not follow a fixed
  // listing around.
  expect(resubmitted?.rejectionReason).toBeNull();

  await openQueue(page);
  const row = await findRow(page, listing.title);
  await expect(row).toContainText('Pending review');

  await chooseAction(page, listing.title, 'Approve');
  await expect(toast(page, 'Listing approved')).toBeVisible();
  expect(await listingVisibleTo(buyer.token, listing.id)).toBe(true);
});

test('taking down a live listing pulls it out of the feed', async ({ page }) => {
  const admin = await superuserToken();
  const listing = await seedListing();
  const buyer = await seedMother();

  await approveListingAsAdmin(admin, listing.id);
  expect(await findInMarketplaceFeed(buyer.token, listing.id)).not.toBeNull();

  await openQueue(page, 'Live');
  await findRow(page, listing.title);

  // Rejection doubles as the takedown, and the menu says so: on an approved
  // listing the item reads "Take down". Asserting the wording is not cosmetic —
  // it is how an admin knows this removes something people can currently see.
  await chooseAction(page, listing.title, 'Take down');
  await page.getByLabel('Reason').fill('Item was reported as already sold.');
  await page.getByRole('button', { name: 'Take down' }).click();
  await expect(toast(page, 'Listing rejected')).toBeVisible();

  expect(await listingVisibleTo(buyer.token, listing.id)).toBe(false);
  expect(await findInMarketplaceFeed(buyer.token, listing.id)).toBeNull();
  // And the conversation route closes with it, so a stale link cannot be used
  // to start a chat about a listing that was pulled.
  expect((await contactSeller(buyer.token, listing.id)).status).toBe(404);
});

test('editing a live listing sends it back through review', async ({ page }) => {
  const admin = await superuserToken();
  const listing = await seedListing();
  const buyer = await seedMother();

  await approveListingAsAdmin(admin, listing.id);
  expect(await listingVisibleTo(buyer.token, listing.id)).toBe(true);

  // The surprising one, and the reason this test exists: an edit to an
  // *already approved* listing is not published straight through. It re-enters
  // the queue, which means a seller can drop the price to 1 EGP on a live
  // listing without anyone seeing it until an admin has looked again.
  await editListing(listing.seller.token, listing.id, { price: 9, body: 'Price dropped.' });

  expect(await listingVisibleTo(buyer.token, listing.id)).toBe(false);
  expect(await findInMarketplaceFeed(buyer.token, listing.id)).toBeNull();

  await openQueue(page);
  const row = await findRow(page, listing.title);
  await expect(row).toContainText('Pending review');

  await chooseAction(page, listing.title, 'Approve');
  await expect(toast(page, 'Listing approved')).toBeVisible();
  expect(await listingVisibleTo(buyer.token, listing.id)).toBe(true);
});

test('an official listing is published rather than reviewed', async ({ page }) => {
  const admin = await superuserToken();
  const buyer = await seedMother();

  // Published over HTTP rather than through the console's own form: that form
  // uploads a photo to Firebase Storage, and the test stack runs an Auth
  // emulator only. The route is the same one the form posts to; what is left
  // untested is the file picker, which is noted in Docs/testing/e2e-flows.md.
  const official = await seedOfficialListing(admin);

  // Live immediately — an admin authored it, so there is nobody to review it.
  expect(await listingVisibleTo(buyer.token, official.id)).toBe(true);
  // But there is no seller inbox behind it: buyers use the contact number, and
  // the refusal is a 400 rather than the 404 an unpublished listing gives.
  expect((await contactSeller(buyer.token, official.id)).status).toBe(400);

  await openQueue(page, 'Live');
  const row = await findRow(page, official.title);
  await expect(row).toContainText('Official');

  await actionsFor(page, official.title).click();
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  // Asserted as absent because approving or rejecting an official listing is a
  // 400 at the API — offering either would be a control that cannot work.
  await expect(page.getByRole('menuitem', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /^(Reject|Take down)$/ })).toHaveCount(0);

  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete listing' }).click();
  await expect(toast(page, 'Official listing deleted')).toBeVisible();

  expect(await listingVisibleTo(buyer.token, official.id)).toBe(false);
});
