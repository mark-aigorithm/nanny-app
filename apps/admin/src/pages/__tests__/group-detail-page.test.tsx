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
const GROUP: UserGroup = { id: 5, name: 'Beta', description: null, kind: 'STATIC', rules: null, memberCount: 0, createdAt: '2026-10-19T00:00:00.000Z' };
const AMY: MotherPickerRow = {
  id: 11, name: 'Amy', phone: null, completedBookings: 2, hoursBooked: 8, totalSpent: 400,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null, lastAppOpenAt: null,
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

  // Current members aren't offered, so the button counts only new mothers
  // and agrees with the toast.
  it('lists only mothers who are not members yet, so the counts agree', async () => {
    const BEA: MotherPickerRow = { ...AMY, id: 12, name: 'Bea' };
    const excluded: (string | null)[] = [];
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/groups/5', () => ok({ ...GROUP, memberCount: 1 })),
      http.get('/api/admin/mother-picker', ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get('groupId')) return picker([AMY]);
        excluded.push(params.get('excludeGroupId'));
        // Amy is already a member: the server leaves her out of the add picker.
        return picker(params.get('excludeGroupId') === '5' ? [BEA] : [AMY, BEA]);
      }),
      http.post('/api/admin/groups/5/members', () => ok({ ...GROUP, memberCount: 2 })),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /add mothers/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Select Bea' }));
    expect(within(dialog).queryByRole('checkbox', { name: 'Select Amy' })).not.toBeInTheDocument();
    expect(excluded).toContain('5');
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 mother' }));
    expect(await screen.findByText('Added 1 mother')).toBeInTheDocument();
  });

  it('confirms before removing ticked members, with the bar there from the start', async () => {
    let removed: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/groups/5', () => ok({ ...GROUP, memberCount: 1 })),
      http.get('/api/admin/mother-picker', () => picker([AMY])),
      http.delete('/api/admin/groups/5/members', async ({ request }) => {
        removed = await request.json();
        return ok({ ...GROUP, memberCount: 0 });
      }),
    );
    renderPage();

    // Always rendered (disabled at 0), so the first tick doesn't shift the table.
    const removeButton = await screen.findByRole('button', { name: 'Remove from group' });
    expect(removeButton).toBeDisabled();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove 1 from group' }));
    expect(removed).toBeUndefined();
    const confirm = screen.getByRole('dialog', { name: 'Remove 1 mother from this group?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removed).toEqual({ userIds: [11] }));
  });

  it('asks before Escape throws away the mothers ticked in Add mothers', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/groups/5', () => ok(GROUP)),
      http.get('/api/admin/mother-picker', ({ request }) =>
        picker(new URL(request.url).searchParams.get('groupId') ? [] : [AMY]),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add mothers/i }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Discard your selection?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
