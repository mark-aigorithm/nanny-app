/**
 * B5 — the Users console: the parent ID-review queue and the nanny decision.
 *
 * A parent cannot book until someone here has looked at a photograph of her ID
 * and said yes; a nanny cannot be offered work until someone has opened her
 * application — profile and ID together — and approved it. What these specs
 * protect is narrow: that the queue *shows* the parent waiting, that a decision
 * made in the gallery lands on the account, that the queue then stops offering
 * her, and that a nanny is decided on her own page and nowhere else.
 *
 * What the decision goes on to *unlock* — booking for a parent, entering the
 * broadcast pool for a nanny — belongs to A10 and A11 and is asserted over HTTP
 * there. Repeating it through a browser would only make it slower to run.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  getMotherKyc,
  getNannyApproval,
  seedMother,
  seedPendingNanny,
  superuserToken,
} from './helpers/backend';
import { chooseOption, gotoConsole, rowFor } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

/** The gallery card for one seeded person, found by their unique surname. */
function cardFor(page: Page, surname: string) {
  return page.locator('.id-review-card').filter({ hasText: surname });
}

/** Opens Users and switches to one of its three tabs. */
async function openTab(page: Page, tab: 'Mommies' | 'Nannies' | 'ID Review') {
  await gotoConsole(page, '/users');
  await page.getByRole('tab', { name: tab }).click();
}

/**
 * Opens the ID-review gallery showing the newest uploads first.
 *
 * The gallery opens oldest-first — it is a work queue, so whoever has been
 * waiting longest is offered first — while a just-seeded person is the newest
 * row in an E2E database that is never truncated between specs. The Sort
 * control is the supported way to turn that around, so the spec uses it instead
 * of walking to the last page; it also survives a filter change, since sort is
 * separate state from the page number.
 */
async function openIdQueue(page: Page): Promise<void> {
  await openTab(page, 'ID Review');
  await chooseOption(page, 'Sort', 'Newest first');
}

test('lists a newly registered parent awaiting review', async ({ page }) => {
  const mother = await seedMother();

  await openIdQueue(page);

  // The queue opens on "Pending review", so an unvetted upload needs no filter.
  // Every card is a parent, so the card names the ID kind, not the role.
  const card = cardFor(page, mother.surname);
  await expect(card).toBeVisible();
  await expect(card).toContainText('Passport');
  // The photograph is the point of the queue — not just the row.
  await expect(card.getByAltText(`Front of ${mother.displayName}'s ID`)).toBeVisible();
});

test('approving an ID clears it from the queue and lands on the account', async ({ page }) => {
  const admin = await superuserToken();
  const mother = await seedMother();

  await openIdQueue(page);
  await cardFor(page, mother.surname).getByRole('button', { name: 'Approve' }).click();

  // Approving is confirmed, not one-click — the dialog names who it is about.
  await expect(page.getByText(`Mark ${mother.displayName}'s ID as verified?`)).toBeVisible();
  await page.getByRole('button', { name: 'Approve ID' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'ID approved' })).toBeVisible();

  // Gone from the pending queue, and actually approved on the record — the
  // second half is what separates a real decision from a list that re-filtered.
  await expect(cardFor(page, mother.surname)).toHaveCount(0);
  expect((await getMotherKyc(admin, mother.id)).approvalStatus).toBe('APPROVED');
});

test('rejecting an ID records the reason the user will be shown', async ({ page }) => {
  const admin = await superuserToken();
  const mother = await seedMother();

  await openIdQueue(page);
  await cardFor(page, mother.surname).getByRole('button', { name: 'Reject' }).click();

  await page.getByLabel(/^Reason/).fill('The photo was too blurry to read.');
  await page.getByRole('button', { name: 'Reject ID' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'ID rejected' })).toBeVisible();

  const kyc = await getMotherKyc(admin, mother.id);
  expect(kyc.approvalStatus).toBe('REJECTED');
  expect(kyc.rejectionReason).toBe('The photo was too blurry to read.');
});

test('a rejected ID is findable again under its own filter', async ({ page }) => {
  const admin = await superuserToken();
  const mother = await seedMother();

  await openIdQueue(page);
  await cardFor(page, mother.surname).getByRole('button', { name: 'Reject' }).click();
  await page.getByLabel(/^Reason/).fill('Expired document.');
  await page.getByRole('button', { name: 'Reject ID' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ID rejected' })).toBeVisible();

  await chooseOption(page, 'Status', 'Rejected');

  // A decision is not a disappearance: the operator can go back and read why.
  const card = cardFor(page, mother.surname);
  await expect(card).toBeVisible();
  await expect(card).toContainText('Reason: Expired document.');
  // Already decided, so it is not offered for decision a second time.
  await expect(card.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  expect((await getMotherKyc(admin, mother.id)).approvalStatus).toBe('REJECTED');
});

test('the gallery is for parents — a waiting nanny is not offered there', async ({ page }) => {
  const mother = await seedMother();
  const nanny = await seedPendingNanny();

  await openIdQueue(page);

  await expect(cardFor(page, mother.surname)).toBeVisible();
  await expect(cardFor(page, nanny.surname)).toHaveCount(0);
  // There is no role control to switch to nannies with.
  await expect(page.locator('.filter-select', { hasText: 'Role' })).toHaveCount(0);
});

test('the Mommies tab lists a parent and follows her status', async ({ page }) => {
  const mother = await seedMother();

  await openTab(page, 'Mommies');

  await chooseOption(page, 'Status', 'Pending review');
  await expect(rowFor(page, mother.surname)).toBeVisible();

  // Filters are the operator's only way to narrow this table — there is no
  // search box on it, so a wrong filter is a dead end rather than a slow one.
  await chooseOption(page, 'Status', 'Approved');
  await expect(rowFor(page, mother.surname)).toHaveCount(0);
});

test('a decision in the gallery shows up on the per-role tab', async ({ page }) => {
  const mother = await seedMother();

  await openIdQueue(page);
  await cardFor(page, mother.surname).getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Approve ID' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ID approved' })).toBeVisible();

  // The two views read different endpoints; the card invalidates both, and this
  // is what would catch that being dropped.
  await page.getByRole('tab', { name: 'Mommies' }).click();
  await chooseOption(page, 'Status', 'Approved');
  await expect(rowFor(page, mother.surname)).toBeVisible();
});

test('a nanny is approved from her own page, and the Nannies queue lets her go', async ({ page }) => {
  const admin = await superuserToken();
  const nanny = await seedPendingNanny();

  await openTab(page, 'Nannies');
  await chooseOption(page, 'Status', 'Pending review');
  await rowFor(page, nanny.surname).click();

  // Her ID is part of what is being decided, so it is reachable from here.
  await expect(page.getByRole('button', { name: 'View ID' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve nanny' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Nanny approved' })).toBeVisible();

  const nannyProfileId = Number(page.url().split('/').pop());
  expect((await getNannyApproval(admin, nannyProfileId)).approvalStatus).toBe('APPROVED');

  await openTab(page, 'Nannies');
  await chooseOption(page, 'Status', 'Pending review');
  await expect(rowFor(page, nanny.surname)).toHaveCount(0);
  await chooseOption(page, 'Status', 'Approved');
  await expect(rowFor(page, nanny.surname)).toBeVisible();
});

test('rejecting a nanny records the reason she will be shown', async ({ page }) => {
  const admin = await superuserToken();
  const nanny = await seedPendingNanny();

  await openTab(page, 'Nannies');
  await chooseOption(page, 'Status', 'Pending review');
  await rowFor(page, nanny.surname).click();

  await page.getByRole('button', { name: 'Reject application' }).click();
  await page.getByLabel(/^Reason/).fill('Certificate could not be verified.');
  await page.getByRole('button', { name: 'Reject application' }).last().click();
  await expect(page.getByRole('status').filter({ hasText: 'Application rejected' })).toBeVisible();

  const nannyProfileId = Number(page.url().split('/').pop());
  const approval = await getNannyApproval(admin, nannyProfileId);
  expect(approval.approvalStatus).toBe('REJECTED');
  expect(approval.rejectionReason).toBe('Certificate could not be verified.');
});
