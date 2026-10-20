/**
 * Chasing mothers from the Recipients tab: resend to everyone who skipped,
 * everyone who never responded, or the ticked rows — each confirmed with its
 * count first. Answered mothers can't be ticked.
 */
import type { AdminSurvey, AdminSurveyRecipient } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { SurveyRecipients } from '@admin/features/surveys/survey-recipients';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const SURVEY: AdminSurvey = {
  id: 3, title: 'Feedback', description: null, status: 'PUBLISHED',
  counts: { recipients: 3, answered: 1, skipped: 1, pending: 1 },
  publishedAt: '2026-10-19T00:00:00.000Z', closedAt: null, createdAt: '2026-10-18T00:00:00.000Z', questions: [],
};
const r = (userId: number, name: string, status: AdminSurveyRecipient['status']): AdminSurveyRecipient => ({
  userId, name, phone: null, status, sentCount: 1, lastSentAt: '2026-10-19T00:00:00.000Z',
  skippedAt: null, answeredAt: status === 'ANSWERED' ? '2026-10-19T01:00:00.000Z' : null,
});
const ROWS = [r(1, 'Amy', 'ANSWERED'), r(2, 'Bea', 'SKIPPED'), r(3, 'Cleo', 'PENDING')];

const ADMIN = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const VIEWER = { ...ADMIN, role: 'OPERATOR', permissions: { surveys: 'VIEW' } };

function setup(survey: AdminSurvey = SURVEY, me: unknown = ADMIN) {
  const bodies: unknown[] = [];
  server.use(
    http.get('/api/admin/me', () => HttpResponse.json({ data: me, error: null })),
    http.get('/api/admin/surveys/3/recipients', () =>
      HttpResponse.json({ data: ROWS, error: null, meta: { page: 1, limit: 20, total: 3, totalPages: 1 } }),
    ),
    http.post('/api/admin/surveys/3/resend', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: { count: 1 }, error: null });
    }),
  );
  renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <SurveyRecipients survey={survey} />
      </PermissionsProvider>
    </ToastProvider>,
  );
  return bodies;
}

describe('SurveyRecipients', () => {
  it('resends to all skipped after confirming the count', async () => {
    const bodies = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Resend to all skipped (1)' }));
    await userEvent.click(screen.getByRole('button', { name: /^resend$/i }));
    await waitFor(() => expect(bodies).toEqual([{ status: 'SKIPPED' }]));
  });

  it('resends to all who did not respond', async () => {
    const bodies = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Resend to all no-response (1)' }));
    await userEvent.click(screen.getByRole('button', { name: /^resend$/i }));
    await waitFor(() => expect(bodies).toEqual([{ status: 'PENDING' }]));
  });

  it('resends to ticked rows; an answered mother cannot be ticked', async () => {
    const bodies = setup();
    expect(await screen.findByRole('checkbox', { name: 'Select Amy' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Cleo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Resend to selected (1)' }));
    await userEvent.click(screen.getByRole('button', { name: /^resend$/i }));
    await waitFor(() => expect(bodies).toEqual([{ userIds: [3] }]));
  });

  it('ticks a box with Space instead of opening the row (keyboard selection)', async () => {
    const bodies = setup();
    const cleo = await screen.findByRole('checkbox', { name: 'Select Cleo' });
    cleo.focus();
    await userEvent.keyboard(' ');
    expect(cleo).toBeChecked();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resend to selected (1)' }));
    await userEvent.click(screen.getByRole('button', { name: /^resend$/i }));
    await waitFor(() => expect(bodies).toEqual([{ userIds: [3] }]));
  });

  it('opens a mother’s answers from the button on her name, not a row-sized button', async () => {
    setup();
    server.use(
      http.get('/api/admin/surveys/3/recipients/2', () =>
        HttpResponse.json({ data: { recipient: ROWS[1], answers: [] }, error: null }),
      ),
    );
    await screen.findByRole('checkbox', { name: 'Select Bea' });
    expect(screen.queryByRole('button', { name: /Select Bea/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bea' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers no resend on a closed survey', async () => {
    setup({ ...SURVEY, status: 'CLOSED' });
    expect(await screen.findByText('Amy')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Resend/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Cleo' })).not.toBeInTheDocument();
  });

  it('offers no resend to a view-only operator', async () => {
    setup(SURVEY, VIEWER);
    expect(await screen.findByText('Amy')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Resend/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Cleo' })).not.toBeInTheDocument();
  });
});
