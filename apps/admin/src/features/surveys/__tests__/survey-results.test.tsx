import type { AdminSurvey, SurveyResults as Results } from '@nanny-app/shared';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { SurveyResults } from '@admin/features/surveys/survey-results';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const SURVEY = { id: 3, questions: [] } as unknown as AdminSurvey;
const RESULTS: Results = {
  surveyId: 3,
  counts: { recipients: 4, answered: 2, skipped: 1, pending: 1 },
  questions: [
    { questionId: 1, order: 0, type: 'RATING', prompt: 'Rate us', required: true, answeredCount: 2,
      options: [], yesCount: null, noCount: null, ratingCounts: [0, 1, 0, 0, 1], ratingAverage: 3.5 },
    { questionId: 2, order: 1, type: 'YES_NO', prompt: 'Recommend?', required: true, answeredCount: 2,
      options: [], yesCount: 2, noCount: 0, ratingCounts: null, ratingAverage: null },
    { questionId: 4, order: 3, type: 'SINGLE_CHOICE', prompt: 'How did you hear about us?', required: true, answeredCount: 4,
      options: [
        { optionId: 1, label: 'Instagram', count: 3 },
        { optionId: 2, label: 'A friend or family member recommended it to me', count: 1 },
      ], yesCount: null, noCount: null, ratingCounts: null, ratingAverage: null },
    { questionId: 3, order: 2, type: 'TEXT', prompt: 'Anything else?', required: false, answeredCount: 1,
      options: [], yesCount: null, noCount: null, ratingCounts: null, ratingAverage: null },
  ],
};

describe('SurveyResults', () => {
  it('shows the rating average, yes/no split and text answers with their author', async () => {
    server.use(
      http.get('/api/admin/surveys/3/results', () => HttpResponse.json({ data: RESULTS, error: null })),
      http.get('/api/admin/surveys/3/text-answers', () =>
        HttpResponse.json({
          data: [{ userId: 9, name: 'Amy', text: 'Lovely', answeredAt: '2026-10-19T00:00:00.000Z' }],
          error: null,
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
      ),
    );
    renderWithProviders(<SurveyResults survey={SURVEY} />);
    expect(await screen.findByText('Average 3.5 / 5')).toBeInTheDocument();
    expect(screen.getByText('Yes 2 · No 0')).toBeInTheDocument();
    expect(await screen.findByText('Lovely')).toBeInTheDocument();
    expect(screen.getByText(/^Amy/)).toBeInTheDocument();
  });

  it('prints every bar’s count and share as text, not only in a hover tooltip (H3)', async () => {
    server.use(
      http.get('/api/admin/surveys/3/results', () => HttpResponse.json({ data: RESULTS, error: null })),
      http.get('/api/admin/surveys/3/text-answers', () =>
        HttpResponse.json({ data: [], error: null, meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
      ),
    );
    renderWithProviders(<SurveyResults survey={SURVEY} />);
    const choice = await screen.findByRole('list', { name: 'How did you hear about us?' });
    const rows = within(choice).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Instagram3 · 75%',
      'A friend or family member recommended it to me1 · 25%',
    ]);
    expect(within(screen.getByRole('list', { name: 'Recommend?' })).getAllByRole('listitem')[0]).toHaveTextContent('Yes2 · 100%');
    expect(within(screen.getByRole('list', { name: 'Rate us' })).getAllByRole('listitem')[4]).toHaveTextContent('5 ★1 · 50%');
  });

  it('dates each written answer and drops a one-choice page-size picker (L3)', async () => {
    server.use(
      http.get('/api/admin/surveys/3/results', () => HttpResponse.json({ data: RESULTS, error: null })),
      http.get('/api/admin/surveys/3/text-answers', () =>
        HttpResponse.json({
          data: [{ userId: 9, name: 'Amy', text: 'Lovely', answeredAt: '2026-10-19T00:00:00.000Z' }],
          error: null,
          meta: { page: 1, limit: 20, total: 25, totalPages: 2 },
        }),
      ),
    );
    renderWithProviders(<SurveyResults survey={SURVEY} />);
    expect(await screen.findByText('Amy · 19 Oct 2026, 03:00')).toBeInTheDocument();
    expect(screen.queryByText('Rows per page')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 of 25 answers')).toBeInTheDocument();
  });
});
