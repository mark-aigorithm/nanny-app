/**
 * A draft survey opens as its preview, as mothers will see it: Edit (?edit=1)
 * opens the editor, Publish (?publish=1) asks who gets it, and Duplicate and
 * Delete sit in its menu. A view-only operator gets the preview only.
 */
import type { AdminSurvey } from '@nanny-app/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { SurveyPage } from '@admin/pages/survey-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const ADMIN = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const VIEWER = { ...ADMIN, id: 2, role: 'OPERATOR', permissions: { surveys: 'VIEW' } };
const DRAFT: AdminSurvey = {
  id: 3, title: 'Care feedback', status: 'DRAFT',
  counts: { recipients: 0, answered: 0, skipped: 0, pending: 0 },
  publishedAt: null, closedAt: null, createdAt: '2026-10-19T00:00:00.000Z',
  questions: [
    {
      id: 1, order: 0, type: 'SINGLE_CHOICE', prompt: 'How was your nanny?', required: true,
      options: [{ id: 1, order: 0, label: 'Great' }, { id: 2, order: 1, label: 'Fine' }],
    },
    { id: 2, order: 1, type: 'TEXT', prompt: 'Anything else?', required: false, options: [] },
  ],
};

let survey: AdminSurvey = DRAFT;
beforeEach(() => {
  survey = DRAFT;
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    http.get('/api/admin/surveys/3', () => ok(survey)),
    http.get('/api/admin/groups', () => ok([])),
    http.get('/api/admin/mother-picker', () =>
      HttpResponse.json({ data: [], error: null, meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    ),
  );
});

function renderPage(url = '/surveys/3', me: unknown = ADMIN) {
  server.use(http.get('/api/admin/me', () => ok(me)));
  const router = createMemoryRouter(
    [
      { path: '/surveys/:id', element: <SurveyPage /> },
      { path: '/surveys/:id/publish', element: <p>Publish page</p> },
      { path: '/surveys', element: <p>Survey list</p> },
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

describe('A draft survey', () => {
  it('opens as its preview; Edit opens the editor, and Cancel comes back', async () => {
    renderPage();
    const preview = await screen.findByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('How was your nanny?')).toBeInTheDocument();
    expect(within(preview).getByText('Great')).toBeInTheDocument();
    expect(within(preview).getByText('Optional')).toBeInTheDocument();
    expect(within(preview).getByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Survey title')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByLabelText('Survey title')).toHaveValue('Care feedback');
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Survey title')).not.toBeInTheDocument();
  });

  it('opens the publish page when Publish is pressed', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Publish page')).toBeInTheDocument();
  });

  it('keeps Publish off while the draft has no questions, and says why', async () => {
    survey = { ...DRAFT, questions: [] };
    renderPage();
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByText('Add at least one question to publish.')).toBeInTheDocument();
  });

  it('deletes the draft from its menu after confirmation, and returns to the list', async () => {
    let deleted = false;
    server.use(
      http.delete('/api/admin/surveys/3', () => {
        deleted = true;
        return ok(null);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for this draft' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete draft' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete draft' }));
    expect(await screen.findByText('Survey list')).toBeInTheDocument();
    expect(deleted).toBe(true);
  });

  it('shows a view-only operator the preview only, even at ?edit=1', async () => {
    renderPage('/surveys/3?edit=1', VIEWER);
    expect(await screen.findByRole('complementary', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Survey title')).not.toBeInTheDocument();
    for (const name of ['Edit', 'Publish', 'More actions for this draft']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

});
