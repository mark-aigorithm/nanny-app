/**
 * The editor's non-map behaviour: Find fills the outline from the lookup, a
 * lookup with no result says to draw by hand, the coverage count follows the
 * outline, and Save sends a closed polygon with its source. The map itself is
 * Google's and is replaced by a stub that reports what it was given.
 */
import type { AdminUser, MotherPin, Polygon, ServiceAreaLookup } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { ServiceAreaFormModal } from '@admin/features/service-areas/service-area-form';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

vi.mock('@admin/lib/maps', () => ({ isMapsAvailable: () => true, mapsApiKey: () => 'test' }));
vi.mock('@admin/features/service-areas/area-map', () => ({
  AreaMap: ({ polygon }: { polygon: Polygon | null }) => (
    <div data-testid="area-map">
      {polygon ? `${polygon.coordinates[0]!.length - 1} corners` : 'no outline'}
    </div>
  ),
}));

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const SQUARE: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [31.4, 30.0],
      [31.5, 30.0],
      [31.5, 30.1],
      [31.4, 30.1],
      [31.4, 30.0],
    ],
  ],
};
const PINS: MotherPin[] = [
  { latitude: 30.05, longitude: 31.45 }, // inside
  { latitude: 30.0444, longitude: 31.2357 }, // downtown, outside
];

function renderForm() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <ServiceAreaFormModal onClose={() => {}} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

describe('ServiceAreaFormModal', () => {
  it('fills the outline from a lookup and counts mothers inside', async () => {
    const found: ServiceAreaLookup = {
      displayName: 'New Cairo, Cairo',
      polygon: SQUARE,
      source: 'osm',
    };
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)),
      http.get('/api/admin/service-areas/lookup', () => ok(found)),
    );
    renderForm();
    await userEvent.type(await screen.findByLabelText(/area name/i), 'New Cairo');
    await userEvent.click(screen.getByRole('button', { name: /find on map/i }));
    expect(await screen.findByText('4 corners')).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 mothers’ addresses are inside/i)).toBeInTheDocument();
    expect(screen.getByText(/check the border before saving/i)).toBeInTheDocument();
  });

  it('says to draw by hand when the lookup finds nothing', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)),
      http.get('/api/admin/service-areas/lookup', () =>
        HttpResponse.json(
          {
            data: null,
            error: 'Nothing called “Atlantis” was found on the map. Draw the area by hand.',
          },
          { status: 404 },
        ),
      ),
    );
    renderForm();
    await userEvent.type(await screen.findByLabelText(/area name/i), 'Atlantis');
    await userEvent.click(screen.getByRole('button', { name: /find on map/i }));
    expect(await screen.findByText(/draw the area by hand/i)).toBeInTheDocument();
  });

  it('saves the name, the closed polygon and where it came from', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)),
      http.get('/api/admin/service-areas/lookup', () =>
        ok({ displayName: 'New Cairo', polygon: SQUARE, source: 'osm' }),
      ),
      http.post('/api/admin/service-areas', async ({ request }) => {
        body = await request.json();
        return ok({
          id: 1,
          name: 'New Cairo',
          polygon: SQUARE,
          isActive: true,
          source: 'osm',
          updatedAt: '',
        });
      }),
    );
    renderForm();
    await userEvent.type(await screen.findByLabelText(/area name/i), 'New Cairo');
    await userEvent.click(screen.getByRole('button', { name: /find on map/i }));
    await screen.findByText('4 corners');
    await userEvent.click(screen.getByRole('button', { name: /add area/i }));
    await waitFor(() =>
      expect(body).toEqual({ name: 'New Cairo', polygon: SQUARE, source: 'osm', isActive: false }),
    );
  });

  it('saves an area as active when Active is chosen before saving', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)),
      http.get('/api/admin/service-areas/lookup', () =>
        ok({ displayName: 'New Cairo', polygon: SQUARE, source: 'osm' }),
      ),
      http.post('/api/admin/service-areas', async ({ request }) => {
        body = await request.json();
        return ok({
          id: 1,
          name: 'New Cairo',
          polygon: SQUARE,
          isActive: true,
          source: 'osm',
          updatedAt: '',
        });
      }),
    );
    renderForm();
    await userEvent.type(await screen.findByLabelText(/area name/i), 'New Cairo');
    await userEvent.click(screen.getByRole('button', { name: /find on map/i }));
    await screen.findByText('4 corners');
    await userEvent.click(screen.getByRole('button', { name: /inactive/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Active' }));
    await userEvent.click(screen.getByRole('button', { name: /add area/i }));
    await waitFor(() =>
      expect(body).toEqual({ name: 'New Cairo', polygon: SQUARE, source: 'osm', isActive: true }),
    );
  });

  it('will not save without an outline', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/service-areas/mother-pins', () => ok(PINS)),
    );
    renderForm();
    await userEvent.type(await screen.findByLabelText(/area name/i), 'New Cairo');
    expect(screen.getByRole('button', { name: /add area/i })).toBeDisabled();
  });
});
