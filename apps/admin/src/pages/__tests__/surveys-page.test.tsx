/**
 * The Surveys page lists every survey with its response numbers; "New survey"
 * creates an empty draft and opens it.
 */
import type { AdminSurvey, AdminSurveySummary, AdminUser } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
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

  it('creates an empty draft and opens it', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/surveys', () => paged([])),
      http.post('/api/admin/surveys', async ({ request }) => {
        body = await request.json();
        return ok({ ...SURVEY, id: 8, status: 'DRAFT', description: null, questions: [] } satisfies AdminSurvey);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /new survey/i }));
    await waitFor(() => expect(body).toEqual({ title: 'Untitled survey', questions: [] }));
    expect(await screen.findByText('editor open')).toBeInTheDocument();
  });
});
