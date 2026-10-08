/**
 * A17 (admin half) — the money side of a cancellation.
 *
 * A booking cancelled after the mother paid keeps her card money until an
 * operator decides what to do with it: refund some or all of it to the card,
 * or give Care Points instead. The page suggests an amount — the full payment,
 * or less the late-cancellation fee when she cancelled late — but the operator
 * chooses. That fee is itself a console setting, and the app's cancel warning
 * reads it, so the specs below also prove the setting reaches the app.
 *
 * The arithmetic is the backend suite's (A3, A17); these are about the screen:
 * the banner appears, the suggestion is pre-filled, the operator can change it
 * within what she paid, and each settlement leaves the booking where it should.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  cancelBookingAsMother,
  getAppBookingOptions,
  getBooking,
  getWalletPoints,
  seedPaidBooking,
  superuserToken,
} from './helpers/backend';
import { gotoConsole } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(60_000);
});

/** A booking the mother paid for by card and then cancelled from the app. */
async function cancelledAfterPayment() {
  const admin = await superuserToken();
  const booking = await seedPaidBooking(admin, { startHour: 10, durationHours: 4 });
  await cancelBookingAsMother(booking.mother.token, booking.id);
  const detail = await getBooking(admin, booking.id);
  expect(detail.status).toBe('CANCELLED');
  expect(detail.refundKind).toBe('CANCELLED');
  return { admin, booking, detail };
}

async function openRefund(page: Page, bookingId: number) {
  await page.goto(`/bookings/${bookingId}`);
  await expect(page.getByRole('note')).toContainText('Cancelled after the mother paid');
  await page.getByRole('button', { name: 'Refund or give Care Points' }).click();
  await expect(page.getByText('Refund the cancelled booking')).toBeVisible();
}

function amountField(page: Page) {
  return page.getByLabel(/^Amount to refund/);
}

test('offers a cancelled, paid booking for refund with the policy’s suggestion pre-filled', async ({ page }) => {
  const { booking, detail } = await cancelledAfterPayment();

  await openRefund(page, booking.id);

  // Whether the fee applies depends on how far tomorrow 10:00 is from now —
  // so read what the server suggests rather than assume it.
  await expect(page.getByRole('dialog')).toContainText(
    `The policy suggests refunding EGP ${detail.suggestedRefundAmount.toFixed(2)}`,
  );
  await expect(amountField(page)).toHaveValue(detail.suggestedRefundAmount.toFixed(2));
});

test('lets the operator refund part of it now and the rest later, capped at what she paid', async ({ page }) => {
  const { admin, booking, detail } = await cancelledAfterPayment();
  const paid = detail.refundableAmount;

  await openRefund(page, booking.id);

  // More than she paid is refused in the dialog, before anything is sent.
  await amountField(page).fill(String(paid + 1));
  await page.getByLabel('Reason').fill('Goodwill.');
  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText("can't exceed what the mother paid");

  await amountField(page).fill('100');
  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Refund issued');

  const partly = await getBooking(admin, booking.id);
  expect(partly.status).toBe('CANCELLED');
  expect(partly.refundableAmount).toBeCloseTo(paid - 100, 2);

  // The banner stays for what is left, and refunding it settles the booking.
  await page.reload();
  await page.getByRole('button', { name: 'Refund or give Care Points' }).click();
  await amountField(page).fill(String(partly.refundableAmount));
  await page.getByLabel('Reason').fill('The rest.');
  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Refund issued');

  const settled = await getBooking(admin, booking.id);
  expect(settled.status).toBe('REFUNDED');
  expect(settled.refundableAmount).toBe(0);
  await expect(page.getByRole('button', { name: 'Refund or give Care Points' })).toHaveCount(0);
});

test('settles a cancelled booking with Care Points instead of money', async ({ page }) => {
  const { admin, booking } = await cancelledAfterPayment();
  const pointsBefore = await getWalletPoints(booking.mother.token);

  await openRefund(page, booking.id);
  await page.getByRole('button', { name: /Grant Care Points/ }).click();
  await page.getByLabel(/^Care Points to grant/).fill('250');
  await page.getByLabel('Reason').fill('Points instead of a card refund.');
  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('250 Care Points were granted');

  const settled = await getBooking(admin, booking.id);
  expect(settled.status).toBe('REFUNDED');
  // No money moved; she has the points.
  expect(settled.amountPaid).toBeGreaterThan(0);
  expect(await getWalletPoints(booking.mother.token)).toBe(pointsBefore + 250);
  await expect(page.getByRole('button', { name: 'Refund or give Care Points' })).toHaveCount(0);
});

test('the late-cancellation fee set in the console reaches the app', async ({ page }) => {
  const admin = await superuserToken();
  const before = await getAppBookingOptions(admin);
  const changed = before.cancellationFeePercent === 30 ? 40 : 30;
  const feeField = page.getByRole('spinbutton', { name: /Late-cancellation fee/ });

  await gotoConsole(page, '/settings');

  try {
    await feeField.fill(String(changed));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();

    expect((await getAppBookingOptions(admin)).cancellationFeePercent).toBe(changed);
  } finally {
    // Global config nothing truncates — restore it through the console.
    await feeField.fill(String(before.cancellationFeePercent));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect
      .poll(async () => (await getAppBookingOptions(admin)).cancellationFeePercent)
      .toBe(before.cancellationFeePercent);
  }
});

test('refuses a fee above 100% in the console', async ({ page }) => {
  const admin = await superuserToken();
  const before = await getAppBookingOptions(admin);

  await gotoConsole(page, '/settings');
  await page.getByRole('spinbutton', { name: /Late-cancellation fee/ }).fill('150');
  await page.getByRole('button', { name: 'Save changes' }).click();

  // Nothing saved: the app still reads the old fee.
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toHaveCount(0);
  expect((await getAppBookingOptions(admin)).cancellationFeePercent).toBe(before.cancellationFeePercent);
});
