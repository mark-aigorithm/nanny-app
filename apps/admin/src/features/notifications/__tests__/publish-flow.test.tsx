/**
 * Publishing a saved template from its page: the confirmation re-counts the
 * audience, names it, and can't be sent twice while it runs; the result toast
 * says what went out and warns when part of it didn't. The send history lists
 * every publish. View-only operators see the history, never Publish.
 */
import type { AdminUser } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { NotificationTemplatePage } from '@admin/pages/notification-template-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

import { ADMIN, BROADCAST, TEMPLATE, VIEWER, editorHandlers, ok } from './fixtures';

const PUBLISH = '/api/admin/notification-templates/4/publish';
const CONFIRM_COPY = "Send 'Win-back 30d' to 1,240 mothers (1,031 by push) now? This can't be undone.";

beforeEach(() => {
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    ...editorHandlers,
    http.get('/api/admin/notification-templates/4', () => ok(TEMPLATE)),
  );
});

function renderPage(url = '/notifications/4', me?: AdminUser) {
  if (me) server.use(http.get('/api/admin/me', () => ok(me)));
  const router = createMemoryRouter(
    [
      { path: '/notifications/:id', element: <NotificationTemplatePage /> },
      { path: '/notifications', element: <p>Notification list</p> },
    ],
    { initialEntries: [url] },
  );
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <RouterProvider router={router} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

const openPublish = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Publish…' }));
  return screen.findByRole('dialog', { name: 'Send this notification?' });
};

describe('Publishing a notification template', () => {
  it('confirms with a freshly counted audience, sends once, and reports the counts', async () => {
    let previews = 0;
    let published = 0;
    server.use(
      http.post('/api/admin/notification-templates/audience-preview', () => {
        previews += 1;
        // The group grew between the editor's count and the confirmation.
        return ok(previews === 1 ? { mothers: 1200, withPushDevice: 1000 } : { mothers: 1240, withPushDevice: 1031 });
      }),
      http.post(PUBLISH, () => {
        published += 1;
        return ok(BROADCAST);
      }),
    );
    renderPage();

    expect(await screen.findByText('1,200 mothers · 1,000 with push enabled')).toBeInTheDocument();
    const dialog = await openPublish();
    expect(await within(dialog).findByText(CONFIRM_COPY)).toBeInTheDocument();
    // At least the editor's count plus the dialog's own re-count; never timing-exact.
    await waitFor(() => expect(previews).toBeGreaterThanOrEqual(2));
    expect(published).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send to 1,240 mothers' }));
    expect(await screen.findByText('Sent to 1,240 mothers')).toBeInTheDocument();
    expect(screen.getByText('1,240 in the inbox · 1,031 pushes sent · 209 with no device')).toBeInTheDocument();
    // The toast fires first; the dialog closes when the ?publish=1 navigation lands.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(published).toBe(1);
  });

  it('shows a sending state and locks the dialog while the send runs', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(PUBLISH, async () => {
        await gate;
        return ok(BROADCAST);
      }),
    );
    renderPage();

    const dialog = await openPublish();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send to 1,240 mothers' }));
    expect(within(dialog).getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    release();
    expect(await screen.findByText('Sent to 1,240 mothers')).toBeInTheDocument();
  });

  it('warns when some pushes failed, and notes a deleted group that was skipped', async () => {
    server.use(
      http.post(PUBLISH, () =>
        ok({ ...BROADCAST, status: 'PARTIAL', pushSent: 1019, pushFailed: 12, skippedGroupIds: [9] }),
      ),
    );
    renderPage();

    const dialog = await openPublish();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send to 1,240 mothers' }));
    const title = await screen.findByText('Sent to 1,240 mothers, but 12 pushes failed');
    expect(title.closest('.toast')).toHaveClass('toast--warning');
    expect(screen.getByText(/1 deleted group was skipped/)).toBeInTheDocument();
  });

  it("says pushes couldn't be sent, with the error, when the push phase threw", async () => {
    server.use(
      http.post(PUBLISH, () =>
        ok({ ...BROADCAST, status: 'PARTIAL', pushSent: 0, pushFailed: 0, error: 'FCM is unreachable' }),
      ),
    );
    renderPage();

    const dialog = await openPublish();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send to 1,240 mothers' }));
    const title = await screen.findByText(
      'Sent to the inbox; pushes couldn’t be sent: FCM is unreachable',
    );
    expect(title.closest('.toast')).toHaveClass('toast--warning');
    expect(screen.queryByText(/0 pushes failed/)).toBeNull();
  });

  it("reports a refused publish with the server's reason", async () => {
    server.use(
      http.post(PUBLISH, () => HttpResponse.json({ data: null, error: 'That promo code has expired.' }, { status: 400 })),
    );
    renderPage();

    const dialog = await openPublish();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send to 1,240 mothers' }));
    expect(await screen.findByText('Couldn’t send the notification')).toBeInTheDocument();
    expect(screen.getByText('That promo code has expired.')).toBeInTheDocument();
  });

  it('keeps Publish off while there are unsaved changes', async () => {
    renderPage();
    const publish = await screen.findByRole('button', { name: 'Publish…' });
    expect(publish).toBeEnabled();
    await userEvent.type(screen.getByLabelText('Title'), '!');
    expect(publish).toBeDisabled();
    expect(screen.getByText('Unsaved changes. Save before publishing.')).toBeInTheDocument();
  });

  it("opens the confirmation from the list's Publish (?publish=1), and Cancel closes it", async () => {
    renderPage('/notifications/4?publish=1');
    const dialog = await screen.findByRole('dialog', { name: 'Send this notification?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('lists every send with its status and counts', async () => {
    server.use(
      http.get('/api/admin/notification-templates/4/broadcasts', () =>
        ok([
          BROADCAST,
          {
            ...BROADCAST, id: 32, status: 'FAILED', error: 'Timed out', inAppCreated: 400, pushSent: 0,
            noDevice: 0, createdAt: '2026-10-19T09:00:00.000Z', completedAt: null,
          },
        ]),
      ),
    );
    renderPage();

    const history = await screen.findByRole('table');
    const sent = within(history).getByText('Sent').closest('tr')!;
    expect(within(sent).getByText('Ops Admin')).toBeInTheDocument();
    expect(within(sent).getByText('1,031')).toBeInTheDocument();
    expect(within(sent).getByText('209')).toBeInTheDocument();
    const failed = within(history).getByText('Timed out').closest('tr')!;
    expect(within(failed).getByText('Failed')).toBeInTheDocument();
  });

  it('shows a view-only operator the history but never Publish, even from ?publish=1', async () => {
    renderPage('/notifications/4?publish=1', VIEWER);
    expect(await screen.findByRole('heading', { name: 'Send history' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
