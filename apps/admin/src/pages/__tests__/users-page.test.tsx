/**
 * The Users page's open tab lives in the URL, so a detail page's "Back to
 * nannies" link (/users?tab=nannies) lands on the Nannies tab, not Mommies.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { UsersPage } from '@admin/pages/users-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const emptyPage = () =>
  HttpResponse.json({
    data: [],
    error: null,
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });

function Location() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

function renderAt(url: string) {
  server.use(http.get('/api/admin/nannies', emptyPage), http.get('/api/admin/mothers', emptyPage));
  return renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
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
    </MemoryRouter>,
  );
}

describe('UsersPage tabs', () => {
  it('opens the tab named in the URL', () => {
    renderAt('/users?tab=nannies');

    expect(screen.getByRole('tab', { name: 'Nannies' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Mommies' })).toHaveAttribute('aria-selected', 'false');
  });

  it('falls back to Mommies without a tab, or with one it does not know', () => {
    renderAt('/users?tab=nope');

    expect(screen.getByRole('tab', { name: 'Mommies' })).toHaveAttribute('aria-selected', 'true');
  });

  it('writes the chosen tab back to the URL', async () => {
    renderAt('/users');

    await userEvent.click(screen.getByRole('tab', { name: 'Nannies' }));

    expect(screen.getByRole('tab', { name: 'Nannies' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('location')).toHaveTextContent('/users?tab=nannies');
  });
});
