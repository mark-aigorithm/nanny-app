import type { AdminSurvey, SurveyResults as Results } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
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
    expect(screen.getByText('Amy')).toBeInTheDocument();
  });
});
