/**
 * The business team changes a cell of the public /cancellation-flows table
 * and the change outlives a reload — saved on the server, not in the page.
 *
 * Signed out on purpose: the page is open to people with no console login.
 */
import { expect, test } from '@playwright/test';

import { API_BASE_URL } from './helpers/backend';

const SCENARIO = 'Mother cancels a paid booking inside the cancellation window';
const CELL_PATH = '/cancellation-policy/cells/mother-paid-inside/money';

// Nothing is truncated between specs, so put the cell back either way.
test.afterEach(async () => {
  await fetch(`${API_BASE_URL}${CELL_PATH}`, { method: 'DELETE' });
});

test('a changed cell is saved for everyone and can be put back to today', async ({ page }) => {
  await page.goto('/cancellation-flows');

  await page.getByRole('button', { name: `Change Money for ${SCENARIO}` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('What should happen').click();
  await page.getByRole('option', { name: 'Refund a % to the card' }).click();
  await dialog.getByLabel('% refunded').fill('50');
  await dialog.getByLabel('Your name').fill('E2E');
  await dialog.getByRole('button', { name: 'Save change' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  const row = page.getByRole('row').filter({ hasText: SCENARIO });
  await expect(row.getByText('50% refunded to the card')).toBeVisible();
  await expect(row.getByText(/by E2E/)).toBeVisible();

  await page.getByRole('button', { name: `Change Money for ${SCENARIO}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Back to today' }).click();
  await page.reload();
  await expect(row.getByText('50% refunded to the card')).toBeHidden();
});
