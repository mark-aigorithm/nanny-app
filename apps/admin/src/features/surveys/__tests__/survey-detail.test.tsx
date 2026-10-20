/**
 * The header of a published or closed survey: write actions only while they
 * can work (open survey, manage access), and Close asks first.
 */
import type { AdminSurvey } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { SurveyDetail } from '@admin/features/surveys/survey-detail';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const ADMIN = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const VIEWER = { ...ADMIN, role: 'OPERATOR', permissions: { surveys: 'VIEW' } };
const SURVEY: AdminSurvey = {
  id: 3, title: 'Feedback', status: 'PUBLISHED',
  counts: { recipients: 3, answered: 1, skipped: 1, pending: 1 },
  publishedAt: '2026-10-19T00:00:00.000Z', closedAt: null, createdAt: '2026-10-18T00:00:00.000Z', questions: [],
};

function setup(survey: AdminSurvey = SURVEY, me: unknown = ADMIN) {
  const closed: number[] = [];
  server.use(
    http.get('/api/admin/me', () => ok(me)),
    http.get('/api/admin/surveys/3/results', () => ok({ surveyId: 3, counts: survey.counts, questions: [] })),
    http.post('/api/admin/surveys/3/close', () => {
      closed.push(1);
      return ok({ ...SURVEY, status: 'CLOSED' });
    }),
  );
  renderWithProviders(
    <MemoryRouter>
      <ToastProvider>
        <PermissionsProvider>
          <SurveyDetail survey={survey} />
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return closed;
}

describe('SurveyDetail', () => {
  it('closes only after confirming', async () => {
    const closed = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Close survey' }));
    expect(closed).toEqual([]);
    expect(screen.getByText(/2 mothers who haven’t answered/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Close survey' })[1]!);
    await waitFor(() => expect(closed).toEqual([1]));
  });

  it('hides add and close on a closed survey', async () => {
    setup({ ...SURVEY, status: 'CLOSED' });
    expect(await screen.findByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add recipients' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close survey' })).not.toBeInTheDocument();
  });

  it('hides every write action from a view-only operator', async () => {
    setup(SURVEY, VIEWER);
    expect(await screen.findByRole('tab', { name: 'Results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add recipients' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close survey' })).not.toBeInTheDocument();
  });
});
