/** The Groups page lists groups with their member counts and creates new ones. */
import type { AdminUser, UserGroup } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { GroupsPage } from '@admin/pages/groups-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const BETA: UserGroup = { id: 9, name: 'Beta', description: null, kind: 'STATIC', rules: null, memberCount: 12, createdAt: '2026-10-19T10:00:00.000Z' };

function renderPage() {
  server.use(http.get('/api/admin/me', () => ok(ADMIN)));
  return renderWithProviders(
    <MemoryRouter initialEntries={['/groups']}>
      <ToastProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/groups/:id" element={<p>group open</p>} />
          </Routes>
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('GroupsPage', () => {
  it('lists groups with their member counts', async () => {
    server.use(http.get('/api/admin/groups', () => ok([BETA])));
    renderPage();
    expect(await screen.findByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('creates a group and opens it', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/groups', () => ok([])),
      http.post('/api/admin/groups', async ({ request }) => {
        body = await request.json();
        return ok({ ...BETA, memberCount: 0 });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new group/i }));
    await userEvent.type(screen.getByLabelText('Name'), 'Beta');
    await userEvent.click(screen.getByRole('button', { name: /create group/i }));
    await waitFor(() => expect(body).toEqual({ name: 'Beta', description: '' }));
    expect(await screen.findByText('group open')).toBeInTheDocument();
  });
});
