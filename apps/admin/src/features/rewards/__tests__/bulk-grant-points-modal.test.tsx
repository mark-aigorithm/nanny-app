/**
 * Granting the same Care Points to many mothers: pick groups (or mothers),
 * an amount and a reason, see the notification they'll get, confirm against
 * the live count, and the grant goes out with the reason. Only a Care Points
 * manager gets the button.
 */
import type { AdminUser, UserGroup } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { RewardWalletsTab } from '@admin/features/rewards/reward-wallets-tab';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const VIEWER: AdminUser = { ...ADMIN, id: 2, role: 'OPERATOR', permissions: { rewards: 'VIEW' } };

const BETA: UserGroup = {
  id: 9, name: 'Beta testers', description: null, kind: 'STATIC', rules: null,
  memberCount: 12, createdAt: '2026-10-01T00:00:00.000Z',
};

function useHandlers(me: AdminUser, onGrant: (body: unknown) => void = () => {}) {
  server.use(
    http.get('/api/admin/me', () => ok(me)),
    http.get('/api/admin/rewards/wallets', () =>
      HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 }, error: null }),
    ),
    http.get('/api/admin/groups', () => ok([BETA])),
    http.post('/api/admin/rewards/bulk-grant/audience-preview', () => ok({ mothers: 12, withPushDevice: 9 })),
    http.post('/api/admin/rewards/bulk-grant', async ({ request }) => {
      onGrant(await request.json());
      return ok({ granted: 12, points: 50, skippedGroupIds: [], pushSent: 9, pushFailed: 0 });
    }),
  );
}

function renderTab() {
  renderWithProviders(
    <PermissionsProvider>
      <ToastProvider>
        <RewardWalletsTab />
      </ToastProvider>
    </PermissionsProvider>,
  );
}

describe('BulkGrantPointsModal', () => {
  it('grants the same points to a group, with the reason the mothers will read', async () => {
    let body: unknown;
    useHandlers(ADMIN, (b) => {
      body = b;
    });
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Grant to a group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Grant Care Points to a group' });
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Beta testers/ }));
    expect(await within(dialog).findByText('12 mothers · 9 with push enabled')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Points for each mother/), '50');
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Sorry for the outage');

    // The notification, as each mother will read it.
    expect(within(dialog).getByText("You've been given 50 Care Points: Sorry for the outage")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Grant points…' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Grant to 12 mothers' }));

    await waitFor(() =>
      expect(body).toEqual({
        audience: { type: 'GROUPS', groupIds: [9] },
        points: 50,
        reason: 'Sorry for the outage',
      }),
    );
    expect(await screen.findByText('Granted 50 Care Points to 12 mothers.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Grant Care Points to a group' })).not.toBeInTheDocument();
  });

  it('asks for an audience, a positive amount and a reason before confirming', async () => {
    let granted = false;
    useHandlers(ADMIN, () => {
      granted = true;
    });
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Grant to a group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Grant Care Points to a group' });
    const submit = within(dialog).getByRole('button', { name: 'Grant points…' });

    await userEvent.click(submit);
    expect(within(dialog).getByText('Choose at least one group or mother.')).toBeInTheDocument();

    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Beta testers/ }));
    await userEvent.type(within(dialog).getByLabelText(/Points for each mother/), '-5');
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Oops');
    await userEvent.click(submit);
    expect(within(dialog).getByText('Points must be more than zero')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText(/Points for each mother/));
    await userEvent.type(within(dialog).getByLabelText(/Points for each mother/), '5');
    await userEvent.clear(within(dialog).getByLabelText(/Reason/));
    await userEvent.click(submit);
    expect(within(dialog).getByText('Write a reason for the mothers')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Grant to 12 mothers/ })).not.toBeInTheDocument();
    expect(granted).toBe(false);
  });

  it('is not offered to someone who can only view Care Points', async () => {
    useHandlers(VIEWER);
    renderTab();

    expect(await screen.findByText('No parent wallets yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant to a group' })).not.toBeInTheDocument();
  });
});
