/** One mother's answers: the status line must match her badge, and answers read as sentences. */
import type { AdminSurvey, AdminSurveyRecipient } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { RecipientAnswersModal } from '@admin/features/surveys/recipient-answers-modal';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const SURVEY: AdminSurvey = {
  id: 3, title: 'Feedback', description: null, status: 'PUBLISHED',
  counts: { recipients: 3, answered: 1, skipped: 1, pending: 1 },
  publishedAt: '2026-10-19T00:00:00.000Z', closedAt: null, createdAt: '2026-10-18T00:00:00.000Z',
  questions: [{ id: 101, order: 0, type: 'YES_NO', prompt: 'Would you book the same nanny again?', required: true, options: [] }],
};
const base: AdminSurveyRecipient = {
  userId: 7, name: 'Bea', phone: null, status: 'PENDING', sentCount: 2,
  lastSentAt: '2026-10-19T09:00:00.000Z', skippedAt: null, answeredAt: null,
};

function open(recipient: AdminSurveyRecipient, answers: unknown[] = []) {
  server.use(
    http.get('/api/admin/surveys/3/recipients/7', () => HttpResponse.json({ data: { recipient, answers }, error: null })),
  );
  renderWithProviders(<RecipientAnswersModal survey={SURVEY} userId={7} onClose={vi.fn()} />);
}

describe('RecipientAnswersModal', () => {
  it('says a mother skipped it, and when — not that she hasn’t answered "yet"', async () => {
    open({ ...base, status: 'SKIPPED', skippedAt: '2026-10-19T10:00:00.000Z' });
    expect(await screen.findByText('She skipped this survey on 19 Oct 2026, 13:00.')).toBeInTheDocument();
    expect(screen.queryByText(/yet/)).not.toBeInTheDocument();
  });

  it('says no response yet, with when it was last sent', async () => {
    open(base);
    expect(await screen.findByText('No response yet. Last sent 19 Oct 2026, 12:00.')).toBeInTheDocument();
  });

  it('shows when she answered and each prompt as a sentence', async () => {
    open({ ...base, status: 'ANSWERED', answeredAt: '2026-10-19T11:00:00.000Z' }, [
      { questionId: 101, text: null, rating: null, bool: true, optionIds: [] },
    ]);
    expect(await screen.findByText('Answered on 19 Oct 2026, 14:00.')).toBeInTheDocument();
    const prompt = screen.getByText('Would you book the same nanny again?');
    expect(prompt).toHaveClass('answer-prompt');
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });
});
