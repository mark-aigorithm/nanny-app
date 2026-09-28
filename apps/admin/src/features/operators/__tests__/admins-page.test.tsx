/**
 * The Team page follows the console's table-page layout: "Add team member" in
 * the header opens the one form dialog, a row's kebab opens the same dialog to
 * edit, and the columns sort in the browser.
 */
import type { AdminUser } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { AdminsPage } from '@admin/pages/admins-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

// In the API's order: oldest first.
const TEAM: AdminUser[] = [
  {
    id: 1,
    name: 'Root',
    email: 'root@test.local',
    role: 'SUPERUSER',
    permissions: {},
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Zeina Operator',
    email: 'zeina@test.local',
    role: 'OPERATOR',
    permissions: { bookings: 'MANAGE' },
    isActive: true,
    createdAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 3,
    name: 'Adam Admin',
    email: 'adam@test.local',
    role: 'ADMIN',
    permissions: {},
    isActive: true,
    createdAt: '2026-03-01T00:00:00.000Z',
  },
];

function renderPage() {
  server.use(http.get('/api/admin/admins', () => ok(TEAM)));
  return renderWithProviders(
    <ToastProvider>
      <AdminsPage />
    </ToastProvider>,
  );
}

/** The names in the table, top to bottom. */
function names(): string[] {
  const rows = screen.getAllByRole('row').slice(1);
  // Cell 0 is the ID column every table opens with; the name comes next.
  return rows.map((row) => within(row).getAllByRole('cell')[1]!.textContent ?? '');
}

describe('AdminsPage', () => {
  it('lists the team oldest first, and sorts by a column when its header is clicked', async () => {
    renderPage();

    await screen.findByText('Zeina Operator');
    expect(names()).toEqual(['Root', 'Zeina Operator', 'Adam Admin']);

    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(names()).toEqual(['Adam Admin', 'Root', 'Zeina Operator']);

    // Dates sort newest first on the first click.
    await userEvent.click(screen.getByRole('button', { name: 'Created' }));
    expect(names()).toEqual(['Adam Admin', 'Zeina Operator', 'Root']);
  });

  it('keeps the superuser row out of reach', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'Actions for Root' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Actions for Zeina Operator' })).toBeEnabled();
  });

  it('shows validation in the dialog rather than creating an operator with no access', async () => {
    const created = vi.fn();
    server.use(
      http.post('/api/admin/admins', () => {
        created();
        return ok(TEAM[1]);
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Add team member' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nour Hassan');
    await userEvent.type(within(dialog).getByLabelText(/^Email/), 'nour@test.local');
    await userEvent.type(within(dialog).getByLabelText(/^Password/), 'long-enough-1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add team member' }));

    expect(
      await within(dialog).findByText(/Give the operator access to at least one section/),
    ).toBeInTheDocument();
    expect(created).not.toHaveBeenCalled();
  });

  it('edits an operator in the same dialog, from the row menu', async () => {
    const saved = vi.fn();
    server.use(
      http.patch('/api/admin/admins/:id', async ({ params, request }) => {
        saved({ id: params['id'], body: await request.json() });
        return ok(TEAM[1]);
      }),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Zeina Operator' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Zeina Operator');
    // The role is fixed once created, so editing shows no email/password/role.
    expect(within(dialog).queryByLabelText(/^Email/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(saved.mock.calls[0]![0]).toMatchObject({
      id: '2',
      body: { name: 'Zeina Operator', permissions: { bookings: 'MANAGE' } },
    });
  });
});
