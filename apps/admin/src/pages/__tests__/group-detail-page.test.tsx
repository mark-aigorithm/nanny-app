/** A group's page: its members, and adding mothers from the picker. */
import type { AdminUser, MotherPickerRow, UserGroup } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
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
});
