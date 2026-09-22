/**
 * A3 + A8 (admin half) — editing a paid booking and settling the difference.
 *
 * This is the console's most consequential screen: the operator changes the
 * booking's inputs, the server re-prices, and the sign of the delta decides
 * whether the mother is asked for more money or given some back. The editor
 * never lets an admin type a total — the assertions below are about the flow
 * around that, not about arithmetic (which the backend suite owns).
 *
 * Whichever way the difference is returned — to the card or as Care Points —
 * the page has to stop offering it afterwards, or the next operator to open the
 * booking gives it back a second time.
 */
import { expect, test } from '@playwright/test';

import { getBooking, seedPaidBooking, superuserToken } from './helpers/backend';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

/** Tomorrow at `hour`, in the `datetime-local` format the editor's inputs use. */
function localDateTimeTomorrow(hour: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00`;
}

/** Opens the editor on a booking that is already paid in full. */
async function openEditor(page: import('@playwright/test').Page, bookingId: number) {
  await page.goto(`/bookings/${bookingId}`);
  await page.getByRole('button', { name: 'Edit booking' }).click();
  await expect(page.getByText('What this edit changes')).toBeVisible();
}

test('previews a shortened booking as a refund, before saving anything', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin, { startHour: 10, durationHours: 6 });

  await openEditor(page, booking.id);

  // 10:00–16:00 becomes 10:00–14:00.
  await page.getByLabel('Ends').fill(localDateTimeTomorrow(14));

  // The rail prices the edit live and names the direction in plain words.
  await expect(page.getByText(/^Refund due /)).toBeVisible();
  await expect(page.getByText('Already paid')).toBeVisible();

  // A preview writes nothing.
  const untouched = await getBooking(admin, booking.id);
  expect(untouched.totalAmount).toBe(booking.totalAmount);
});

test('saves a shortened booking and refunds the overpayment to the card', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin, { startHour: 10, durationHours: 6 });

  await openEditor(page, booking.id);
  await page.getByLabel('Ends').fill(localDateTimeTomorrow(14));
  await expect(page.getByText(/^Refund due /)).toBeVisible();

  await page.getByRole('button', { name: 'Save changes' }).click();

  // Saving an overpaid edit opens the refund follow-up rather than ending there.
  await expect(page.getByText('Refund the overpayment')).toBeVisible();
  await expect(page.getByText(/is overpaid by/)).toBeVisible();

  await page.getByLabel('Reason').fill('We shortened the booking at your request.');
  await page.getByRole('button', { name: 'Refund', exact: true }).click();

  await expect(page.getByRole('status')).toContainText('Refund issued');

  // The money actually moved: the booking is re-priced for four hours and
  // nothing is left owing.
  const updated = await getBooking(admin, booking.id);
  expect(updated.totalAmount).toBeLessThan(booking.totalAmount);
  expect(updated.refundableAmount).toBe(0);
});

test('keeps the refund reachable after the follow-up is dismissed', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin, { startHour: 10, durationHours: 6 });

  await openEditor(page, booking.id);
  await page.getByLabel('Ends').fill(localDateTimeTomorrow(14));
  await expect(page.getByText(/^Refund due /)).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();

  // The operator walks away from the follow-up — Paymob was down, the phone
  // rang, whatever. The edit is saved; the money has not moved.
  await expect(page.getByText('Refund the overpayment')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  const unsettled = await getBooking(admin, booking.id);
  expect(unsettled.refundableAmount).toBeGreaterThan(0);

  // Coming back later — a fresh load, not the editor's own state — the page
  // still says she is owed money and offers to return it.
  await page.reload();
  await expect(page.getByRole('note')).toContainText('overpaid by');
  await page.getByRole('button', { name: 'Refund overpayment' }).click();

  await expect(page.getByText('Refund the overpayment')).toBeVisible();
  await page.getByLabel('Reason').fill('Settling the shortened booking.');
  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Refund issued');

  // Settled for real, and the page stops asking.
  const settled = await getBooking(admin, booking.id);
  expect(settled.refundableAmount).toBe(0);
  expect(settled.amountPaid).toBe(settled.totalAmount);
  await expect(page.getByRole('button', { name: 'Refund overpayment' })).toHaveCount(0);
});

test('records the refund on the detail page', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin, { startHour: 10, durationHours: 6 });

  await openEditor(page, booking.id);
  await page.getByLabel('Ends').fill(localDateTimeTomorrow(14));
  await expect(page.getByText(/^Refund due /)).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByLabel('Reason').fill('Shortened.');
  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Refund issued');

  await page.reload();

  // The payment card shows what was returned, not just that something happened.
  await expect(page.getByText('Refunded')).toBeVisible();
  await expect(page.getByText('EGP 240.00').first()).toBeVisible();
});

test('can return an overpayment as Care Points instead of money', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin, { startHour: 10, durationHours: 6 });

  await openEditor(page, booking.id);
  await page.getByLabel('Ends').fill(localDateTimeTomorrow(14));
  await expect(page.getByText(/^Refund due /)).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('Refund the overpayment')).toBeVisible();
  await page.getByRole('button', { name: /Grant Care Points/ }).click();

  await page.getByLabel('Care Points to grant').fill('250');
  await page.getByLabel('Reason').fill('Goodwill for the change.');
  await page.getByRole('button', { name: 'Refund', exact: true }).click();

  await expect(page.getByRole('status')).toContainText('Refund issued');

  // Points settle the overpayment just as money does. Coming back to the page
  // later, it must not offer the same difference again — that is how a mother
  // ends up with the points AND a card refund for one overpayment.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Refund overpayment' })).toHaveCount(0);
  await expect(page.getByRole('note')).toHaveCount(0);

  // It does say where the money went, on the payment card.
  await expect(page.getByText('Returned as Care Points')).toBeVisible();

  const settled = await getBooking(admin, booking.id);
  expect(settled.refundableAmount).toBe(0);
  expect(settled.refundedAsPointsAmount).toBe(settled.amountPaid - settled.totalAmount);
});

test('asks for confirmation before charging the mother more', async ({ page }) => {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin, { startHour: 10, durationHours: 4 });

  await openEditor(page, booking.id);
  // 10:00–14:00 becomes 10:00–16:00, so she owes the difference.
  await page.getByLabel('Ends').fill(localDateTimeTomorrow(16));

  await expect(page.getByText(/^Mother owes /)).toBeVisible();

  await page.getByRole('button', { name: 'Save changes' }).click();

  // Extra money is never taken silently — the operator has to confirm.
  await expect(page.getByText('Charge the difference?')).toBeVisible();
  await page.getByRole('button', { name: 'Save & request payment' }).click();

  await expect(page.getByRole('status')).toContainText('Booking updated');

  const updated = await getBooking(admin, booking.id);
  expect(updated.totalAmount).toBeGreaterThan(booking.totalAmount);
});
