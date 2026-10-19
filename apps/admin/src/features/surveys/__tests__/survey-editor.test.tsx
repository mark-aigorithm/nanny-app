/**
 * Writing a draft: add questions of each type, give choice questions options,
 * reorder, mark optional, and save the whole draft in one PATCH.
 */
import type { AdminSurvey } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { SurveyEditor } from '@admin/features/surveys/survey-editor';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const ADMIN = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const DRAFT: AdminSurvey = {
  id: 3, title: 'Untitled survey', description: null, status: 'DRAFT',
  counts: { recipients: 0, answered: 0, skipped: 0, pending: 0 },
  publishedAt: null, closedAt: null, createdAt: '2026-10-19T00:00:00.000Z', questions: [],
};

function renderEditor(survey: AdminSurvey = DRAFT, onPublish = vi.fn(), me: unknown = ADMIN) {
  server.use(http.get('/api/admin/me', () => ok(me)));
  return renderWithProviders(
    <MemoryRouter initialEntries={['/surveys/3']}>
      <ToastProvider>
        <PermissionsProvider>
          <Routes>
            <Route path="/surveys/:id" element={<SurveyEditor survey={survey} onPublish={onPublish} />} />
            <Route path="/surveys" element={<p>Survey list</p>} />
          </Routes>
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function pickType(card: HTMLElement, label: string) {
  await userEvent.click(within(card).getByRole('button', { name: 'Answer type' }));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

describe('SurveyEditor', () => {
  it('saves title, questions, options and order in one PATCH', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/admin/surveys/3', async ({ request }) => {
        body = await request.json();
        return ok({ ...DRAFT });
      }),
    );
    renderEditor();

    const title = await screen.findByLabelText('Survey title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Feedback');

    await userEvent.click(screen.getByRole('button', { name: /add question/i }));
    const first = screen.getAllByRole('group', { name: /question \d/i })[0]!;
    await userEvent.type(within(first).getByLabelText('Question'), 'Rate us');
    await pickType(first, 'Rating 1–5');

    await userEvent.click(screen.getByRole('button', { name: /add question/i }));
    const second = screen.getAllByRole('group', { name: /question \d/i })[1]!;
    await userEvent.type(within(second).getByLabelText('Question'), 'Pick one');
    await pickType(second, 'Single choice');
    await userEvent.type(within(second).getByLabelText('Option 1'), 'A');
    await userEvent.type(within(second).getByLabelText('Option 2'), 'B');
    await userEvent.click(within(second).getByRole('checkbox', { name: /required/i }));
    await userEvent.click(within(second).getByRole('button', { name: /move up/i }));

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(body).toEqual({
        title: 'Feedback',
        description: '',
        questions: [
          { type: 'SINGLE_CHOICE', prompt: 'Pick one', required: false, options: ['A', 'B'] },
          { type: 'RATING', prompt: 'Rate us', required: true, options: [] },
        ],
      }),
    );
  });

  it('disables Publish until the draft has a question and is saved', async () => {
    renderEditor();
    expect(await screen.findByRole('button', { name: /publish/i })).toBeDisabled();
  });

  it('shows the API message when the save is refused', async () => {
    server.use(
      http.patch('/api/admin/surveys/3', () =>
        HttpResponse.json({ data: null, error: 'Only a draft can be edited' }, { status: 409 }),
      ),
    );
    renderEditor();
    await userEvent.type(await screen.findByLabelText('Survey description'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText('Only a draft can be edited')).toBeInTheDocument();
  });

  it('deletes the draft after confirmation and returns to the list', async () => {
    let deleted = false;
    server.use(
      http.delete('/api/admin/surveys/3', () => {
        deleted = true;
        return ok(null);
      }),
    );
    renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete draft/i }));
    expect(await screen.findByText('Survey list')).toBeInTheDocument();
    expect(deleted).toBe(true);
  });

  const WITH_QUESTION: AdminSurvey = {
    ...DRAFT,
    questions: [
      {
        id: 1, order: 0, type: 'SINGLE_CHOICE', prompt: 'Pick', required: true,
        options: [{ id: 1, order: 0, label: 'A' }, { id: 2, order: 1, label: 'B' }, { id: 3, order: 2, label: 'C' }],
      },
      { id: 2, order: 1, type: 'TEXT', prompt: 'Why', required: true, options: [] },
    ],
  };

  it('is read-only for a view-only operator', async () => {
    const viewer = { ...ADMIN, role: 'OPERATOR', permissions: { surveys: 'VIEW' } };
    renderEditor(WITH_QUESTION, vi.fn(), viewer);
    expect(await screen.findByLabelText('Survey title')).toBeDisabled();
    const first = screen.getAllByRole('group', { name: /question \d/i })[0]!;
    expect(within(first).getByLabelText('Question')).toBeDisabled();
    expect(within(first).getByRole('button', { name: 'Answer type' })).toBeDisabled();
    expect(within(first).getByLabelText('Option 1')).toBeDisabled();
    expect(within(first).getByRole('button', { name: 'Remove option 1' })).toBeDisabled();
    expect(within(first).getByRole('button', { name: /add option/i })).toBeDisabled();
    expect(within(first).getByRole('checkbox', { name: /required/i })).toBeDisabled();
    expect(within(first).getByRole('button', { name: /move down/i })).toBeDisabled();
    expect(within(first).getByRole('button', { name: /delete question/i })).toBeDisabled();
    for (const name of [/^save$/i, /^delete$/i, /duplicate/i, /add question/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('locks the inputs while a save is in flight, so later edits are not lost', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server.use(
      http.patch('/api/admin/surveys/3', async () => {
        await gate;
        return ok({ ...DRAFT });
      }),
    );
    renderEditor();
    const description = await screen.findByLabelText('Survey description');
    await userEvent.type(description, 'Hi');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(screen.getByLabelText('Survey description')).toBeDisabled());
    expect(screen.getByRole('button', { name: /add question/i })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByLabelText('Survey description')).toBeEnabled());
  });

  it('disables Duplicate while there are unsaved changes', async () => {
    renderEditor();
    expect(await screen.findByRole('button', { name: /duplicate/i })).toBeEnabled();
    await userEvent.type(screen.getByLabelText('Survey description'), 'x');
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeDisabled();
  });
});
