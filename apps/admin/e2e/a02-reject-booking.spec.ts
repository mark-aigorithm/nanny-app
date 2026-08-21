/**
 * A2 (admin half) — turning a request away before any money moves.
 *
 * Unlike Approve, Reject works on an unclaimed broadcast request, which is what
 * an operator actually has in front of them. The reason typed here reaches the
 * mother, so it is asserted end to end rather than just "a toast appeared".
 */
import { expect, test } from '@playwright/test';

import { getBooking, seedPendingBooking, superuserToken } from './helpers/backend';
import { actionsFor, chooseOption, gotoConsole, rowFor } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

const REASON = 'No nanny is available in your area for that time.';

test('rejects a pending request with a reason', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');
  await actionsFor(page, booking.mother.surname).click();
  await page.getByRole('menuitem', { name: 'Reject' }).click();

  // The dialog names the mother, so an operator cannot reject the wrong row.
  await expect(page.getByText(`Reject this booking for ${booking.mother.displayName}?`)).toBeVisible();

  await page.getByLabel('Reason (optional — shown to the mother)').fill(REASON);
  await page.getByRole('button', { name: 'Reject booking' }).click();

  await expect(page.getByRole('status')).toContainText('Booking rejected');
  await expect(rowFor(page, booking.mother.surname)).toHaveCount(0);

  const persisted = await getBooking(admin, booking.id);
  expect(persisted.status).toBe('CANCELLED');
  expect(persisted.cancellationReason).toBe(REASON);
});

test('shows the rejection reason on the detail page', async ({ page }) => {
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');
  await actionsFor(page, booking.mother.surname).click();
  await page.getByRole('menuitem', { name: 'Reject' }).click();
  await page.getByLabel('Reason (optional — shown to the mother)').fill(REASON);
  await page.getByRole('button', { name: 'Reject booking' }).click();
  await expect(page.getByRole('status')).toContainText('Booking rejected');

  await page.goto(`/bookings/${booking.id}`);

  await expect(page.getByText(`${booking.mother.displayName} · cancelled`)).toBeVisible();
  await expect(page.getByText(REASON)).toBeVisible();
  // Nothing was ever charged for a request that died before approval.
  await expect(page.getByText('No payment has been made for this booking yet.')).toBeVisible();
});

test('leaves the booking alone when the dialog is dismissed', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');
  await actionsFor(page, booking.mother.surname).click();
  await page.getByRole('menuitem', { name: 'Reject' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(rowFor(page, booking.mother.surname)).toBeVisible();
  expect((await getBooking(admin, booking.id)).status).toBe('PENDING');
});

test('offers no actions on a booking that is already terminal', async ({ page }) => {
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');
  await actionsFor(page, booking.mother.surname).click();
  await page.getByRole('menuitem', { name: 'Reject' }).click();
  await page.getByRole('button', { name: 'Reject booking' }).click();
  await expect(page.getByRole('status')).toContainText('Booking rejected');

  await chooseOption(page, 'Status', 'Cancelled');

  // A cancelled booking is history: the row renders, the action menu does not.
  const row = rowFor(page, booking.mother.surname);
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
});
