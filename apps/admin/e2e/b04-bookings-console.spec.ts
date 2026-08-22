/**
 * B4 — the bookings console as a workspace.
 *
 * A1, A2 and A3 already drive this page for the things that move a booking
 * along: seeing a new request, opening it, rejecting it, refunding it. What is
 * left is the furniture an operator actually lives in — the status override,
 * and paging through a queue longer than one screen — plus the one rule the
 * page enforces on its own, which is that a completed booking is locked.
 *
 * Note what is *not* here: there is no search on this page. Filters and paging
 * are the only ways to narrow it, which is why the paging half is worth a test
 * rather than being assumed to work.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  getBooking,
  seedMother,
  seedPaidBooking,
  seedPendingBooking,
  superuserToken,
} from './helpers/backend';
import {
  actionsFor,
  chooseOption,
  gotoConsole,
  rowFor,
  statusSelectFor,
} from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

test.beforeEach(({}, testInfo) => {
  // Seeding a queue costs a request per booking; the default 30s is not enough
  // for the paging test and is uncomfortably close for the others.
  testInfo.setTimeout(90_000);
});

/** Picks a value from a row's status-override dropdown. */
async function override(page: Page, surname: string, status: string): Promise<void> {
  await statusSelectFor(page, surname).click();
  await page.getByRole('option', { name: status, exact: true }).click();
}

/** The most recent "Status updated" toast; two can overlap when a test overrides twice. */
function updatedToast(page: Page) {
  return page.getByRole('status').filter({ hasText: 'Status updated' }).first();
}

test('overrides a booking status straight from the queue', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');
  await expect(rowFor(page, booking.mother.surname)).toBeVisible();

  // Cancelling is the one thing an operator can do to an unclaimed request:
  // PENDING only reaches APPROVED (which needs a nanny) or CANCELLED.
  await override(page, booking.mother.surname, 'cancelled');

  await expect(updatedToast(page)).toBeVisible();
  expect((await getBooking(admin, booking.id)).status).toBe('CANCELLED');

  // It has left the queue it was in, because that queue is a status filter.
  await expect(rowFor(page, booking.mother.surname)).toHaveCount(0);
});

test('locks the override once a booking is completed', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin);

  // "All" so the row stays put as its status changes; the list is newest-first,
  // so a booking seeded moments ago is at the top of it.
  await gotoConsole(page, '/bookings');
  await chooseOption(page, 'Status', 'All');

  // The legal way to the end of the lifecycle, one hop at a time.
  await override(page, booking.mother.surname, 'in progress');
  await expect(updatedToast(page)).toBeVisible();
  await override(page, booking.mother.surname, 'completed');

  // The control stays rendered so the operator can still read the status, but
  // nothing more can be done to it — the server refuses too, so this is the UI
  // agreeing with the rule rather than inventing one.
  //
  // Waited on before the read-back, and not the other way round: the lock is
  // rendered from the *refetched* list, so it is the signal that the second
  // override has actually landed. Reading the API first raced it, and returned
  // IN_PROGRESS often enough to show up as a flake.
  const select = statusSelectFor(page, booking.mother.surname);
  await expect(select).toBeVisible();
  await expect(select).toBeDisabled();
  await expect(select).toHaveAttribute('title', 'Completed bookings are locked');

  expect((await getBooking(admin, booking.id)).status).toBe('COMPLETED');
});

/**
 * KNOWN GAP — pinned, not endorsed.
 *
 * The override dropdown offers every status except REFUNDED, on every row,
 * regardless of where that booking actually is. The server enforces
 * `VALID_TRANSITIONS` (booking.service.ts:457), so most of what it offers is
 * refused: a PENDING booking can only reach APPROVED or CANCELLED, and APPROVED
 * additionally needs a nanny assigned. Picking "completed" on a new request is
 * therefore a guaranteed error toast.
 *
 * Same shape as the Approve gap pinned in a01: the console offers an action the
 * API will not perform. Pinned here so narrowing the options to the legal ones
 * shows up as a deliberate change to this spec.
 */
test('currently offers transitions the server refuses', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');
  await override(page, booking.mother.surname, 'completed');

  const toast = page.getByRole('status').filter({ hasText: 'Couldn’t update status' });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Cannot transition booking from PENDING to COMPLETED');

  // The booking is untouched.
  expect((await getBooking(admin, booking.id)).status).toBe('PENDING');
});

test('pages through a queue longer than one screen', async ({ page }) => {
  // One mother, many bookings: an account per row would cost a Firebase
  // sign-up each, and nothing here cares who the parent is. Different days
  // keep them from overlapping, which the API refuses.
  const mother = await seedMother();
  for (let day = 1; day <= 11; day += 1) {
    await seedPendingBooking({ mother, daysAhead: day });
  }

  await gotoConsole(page, '/bookings');

  // The smallest page size, so this holds no matter how much other data the
  // shared E2E database has accumulated by the time this spec runs.
  await page.getByRole('button', { name: 'Records per page' }).click();
  await page.getByRole('option', { name: '10', exact: true }).click();

  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(page.locator('.pagination-summary')).toContainText(/^1–10 of \d+ bookings$/);

  const next = page.getByRole('button', { name: 'Next page' });
  await expect(next).toBeEnabled();
  await next.click();

  await expect(page.locator('.pagination-page')).toContainText('Page 2 of');
  await expect(page.locator('.pagination-summary')).toContainText(/^11–\d+ of \d+ bookings$/);

  // Going back is not merely enabled, it returns to the same first page.
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.locator('.pagination-page')).toContainText('Page 1 of');
});

test('changing the filter returns to the first page', async ({ page }) => {
  const mother = await seedMother();
  for (let day = 1; day <= 11; day += 1) {
    await seedPendingBooking({ mother, daysAhead: day });
  }

  await gotoConsole(page, '/bookings');
  await page.getByRole('button', { name: 'Records per page' }).click();
  await page.getByRole('option', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.pagination-page')).toContainText('Page 2 of');

  // Without the reset, a filter change would ask for page 2 of a result set
  // that may only have one page — and the operator would see an empty table.
  await chooseOption(page, 'Status', 'All');
  await expect(page.locator('.pagination-page')).toContainText('Page 1 of');
});

/**
 * The override is a write control, so a view-only operator does not get one.
 *
 * `PATCH /bookings/:id/status` requires bookings:MANAGE
 * (`admin-permissions.ts:69`), which makes the dropdown an offer of a
 * guaranteed 403 for anyone holding VIEW — the same defect as the transitions
 * pinned above, decided by who is looking rather than by where the booking is.
 */
test.describe('view-only operator', () => {
  test.use({ storageState: storageStatePath('bookingsViewer') });

  test('is not offered the status override it cannot use', async ({ page }) => {
    // Seeded so the table has a row to render controls *for*: asserting an
    // absence against an empty table would pass for the wrong reason.
    const booking = await seedPendingBooking();

    await gotoConsole(page, '/bookings');
    const row = rowFor(page, booking.mother.surname);
    await expect(row).toBeVisible();

    // The queue stays legible — the status is still there to read.
    await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toBeVisible();
    await expect(row).toContainText('pending');

    // Neither write control is offered. The Override column goes entirely
    // rather than standing empty beside the Status badge it would only repeat;
    // the positive assertion above is what keeps this one from passing because
    // `columnheader` matched nothing at all.
    await expect(page.getByRole('columnheader', { name: 'Override', exact: true })).toHaveCount(0);
    await expect(statusSelectFor(page, booking.mother.surname)).toHaveCount(0);
    await expect(actionsFor(page, booking.mother.surname)).toHaveCount(0);
  });
});
