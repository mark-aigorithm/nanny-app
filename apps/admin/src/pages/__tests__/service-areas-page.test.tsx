/**
 * Service Areas is the Skills-style table over the areas mothers can book in.
 * Pinned here: the empty state explains that booking is open everywhere, the
 * Active toggle saves a real boolean, delete confirms first, and the page-wide
 * switch saves and says that booking is open everywhere while it is off.
 */
import type { AdminUser, ServiceArea } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { ServiceAreasPage } from '@admin/pages/service-areas-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });

const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};

const NEW_CAIRO: ServiceArea = {
  id: 7,
  name: 'New Cairo',
  isActive: true,
  source: 'osm',
  updatedAt: '2026-10-15T10:00:00.000Z',
  polygon: {
    type: 'Polygon',
    coordinates: [[[31.4, 30.0], [31.5, 30.0], [31.5, 30.1], [31.4, 30.1], [31.4, 30.0]]],
  },
};

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <ServiceAreasPage />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

describe('ServiceAreasPage', () => {
  // The page-wide switch, on unless a test says otherwise.
  beforeEach(() => {
    server.use(http.get('/api/admin/service-areas/settings', () => ok({ enabled: true })));
  });

  it('says booking is open everywhere when there are no areas', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)), http.get('/api/admin/service-areas', () => ok([])));
    renderPage();
    // Said twice on purpose: the summary line above the table and the table's empty state.
    expect(await screen.findAllByText(/mothers can book anywhere/i)).toHaveLength(2);
  });

  it('lists an area with its size and status', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)), http.get('/api/admin/service-areas', () => ok([NEW_CAIRO])));
    renderPage();
    expect(await screen.findByText('New Cairo')).toBeInTheDocument();
    expect(screen.getByText(/10\d\.\d km²/)).toBeInTheDocument();
    expect(screen.getByText(/1 active area/i)).toBeInTheDocument();
  });

  it('deactivates through the action menu, sending a boolean', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas', () => ok([NEW_CAIRO])),
      http.patch('/api/admin/service-areas/7', async ({ request }) => {
        body = await request.json();
        return ok({ ...NEW_CAIRO, isActive: false });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /actions for new cairo/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /deactivate/i }));
    await waitFor(() => expect(body).toEqual({ isActive: false }));
  });

  it('asks before deleting', async () => {
    let deleted = false;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas', () => ok([NEW_CAIRO])),
      http.delete('/api/admin/service-areas/7', () => {
        deleted = true;
        return ok(null);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /actions for new cairo/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(deleted).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /delete area/i }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('switches the limit off from the page, and says booking is open everywhere', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas', () => ok([NEW_CAIRO])),
      http.put('/api/admin/service-areas/settings', async ({ request }) => {
        body = await request.json();
        return ok(body);
      }),
    );
    renderPage();
    const toggle = await screen.findByRole('checkbox', { name: /limit booking to service areas/i });
    await waitFor(() => expect(toggle).toBeChecked());
    expect(screen.getByText(/1 active area/i)).toBeInTheDocument();
    await userEvent.click(toggle);
    await waitFor(() => expect(body).toEqual({ enabled: false }));
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/service areas are switched off/i)).toBeInTheDocument();
  });

  it('shows the switch off when it was saved off', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas', () => ok([NEW_CAIRO])),
      http.get('/api/admin/service-areas/settings', () => ok({ enabled: false })),
    );
    renderPage();
    expect(await screen.findByText(/service areas are switched off/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /limit booking to service areas/i })).not.toBeChecked();
  });
});
