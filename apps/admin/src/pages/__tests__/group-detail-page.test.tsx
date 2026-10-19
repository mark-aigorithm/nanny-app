/** A group's page: its members, and adding mothers from the picker. */
import type { AdminUser, MotherPickerRow, UserGroup } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { GroupDetailPage } from '@admin/pages/group-detail-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const GROUP: UserGroup = { id: 5, name: 'Beta', description: null, memberCount: 0, createdAt: '2026-10-19T00:00:00.000Z' };
const AMY: MotherPickerRow = {
  id: 11, name: 'Amy', phone: null, completedBookings: 2, hoursBooked: 8, totalSpent: 400,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null,
};

function renderPage() {
  renderWithProviders(
    <MemoryRouter initialEntries={['/groups/5']}>
      <ToastProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/groups/:id" element={<GroupDetailPage />} />
          </Routes>
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const picker = (data: MotherPickerRow[]) =>
  HttpResponse.json({ data, error: null, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } });

describe('GroupDetailPage', () => {
  it('adds the ticked mothers to the group', async () => {
    let added: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/groups/5', () => ok(GROUP)),
      http.get('/api/admin/mother-picker', ({ request }) => {
        const inGroup = new URL(request.url).searchParams.get('groupId');
        const data = inGroup ? [] : [AMY];
        return HttpResponse.json({ data, error: null, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } });
      }),
      http.post('/api/admin/groups/5/members', async ({ request }) => {
        added = await request.json();
        return ok({ ...GROUP, memberCount: 1 });
      }),
    );
    renderWithProviders(
      <MemoryRouter initialEntries={['/groups/5']}>
        <ToastProvider>
          <PermissionsProvider>
            <Routes>
              <Route path="/groups/:id" element={<GroupDetailPage />} />
            </Routes>
          </PermissionsProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /add mothers/i }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));
    await userEvent.click(screen.getByRole('button', { name: /add 1 mother/i }));
    await waitFor(() => expect(added).toEqual({ userIds: [11] }));
  });

  // The picker lists current members too and adding is idempotent, so the
  // toast must count what the server actually added, not what was ticked.
  it('reports the mothers actually added, not the ones ticked', async () => {
    const BEA: MotherPickerRow = { ...AMY, id: 12, name: 'Bea' };
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/groups/5', () => ok({ ...GROUP, memberCount: 1 })),
      http.get('/api/admin/mother-picker', ({ request }) =>
        picker(new URL(request.url).searchParams.get('groupId') ? [AMY] : [AMY, BEA]),
      ),
      // Amy was already a member: only Bea is new.
      http.post('/api/admin/groups/5/members', () => ok({ ...GROUP, memberCount: 2 })),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /add mothers/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Select Amy' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Bea' }));
    await userEvent.click(screen.getByRole('button', { name: /add 2 mothers/i }));
    expect(await screen.findByText('Added 1 mother')).toBeInTheDocument();
  });

  // Ticking a row does nothing without MANAGE, so a viewer gets no checkboxes.
  it('shows the member list without selection to a view-only operator', async () => {
    const viewer: AdminUser = { ...ADMIN, role: 'OPERATOR', permissions: { groups: 'VIEW' } };
    server.use(
      http.get('/api/admin/me', () => ok(viewer)),
      http.get('/api/admin/groups/5', () => ok({ ...GROUP, memberCount: 1 })),
      http.get('/api/admin/mother-picker', () => picker([AMY])),
    );
    renderPage();

    expect(await screen.findByText('Amy')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/selected\./)).not.toBeInTheDocument();
  });
});
