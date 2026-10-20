/**
 * The bell counts pending requests that arrived since the admin last marked
 * them read; marking read clears the badge but keeps the queues listed until
 * the requests are handled. Read marks are per admin, in this browser.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotificationBell } from '@admin/components/notification-bell';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const paged = <T,>(data: T[]) =>
  HttpResponse.json({ data, error: null, meta: { page: 1, limit: 50, total: data.length, totalPages: 1 } });
const ADMIN = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};

let nannies: { id: number; createdAt: string }[];
let bookings: { id: number; createdAt: string }[];

beforeEach(() => {
  window.localStorage.clear();
  nannies = [{ id: 1, createdAt: '2026-10-20T10:00:00.000Z' }];
  bookings = [{ id: 7, createdAt: '2026-10-20T09:00:00.000Z' }];
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    http.get('/api/admin/nannies', () => paged(nannies)),
    http.get('/api/admin/bookings', () => paged(bookings)),
  );
});

function renderBell() {
  return renderWithProviders(
    <MemoryRouter>
      <PermissionsProvider>
        <NotificationBell />
      </PermissionsProvider>
    </MemoryRouter>,
  );
}

describe('NotificationBell', () => {
  it('marks everything read: the badge clears, the pending queues stay listed', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 new' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('pending nanny request')).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Mark all as read' }));

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(within(menu).queryByText('1 new')).not.toBeInTheDocument();
    expect(within(menu).getByText('pending booking request')).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('counts a request that arrives after the read mark as new, and remembers the mark', async () => {
    const { unmount } = renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 new' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark all as read' }));
    unmount();

    nannies = [{ id: 2, createdAt: '2026-10-21T08:00:00.000Z' }, ...nannies];
    renderBell();
    expect(await screen.findByRole('button', { name: 'Notifications, 1 new' })).toBeInTheDocument();
  });

  it('opening one queue marks just that queue read', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 new' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /pending booking request/ }));
    expect(await screen.findByRole('button', { name: 'Notifications, 1 new' })).toBeInTheDocument();
  });
});
