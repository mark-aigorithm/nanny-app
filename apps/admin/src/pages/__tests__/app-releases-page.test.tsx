/**
 * App Releases is the Certifications-style table over recorded mobile builds.
 * Pinned here: newest version first by semver (1.10.0 above 1.9.0), creating
 * a mandatory release asks for confirmation first, and the payload is right.
 */
import type { AdminUser, AppRelease } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { AppReleasesPage } from '@admin/pages/app-releases-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });

const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};

const release = (overrides: Partial<AppRelease>): AppRelease => ({
  id: 1, platform: 'ios', version: '1.0.0', mandatory: false, releaseNotes: null,
  createdAt: '2026-10-01T00:00:00.000Z', ...overrides,
});

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <AppReleasesPage />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

describe('AppReleasesPage', () => {
  it('explains the empty state', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)), http.get('/api/admin/app-releases', () => ok([])));
    renderPage();
    expect(await screen.findByText(/no releases recorded/i)).toBeInTheDocument();
  });

  it('lists newest version first by semver, with a Mandatory badge', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () =>
        ok([
          release({ id: 1, version: '1.9.0' }),
          release({ id: 2, version: '1.10.0', mandatory: true }),
        ]),
      ),
    );
    renderPage();
    await screen.findByText('1.10.0');
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('1.10.0')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Mandatory')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('1.9.0')).toBeInTheDocument();
  });

  it('confirms before creating a mandatory release, then sends it', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () => ok([])),
      http.post('/api/admin/app-releases', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: release({ version: '2.0.0', mandatory: true }), error: null }, { status: 201 });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add release/i }));
    await userEvent.type(screen.getByPlaceholderText('1.4.0'), '2.0.0');
    await userEvent.click(screen.getByLabelText(/mandatory/i));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add release$/i }));

    expect(await screen.findByText(/only make this mandatory once/i)).toBeInTheDocument();
    expect(body).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: /make mandatory/i }));

    await waitFor(() =>
      expect(body).toEqual({ platform: 'ios', version: '2.0.0', mandatory: true }),
    );
  });

  it('rejects a version that is not x.y.z without calling the API', async () => {
    let called = false;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () => ok([])),
      http.post('/api/admin/app-releases', () => {
        called = true;
        return ok(release({}));
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add release/i }));
    await userEvent.type(screen.getByPlaceholderText('1.4.0'), '1.4');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add release$/i }));
    expect(await screen.findByText(/version must look like 1\.4\.0/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
