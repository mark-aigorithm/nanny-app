/**
 * The Surveys page lists every survey with its response numbers; "New survey"
 * creates an empty draft and opens it.
 */
import type { AdminSurveySummary, AdminUser } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { SurveysPage } from '@admin/pages/surveys-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const paged = <T,>(data: T[]) =>
  HttpResponse.json({ data, error: null, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } });

const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};

const SURVEY: AdminSurveySummary = {
  id: 4, title: 'How are we doing?', status: 'PUBLISHED',
  counts: { recipients: 10, answered: 4, skipped: 2, pending: 4 },
  publishedAt: '2026-10-19T10:00:00.000Z', closedAt: null, createdAt: '2026-10-18T10:00:00.000Z',
};

function renderPage() {
  server.use(http.get('/api/admin/me', () => ok(ADMIN)));
  return renderWithProviders(
    <MemoryRouter initialEntries={['/surveys']}>
      <ToastProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/surveys" element={<SurveysPage />} />
            <Route path="/surveys/:id" element={<p>editor open</p>} />
          </Routes>
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('SurveysPage', () => {
  it('lists surveys with status and response rate', async () => {
    server.use(http.get('/api/admin/surveys', () => paged([SURVEY])));
    renderPage();
    expect(await screen.findByText('How are we doing?')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  // Creating on click left an "Untitled survey" behind for every abandoned
  // click; the draft is created on the editor's first Save instead (L8).
  it('opens a blank editor without creating anything', async () => {
    let posted = false;
    server.use(
      http.get('/api/admin/surveys', () => paged([])),
      http.post('/api/admin/surveys', () => {
        posted = true;
        return ok(null);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new survey/i }));
    expect(await screen.findByText('editor open')).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('sorts on the server from any count column header', async () => {
    const queries: Record<string, string>[] = [];
    server.use(
      http.get('/api/admin/surveys', ({ request }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return paged([SURVEY]);
      }),
    );
    renderPage();
    await screen.findByText('How are we doing?');
    expect(queries[0]).toMatchObject({ sortBy: 'createdAt', sortDir: 'desc' });
    for (const header of ['ID', 'Title', 'Status', 'Sent to', 'Answered', 'Skipped', 'No response', 'Response rate', 'Created']) {
      expect(within(screen.getByRole('columnheader', { name: header })).getByRole('button')).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Response rate' }));
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ sortBy: 'responseRate', sortDir: 'desc' }));
  });

  it('closes a published survey from its row menu, after confirming', async () => {
    let closed = false;
    server.use(
      http.get('/api/admin/surveys', () => paged([SURVEY])),
      http.post('/api/admin/surveys/4/close', () => {
        closed = true;
        return ok({ ...SURVEY, status: 'CLOSED', description: null, questions: [] });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for How are we doing?' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Open', 'Duplicate', 'Close survey']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Close survey' }));
    expect(closed).toBe(false);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close survey' }));
    await waitFor(() => expect(closed).toBe(true));
  });

  it('offers Delete draft, not Close, on a draft row', async () => {
    let deleted = false;
    server.use(
      http.get('/api/admin/surveys', () => paged([{ ...SURVEY, id: 5, title: 'Draft one', status: 'DRAFT' as const }])),
      http.delete('/api/admin/surveys/5', () => {
        deleted = true;
        return ok(null);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Draft one' }));
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete draft' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(deleted).toBe(true));
  });
});
