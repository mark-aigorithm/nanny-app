/**
 * A1 (admin half) — an operator working the bookings queue.
 *
 * The mobile half of the flagship journey is covered by the backend suite; what
 * only a browser can prove is that the console renders the request, that its
 * actions are reachable, and that the screen agrees with the database.
 *
 * Note what the *real* flow is: a broadcast request becomes payable when a
 * nanny claims it, which moves it straight to APPROVED. The admin's Approve
 * action is not part of that path — see the KNOWN GAP at the bottom.
 *
 * Every spec seeds its own mother under a unique surname, because the E2E
 * backend owns one database for the whole run and nothing is truncated in
 * between.
 */
import { expect, test } from '@playwright/test';

import {
  getBooking,
  seedPaidBooking,
  seedPendingBooking,
  superuserToken,
} from './helpers/backend';
import { actionsFor, chooseOption, gotoConsole, rowFor } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

test('shows a new request in the pending queue', async ({ page }) => {
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');

  // The queue opens on "Pending approval", so a new request needs no filtering.
  const row = rowFor(page, booking.mother.surname);
  await expect(row).toBeVisible();
  await expect(row).toContainText('pending');
  await expect(row).toContainText('480.00');
  // Nobody has claimed it yet.
  await expect(row).toContainText('Nanny: No response');
});

test('opens a booking by clicking its row', async ({ page }) => {
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');
  await rowFor(page, booking.mother.surname).click();

  await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`));
  await expect(page.getByRole('heading', { name: 'Booking details' })).toBeVisible();
  await expect(page.getByText('No payment has been made for this booking yet.')).toBeVisible();
});

test('follows a claimed and paid booking through the status filters', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin);

  await gotoConsole(page, '/bookings');

  // It has left the pending queue: claiming moved it on, payment confirmed it.
  await expect(rowFor(page, booking.mother.surname)).toHaveCount(0);

  await chooseOption(page, 'Status', 'Confirmed');

  const row = rowFor(page, booking.mother.surname);
  await expect(row).toBeVisible();
  await expect(row).toContainText(booking.nanny.displayName);
  await expect(row).toContainText('captured');
});

test('shows the money and both parties on the detail page', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin);

  await page.goto(`/bookings/${booking.id}`);

  await expect(page.getByText(`${booking.mother.displayName} · confirmed`)).toBeVisible();
  await expect(page.getByText(booking.nanny.displayName).first()).toBeVisible();

  // The 80/20 split the pricing engine produced, rendered for the operator.
  await expect(page.getByText('EGP 480.00').first()).toBeVisible();
  await expect(page.getByText('EGP 384.00')).toBeVisible();
  await expect(page.getByText('EGP 96.00')).toBeVisible();

  expect((await getBooking(admin, booking.id)).status).toBe('CONFIRMED');
});

/**
 * KNOWN GAP — pinned, not endorsed.
 *
 * The console offers "Approve" on every pending row, but the endpoint refuses
 * any booking without a nanny assigned (admin-booking.service.ts: "Assign a
 * nanny to this unclaimed request before approving it"), and the *only* code
 * path that assigns one is a nanny claiming the request — which sets APPROVED
 * itself. So no booking created by the current app can ever be in the state
 * this action requires, and clicking it on a broadcast request always fails.
 *
 * Pinned here so the fix — hiding the action, or adding a way to assign a nanny
 * — shows up as a deliberate change to this spec.
 */
test('currently fails when approving an unclaimed request', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPendingBooking();

  await gotoConsole(page, '/bookings');
  await actionsFor(page, booking.mother.surname).click();
  await page.getByRole('menuitem', { name: 'Approve' }).click();

  const toast = page.getByRole('status');
  await expect(toast).toContainText('Couldn’t approve booking');
  await expect(toast).toContainText('Assign a nanny');

  // The booking is untouched.
  expect((await getBooking(admin, booking.id)).status).toBe('PENDING');
});
