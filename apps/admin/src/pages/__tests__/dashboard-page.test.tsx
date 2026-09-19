/**
 * The dashboard's stat cards are computed client-side from the same list
 * endpoints the Bookings, Users and Promo pages read (there is no stats API).
 * This pins each card to the rows behind it, so a card can't quietly drift
 * from the list page an operator would compare it against.
 */
import type { AdminBooking, AdminNanny, AdminUser, PromoCode } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { DashboardPage } from '@admin/pages/dashboard-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

function paged<T>(data: T[]) {
  return HttpResponse.json({
    data,
    error: null,
    meta: { page: 1, limit: 100, total: data.length, totalPages: 1 },
  });
}

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Only the columns the dashboard reads; the rest of the row is irrelevant to it. */
function booking(status: AdminBooking['status'], totalAmount: number): AdminBooking {
  return {
    id: Math.floor(Math.random() * 1e6),
    status,
    totalAmount,
    createdAt: new Date().toISOString(),
  } as AdminBooking;
}

function nanny(approvalStatus: AdminNanny['approvalStatus']): AdminNanny {
  return { id: Math.floor(Math.random() * 1e6), approvalStatus } as AdminNanny;
}

function promo(isActive: boolean): PromoCode {
  return { id: Math.floor(Math.random() * 1e6), code: `X${isActive}`, isActive } as PromoCode;
}

const BOOKINGS = [
  booking('PENDING', 480),
  booking('CONFIRMED', 480),
  booking('COMPLETED', 600),
  booking('COMPLETED', 432),
  booking('CANCELLED', 480),
];
const NANNIES = [nanny('APPROVED'), nanny('APPROVED'), nanny('APPROVED'), nanny('PENDING_REVIEW'), nanny('REJECTED')];
const PROMOS = [promo(true), promo(true), promo(false)];

function backend() {
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    http.get('/api/admin/bookings', () => paged(BOOKINGS)),
    http.get('/api/admin/nannies', () => paged(NANNIES)),
    http.get('/api/admin/promo-codes', () => ok(PROMOS)),
  );
}

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <DashboardPage />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

/** The value rendered inside the stat card that carries `label`. */
function cardValue(label: string): string {
  const labelNode = screen.getByText(label);
  const card = labelNode.closest('.stat-card');
  if (!card) throw new Error(`No stat card around "${label}"`);
  return card.querySelector('.stat-card-value')?.textContent ?? '';
}

describe('DashboardPage', () => {
  it('derives every stat card from the rows the list pages show', async () => {
    backend();
    renderPage();

    // Wait for the last query to land before reading any card.
    await screen.findByText('Total bookings');
    await screen.findByText(/1,032/);

    expect(cardValue('Total bookings')).toBe('5');
    // One PENDING booking plus one nanny awaiting review.
    expect(cardValue('Awaiting approval')).toBe('2');
    // Only COMPLETED bookings count as revenue.
    expect(cardValue('Revenue (completed)')).toMatch(/^1,032/);
    expect(cardValue('Active nannies')).toBe('3');
    expect(cardValue('Nannies to review')).toBe('1');
    expect(cardValue('Active promo codes')).toBe('2');
  });
});
