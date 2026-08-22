/**
 * Shared locators for the console's tables.
 *
 * `getByRole('row', …)` does not work here: the `Table` component gives a
 * clickable row `role="button"`, which overrides the implicit `row` role, so
 * only the header is exposed as a row. Filtering `<tr>` by text is both
 * accurate and independent of that choice.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Navigates and waits until the console has actually booted.
 *
 * `page.goto` resolves on load, but the app renders nothing useful until two
 * async gates clear: `RequireAuth` returns null while Firebase restores the
 * session, then `PermissionsProvider` shows a loading state until `/admin/me`
 * answers. Asserting straight after `goto` races both — the sidebar is empty
 * and every section link is legitimately absent. Waiting for the navigation
 * landmark is the deterministic signal that privileges are known.
 *
 * Given its own generous timeout rather than the suite's 10s default: this is
 * the slowest thing any spec waits for, it is two sequential round-trips rather
 * than a render, and WebKit is materially slower through both. At 10s it failed
 * on a loaded machine — not as a flaky assertion about the thing under test, but
 * as "navigation not found", which reads like a broken page rather than a cold
 * start. Everything else keeps the shorter default, where a long wait would be
 * hiding a real fault.
 */
export async function gotoConsole(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 30_000 });
}

/**
 * Picks a value from one of the console's dropdowns.
 *
 * `Select` is a custom button-plus-listbox, not a native `<select>`, so
 * `selectOption` does not apply — the control has to be opened and its option
 * clicked, which is what an operator does anyway.
 */
export async function chooseOption(
  page: Page,
  filterLabel: string,
  optionLabel: string,
): Promise<void> {
  await page.locator('.filter-select', { hasText: filterLabel }).getByRole('button').click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

/** The single table row belonging to a seeded fixture, found by its unique surname. */
export function rowFor(page: Page, surname: string): Locator {
  return page.locator('tbody tr').filter({ hasText: surname });
}

/**
 * The row-level action menu.
 *
 * Scoped *inside* the row rather than looked up on the page: because the row
 * carries `role="button"`, its accessible name is its whole text content —
 * which includes the menu trigger's own label — so a page-level query by that
 * name matches both the row and the trigger.
 */
export function actionsFor(page: Page, surname: string): Locator {
  return rowFor(page, surname).getByRole('button', { name: /^Actions for/ });
}

/**
 * The row's status-override dropdown, scoped the same way and for the same reason.
 *
 * Queried as a `button`, not a `combobox`: `Select` is a plain `<button
 * aria-haspopup="listbox">` that reveals a popover, and `aria-haspopup` does not
 * change an element's role. A `combobox` query here matches nothing at all.
 */
export function statusSelectFor(page: Page, surname: string): Locator {
  return rowFor(page, surname).getByRole('button', { name: /^Override status for/ });
}
