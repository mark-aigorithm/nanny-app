/**
 * Granting points must show in the table the operator is looking at. The list
 * is cached per sort/page/search, so the grant has to reach every one of those
 * entries — not a bare `['reward-wallets']` key no query ever reads.
 */
import type { AdminUser, RewardWalletSummary } from '@nanny-app/shared';
import { screen, within } from '@testing-library/react';
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

const WALLET: RewardWalletSummary = {
  userId: 32,
  name: 'Mark Essam',
  email: 'mark@example.com',
  avatarUrl: null,
  pointsBalance: 222,
  lifetimeEarned: 322,
  lifetimeRedeemed: 100,
};

describe('RewardWalletsTab', () => {
  it('shows the new balance in the table after a grant', async () => {
    let wallet = WALLET;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/rewards/wallets', () =>
        HttpResponse.json({
          data: [wallet],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
          error: null,
        }),
      ),
      http.post('/api/admin/rewards/wallets/32/grant', () => {
        wallet = { ...wallet, pointsBalance: 322, lifetimeEarned: 422 };
        return ok(wallet);
      }),
    );

    renderWithProviders(
      <PermissionsProvider>
        <ToastProvider>
          <RewardWalletsTab />
        </ToastProvider>
      </PermissionsProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Mark Essam' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Grant / revoke points' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Points/), '100');
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Goodwill');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Grant points' }));

    const row = (await screen.findByText('322 pts')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('422')).toBeInTheDocument();
  });
});
