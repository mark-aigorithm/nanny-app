/**
 * B7 — the FAQ an operator writes on Settings is the FAQ the app shows.
 *
 * Driven through the console's editor, read back through `/support/faq` as
 * the app would. The list is global, so every test puts back what it found.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  getAppSupportFaq,
  seedMother,
  setSupportFaqAsAdmin,
  superuserToken,
  type AppFaq,
} from './helpers/backend';
import { gotoConsole } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(60_000);
});

function faqCard(page: Page) {
  return page.locator('form').filter({ has: page.getByRole('heading', { name: 'FAQ', exact: true }) });
}

function unique(text: string): string {
  return `${text} ${Date.now().toString(36)}`;
}

test('a question added in the console reaches the app, in the console’s order', async ({ page }) => {
  const admin = await superuserToken();
  const mother = await seedMother();
  const before = await getAppSupportFaq(admin);
  const question = unique('Do you cover Alexandria?');

  await gotoConsole(page, '/settings');
  const card = faqCard(page);
  await expect(card.getByLabel('Question 1', { exact: true })).toHaveValue(before.items[0]?.question ?? '');

  try {
    await card.getByRole('button', { name: 'Add question' }).click();
    const position = before.items.length + 1;
    await card.getByLabel(`Question ${position}`, { exact: true }).fill(question);
    await card.getByLabel('Answer').nth(position - 1).fill('Not yet — Cairo only for now.');
    await card.getByRole('button', { name: 'Save FAQ' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'FAQ saved' })).toBeVisible();

    const shown = await getAppSupportFaq(mother.token);
    expect(shown.items).toHaveLength(position);
    expect(shown.items[position - 1]).toEqual({
      question,
      answer: 'Not yet — Cairo only for now.',
    });
  } finally {
    await setSupportFaqAsAdmin(admin, before);
  }
});

test('an entry with no answer is refused before anything is sent', async ({ page }) => {
  const admin = await superuserToken();
  const before: AppFaq = await getAppSupportFaq(admin);

  await gotoConsole(page, '/settings');
  const card = faqCard(page);
  await expect(card.getByLabel('Question 1', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: 'Add question' }).click();
  await card.getByLabel(`Question ${before.items.length + 1}`, { exact: true }).fill('Half written');
  await card.getByRole('button', { name: 'Save FAQ' }).click();

  await expect(card.getByText(/every entry needs an answer/i)).toBeVisible();
  expect(await getAppSupportFaq(admin)).toEqual(before);
});
