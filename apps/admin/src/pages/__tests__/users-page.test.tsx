/**
 * The Users page's open tab lives in the URL, so a detail page's "Back to
 * nannies" link (/users?tab=nannies) lands on the Nannies tab, not Mommies.
 * Groups opens from its header ("Manage groups"), not from the sidebar.
 */
import type { AdminUser } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PermissionsProvider } from '@admin/lib/permissions';
import { UsersPage } from '@admin/pages/users-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const emptyPage = () =>
  HttpResponse.json({
    data: [],
    error: null,
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};
/** Sees Users, but not Groups. */
const USERS_ONLY: AdminUser = { ...ADMIN, id: 2, role: 'OPERATOR', permissions: { users: 'VIEW' } };

function Location() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

function renderAt(url: string, me: AdminUser = ADMIN) {
  server.use(
    http.get('/api/admin/me', () => HttpResponse.json({ data: me, error: null })),
    http.get('/api/admin/nannies', emptyPage),
    http.get('/api/admin/mothers', emptyPage),
  );
  return renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <PermissionsProvider>
        <Routes>
          <Route path="/groups" element={<p>Groups page</p>} />
          <Route
            path="/users"
            element={
              <>
                <UsersPage />
                <Location />
              </>
            }
          />
        </Routes>
      </PermissionsProvider>
    </MemoryRouter>,
  );
}

describe('UsersPage tabs', () => {
  it('opens the tab named in the URL', async () => {
    renderAt('/users?tab=nannies');

    expect(await screen.findByRole('tab', { name: 'Nannies' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Mommies' })).toHaveAttribute('aria-selected', 'false');
  });

  it('falls back to Mommies without a tab, or with one it does not know', async () => {
    renderAt('/users?tab=nope');

    expect(await screen.findByRole('tab', { name: 'Mommies' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('writes the chosen tab back to the URL', async () => {
    renderAt('/users');

    await userEvent.click(await screen.findByRole('tab', { name: 'Nannies' }));

    expect(screen.getByRole('tab', { name: 'Nannies' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('location')).toHaveTextContent('/users?tab=nannies');
  });

  it('opens Groups from "Manage groups"', async () => {
    renderAt('/users');

    await userEvent.click(await screen.findByRole('button', { name: 'Manage groups' }));

    expect(screen.getByText('Groups page')).toBeInTheDocument();
  });

  it('hides "Manage groups" from an operator without the Groups section', async () => {
    renderAt('/users', USERS_ONLY);

    expect(await screen.findByRole('tab', { name: 'Mommies' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage groups' })).not.toBeInTheDocument();
  });
});
