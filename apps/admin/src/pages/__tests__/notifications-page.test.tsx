/**
 * The Notifications page lists every template with its channel, link and
 * audience. "New template" opens a blank editor, a row's Publish opens the
 * template with its publish confirmation, and Delete asks first.
 */
import type { AdminUser, NotificationTemplateListItem } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { NotificationsPage } from '@admin/pages/notifications-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const VIEWER: AdminUser = { ...ADMIN, role: 'OPERATOR', permissions: { notifications: 'VIEW' } };

const WINBACK: NotificationTemplateListItem = {
  id: 4,
  name: 'Win-back 30d',
  title: 'We miss you',
  channel: 'BOTH',
  targetType: 'PROMO_CODE',
  linkLabel: 'SAVE20',
  audienceSummary: '2 groups',
  publishCount: 3,
  lastPublishedAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T09:00:00.000Z',
};
const WELCOME: NotificationTemplateListItem = {
  id: 5,
  name: 'Welcome',
  title: 'Welcome to NannyNow',
  channel: 'IN_APP',
  targetType: null,
  linkLabel: null,
  audienceSummary: '37 mothers',
  publishCount: 0,
  lastPublishedAt: null,
  updatedAt: '2026-10-20T09:00:00.000Z',
};

function Location() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

function renderPage(me: AdminUser = ADMIN) {
  server.use(http.get('/api/admin/me', () => ok(me)));
  return renderWithProviders(
    <MemoryRouter initialEntries={['/notifications']}>
      <ToastProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/notifications/:id" element={<Location />} />
          </Routes>
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('NotificationsPage', () => {
  it('lists templates with channel, link, audience and how often each was sent', async () => {
    server.use(http.get('/api/admin/notification-templates', () => ok([WINBACK, WELCOME])));
    renderPage();

    const winback = await rowOf('Win-back 30d');
    expect(within(winback).getByText('In-app + push')).toBeInTheDocument();
    // No Title or Link columns: those are on the template's own page.
    expect(within(winback).queryByText('SAVE20')).not.toBeInTheDocument();
    expect(within(winback).getByText('2 groups')).toBeInTheDocument();
    // The count's own cell: the row's "Times sent" column, not any cell that happens to say "3".
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const sentColumn = headers.findIndex((h) => h.includes('Times sent'));
    expect(sentColumn).toBeGreaterThanOrEqual(0);
    expect(within(winback).getAllByRole('cell')[sentColumn]).toHaveTextContent(/^3$/);

    const welcome = await rowOf('Welcome');
    expect(within(welcome).getByText('In-app')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /audience count/i })).toBeInTheDocument();
    expect(within(welcome).getByText(/^37$/)).toBeInTheDocument();
    expect(within(welcome).getByText('Never')).toBeInTheDocument();
  });

  it('lists the most recently updated template first, as the API does (not by id)', async () => {
    // The newer id was edited longest ago, so id order and updatedAt order disagree.
    const edited: NotificationTemplateListItem = { ...WELCOME, id: 9, name: 'Edited today' };
    const stale: NotificationTemplateListItem = {
      ...WINBACK,
      id: 8,
      name: 'Edited last week',
      updatedAt: '2026-10-10T09:00:00.000Z',
    };
    const newerIdOlderEdit: NotificationTemplateListItem = {
      ...stale,
      id: 10,
      name: 'Newest id, oldest edit',
      updatedAt: '2026-09-01T09:00:00.000Z',
    };
    server.use(
      http.get('/api/admin/notification-templates', () => ok([newerIdOlderEdit, stale, edited])),
    );
    renderPage();
    const first = await rowOf('Edited today');
    const second = await rowOf('Edited last week');
    const third = await rowOf('Newest id, oldest edit');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens a blank editor from "New template"', async () => {
    server.use(http.get('/api/admin/notification-templates', () => ok([])));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new template/i }));
    expect(await screen.findByRole('status', { name: 'location' })).toHaveTextContent(
      '/notifications/new',
    );
  });

  it("opens a row's template with its publish confirmation", async () => {
    server.use(http.get('/api/admin/notification-templates', () => ok([WINBACK])));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Win-back 30d' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Publish' }));
    expect(await screen.findByRole('status', { name: 'location' })).toHaveTextContent(
      '/notifications/4?publish=1',
    );
  });

  it('deletes a template only after confirming', async () => {
    let deleted = false;
    server.use(
      http.get('/api/admin/notification-templates', () => ok(deleted ? [] : [WINBACK])),
      http.delete('/api/admin/notification-templates/4', () => {
        deleted = true;
        return ok(null);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Win-back 30d' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(deleted).toBe(false);
    const confirm = screen.getByRole('dialog', { name: 'Delete this template?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete template' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByText('Template deleted')).toBeInTheDocument();
  });

  it('shows the list to a view-only operator without any write controls', async () => {
    server.use(http.get('/api/admin/notification-templates', () => ok([WINBACK])));
    renderPage(VIEWER);
    expect(await screen.findByText('Win-back 30d')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new template/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Win-back 30d' })).toBeDisabled();
  });
});
