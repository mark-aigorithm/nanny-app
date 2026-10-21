/**
 * App Releases is the Certifications-style table over recorded mobile builds.
 * Pinned here: newest version first by semver (1.10.0 above 1.9.0), creating
 * a mandatory release asks, inline, that the build is live, and the payload is right.
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
    expect(await screen.findByText(/never prompts to update until you add one/i)).toBeInTheDocument();
    expect(screen.getAllByText(/never asks anyone to update/i)).toHaveLength(2);
  });

  it('shows each platform\'s latest and minimum release, and what users on older versions see', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () =>
        ok([
          release({ id: 1, version: '1.9.0', mandatory: true }),
          release({ id: 2, version: '1.10.0' }),
          release({ id: 3, version: '1.2.0', platform: 'android' }),
        ]),
      ),
    );
    renderPage();
    const ios = (await screen.findByRole('heading', { name: 'iOS' })).closest('.card') as HTMLElement;
    expect(within(ios).getByText('1.10.0')).toBeInTheDocument();
    expect(within(ios).getByText('1.9.0')).toBeInTheDocument();
    expect(
      within(ios).getByText('Below 1.9.0: blocked until they update. Below 1.10.0: a prompt they can dismiss.'),
    ).toBeInTheDocument();
    const android = screen.getByRole('heading', { name: 'Android' }).closest('.card') as HTMLElement;
    expect(within(android).getByText('None')).toBeInTheDocument();
    expect(within(android).getByText('Below 1.2.0: a prompt they can dismiss. Nobody is blocked.')).toBeInTheDocument();

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Latest')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Minimum')).toBeInTheDocument();
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
    const rows = within(await screen.findByRole('table')).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('1.10.0')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Mandatory')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('1.9.0')).toBeInTheDocument();
  });

  it('warns, in the form itself, that a mandatory release needs the build live in the store', async () => {
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
    await userEvent.click(screen.getByLabelText(/mandatory update/i));

    expect(screen.getByText(/only once this build is live on the iOS store/)).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Add mandatory release' }));

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

  it('names the Mandatory switch once, by what it controls, whatever its state', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () => ok([])),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add release/i }));
    const toggle = screen.getByRole('checkbox', { name: 'Mandatory update' });
    expect(toggle).toHaveAccessibleDescription(/prompt they can dismiss/i);
    await userEvent.click(toggle);
    expect(screen.getByRole('checkbox', { name: 'Mandatory update' })).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/blocked until they update/i);
    // The hint is no longer part of a label, so "Version" finds only the version field.
    expect(screen.getAllByLabelText(/version/i)).toHaveLength(1);
  });

  it('follows the table contract: an ID column and sortable headers, version by semver', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () =>
        ok([
          release({ id: 7, version: '1.9.0' }),
          release({ id: 8, version: '1.10.0', mandatory: true }),
          release({ id: 9, version: '1.2.0', platform: 'android' }),
        ]),
      ),
    );
    renderPage();
    const table = await screen.findByRole('table');
    expect(screen.getByRole('columnheader', { name: 'ID' })).toBeInTheDocument();
    // A deliberate setting, not an error: warning tone, not danger.
    expect(within(table).getByText('Mandatory', { selector: '.badge' })).toHaveClass('badge--warning');

    await userEvent.click(screen.getByRole('button', { name: /^version/i }));
    const versions = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[2]?.textContent?.match(/^[\d.]+/)?.[0]);
    // Newest first on the first click, by semver: 1.10.0 above 1.9.0.
    expect(versions()).toEqual(['1.10.0', '1.9.0', '1.2.0']);
    await userEvent.click(screen.getByRole('button', { name: /^version/i }));
    expect(versions()).toEqual(['1.2.0', '1.9.0', '1.10.0']);
  });
});
