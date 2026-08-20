/**
 * A12 (UI half) — what a section-scoped operator can see and reach.
 *
 * The exhaustive 13 × 3 matrix runs over HTTP in the backend suite, where it
 * walks `ADMIN_ROUTE_PERMISSIONS` itself. What only a browser proves is the
 * console's half of the same contract: the sidebar hides what an operator
 * cannot open, a hand-typed URL does not get them in anyway, and a VIEW-only
 * section renders without its write controls.
 *
 * Both halves call `hasSectionAccess` from the shared package. These specs are
 * what would catch the two drifting apart.
 */
import { expect, test } from '@playwright/test';

import { seedPendingBooking } from './helpers/backend';
import { actionsFor, gotoConsole, rowFor } from './helpers/locators';
import { storageStatePath } from './roles';

/** Sidebar entries that exist for a superuser; an operator sees a subset. */
const ALL_NAV_LABELS = [
  'Dashboard',
  'Bookings',
  'Users',
  'Promo Codes',
  'Campaigns',
  'Marketplace',
  'Nanny Skills',
  'Certifications',
  'Packages',
  'Care Points',
  'Pricing & Fees',
  'Cameras',
  'Booking Options',
];

function nav(page: import('@playwright/test').Page, label: string) {
  return page.getByRole('navigation').getByRole('link', { name: label, exact: true });
}

test.describe('operator with bookings:MANAGE and users:VIEW', () => {
  test.use({ storageState: storageStatePath('mixedOperator') });

  test('shows only the granted sections in the sidebar', async ({ page }) => {
    await gotoConsole(page, '/bookings');
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();

    // Both granted sections are reachable — VIEW is enough to appear.
    await expect(nav(page, 'Bookings')).toBeVisible();
    await expect(nav(page, 'Users')).toBeVisible();

    // Everything else is gone, not merely disabled.
    for (const label of ALL_NAV_LABELS.filter((l) => l !== 'Bookings' && l !== 'Users')) {
      await expect(nav(page, label)).toHaveCount(0);
    }

    // Team is superuser-only and carries no section at all.
    await expect(nav(page, 'Team')).toHaveCount(0);
  });

  test('redirects a hand-typed URL for a forbidden section', async ({ page }) => {
    // Hiding a link is presentation; this is the part that actually enforces it.
    await gotoConsole(page, '/promo-codes');

    await expect(page).not.toHaveURL(/\/promo-codes/);
    await expect(page.getByRole('heading', { name: 'Promo Codes' })).toHaveCount(0);
    // Sent to the first section they *can* open rather than a dead end.
    await expect(page).toHaveURL(/\/bookings/);
  });

  test('renders a MANAGE section with its write controls', async ({ page }) => {
    const booking = await seedPendingBooking();

    await gotoConsole(page, '/bookings');

    await expect(rowFor(page, booking.mother.surname)).toBeVisible();
    await expect(actionsFor(page, booking.mother.surname)).toBeVisible();
  });

  test('renders a VIEW section read-only', async ({ page }) => {
    // Seeded so the list has a row to render write controls *for* — asserting
    // their absence against an empty table would pass for the wrong reason.
    const booking = await seedPendingBooking();

    await gotoConsole(page, '/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

    // Wait for real content before asserting a negative: `toHaveCount(0)` is
    // satisfied by a table that simply has not loaded yet.
    await expect(rowFor(page, booking.mother.surname)).toBeVisible();

    // The mother is listed, but nothing that writes is offered.
    await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
  });

  test('cannot reach the superuser-only team page', async ({ page }) => {
    await gotoConsole(page, '/admins');

    await expect(page.getByRole('heading', { name: 'Team' })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admins/);
  });
});

test.describe('operator with a single section', () => {
  test.use({ storageState: storageStatePath('bookingsOperator') });

  test('lands on its only section rather than the dashboard', async ({ page }) => {
    // The dashboard is not granted, so "/" has to send them somewhere useful.
    await gotoConsole(page, '/');

    await expect(page).toHaveURL(/\/bookings/);
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  });

  test('hides even the sections a wider operator can see', async ({ page }) => {
    await gotoConsole(page, '/bookings');

    await expect(nav(page, 'Bookings')).toBeVisible();
    await expect(nav(page, 'Users')).toHaveCount(0);
    await expect(nav(page, 'Dashboard')).toHaveCount(0);
  });
});

test.describe('superuser', () => {
  test.use({ storageState: storageStatePath('superuser') });

  test('sees every section and the team page', async ({ page }) => {
    await gotoConsole(page, '/');

    for (const label of ALL_NAV_LABELS) {
      await expect(nav(page, label)).toBeVisible();
    }
    await expect(nav(page, 'Team')).toBeVisible();

    await gotoConsole(page, '/admins');
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
  });
});
