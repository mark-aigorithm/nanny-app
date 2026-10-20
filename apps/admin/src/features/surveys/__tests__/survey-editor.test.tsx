/**
 * Writing a draft: add questions of each type, give choice questions options,
 * reorder, mark optional, and save the whole draft in one PATCH.
 */
import type { AdminSurvey } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
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

function renderEditor(survey: AdminSurvey = DRAFT, onDone = vi.fn(), me: unknown = ADMIN, isNew = false) {
  server.use(http.get('/api/admin/me', () => ok(me)));
  // A data router, as the app uses: the unsaved-changes guard needs useBlocker.
  const router = createMemoryRouter(
    [
      { path: '/surveys/new', element: <SurveyEditor survey={survey} onDone={onDone} isNew /> },
      { path: '/surveys/9', element: <p>Saved draft 9</p> },
      { path: '/surveys/:id', element: <SurveyEditor survey={survey} onDone={onDone} /> },
      { path: '/surveys', element: <p>Survey list</p> },
    ],
    { initialEntries: [isNew ? '/surveys/new' : '/surveys/3'] },
  );
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <RouterProvider router={router} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

async function pickType(card: HTMLElement, label: string) {
  await userEvent.click(within(card).getByRole('button', { name: 'Answer type' }));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

describe('SurveyEditor', () => {
  it('keeps the page heading on the saved title while the title field is edited', async () => {
    renderEditor(DRAFT, vi.fn(), ADMIN, true);
    expect(await screen.findByRole('heading', { name: 'Create new survey' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title'), ' and more');
    expect(screen.getByRole('heading', { name: 'Create new survey' })).toBeInTheDocument();
  });

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
    await userEvent.click(within(second).getByRole('button', { name: 'Move question 2 up' }));

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

  it('names each move button by its question and keeps focus on it after a move (L1)', async () => {
    renderEditor(WITH_QUESTION);
    const up = await screen.findByRole('button', { name: 'Move question 2 up' });
    await userEvent.click(up);
    // "Why" is now question 1; its Up is disabled, so focus moves to its Down.
    const moved = screen.getAllByRole('group', { name: /question \d/i })[0]!;
    expect(within(moved).getByLabelText('Question')).toHaveValue('Why');
    expect(within(moved).getByRole('button', { name: 'Move question 1 down' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Move question 1 down' }));
    expect(screen.getByRole('button', { name: 'Move question 2 up' })).toHaveFocus();
  });

  it('a new survey is created by its first Save, then opens as that draft (L8)', async () => {
    let body: unknown;
    server.use(
      http.post('/api/admin/surveys', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...DRAFT, id: 9, title: 'Feedback' }, error: null }, { status: 201 });
      }),
    );
    renderEditor(DRAFT, vi.fn(), ADMIN, true);
    expect(await screen.findByRole('button', { name: /publish/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
    const title = screen.getByLabelText('Survey title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Feedback');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText('Saved draft 9')).toBeInTheDocument();
    expect(body).toEqual({ title: 'Feedback', description: '', questions: [] });
  });

  it('keeps Save and publish off until the draft has a question', async () => {
    renderEditor();
    expect(await screen.findByRole('button', { name: 'Save and publish' })).toBeDisabled();
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

  it('locks the inputs while a save is in flight, so later edits are not lost', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server.use(
      http.patch('/api/admin/surveys/3', async () => {
        await gate;
        // A refused save keeps the editor open, so the unlock is visible.
        return HttpResponse.json({ data: null, error: 'Database unavailable' }, { status: 503 });
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

  it('says on screen whether there is anything to save (M11)', async () => {
    renderEditor();
    expect(await screen.findByText('No changes yet.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Survey description'), 'x');
    expect(screen.getByText('Unsaved changes.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
  });

  it('Save and publish saves, then hands over to the publish flow', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/admin/surveys/3', async ({ request }) => {
        body = await request.json();
        return ok(WITH_QUESTION);
      }),
    );
    const onDone = vi.fn();
    renderEditor(WITH_QUESTION, onDone);
    await userEvent.type(await screen.findByLabelText('Survey description'), 'Two minutes');
    await userEvent.click(screen.getByRole('button', { name: 'Save and publish' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('publish'));
    expect(body).toMatchObject({ description: 'Two minutes' });
  });

  it('previews the questions as they are typed', async () => {
    renderEditor(WITH_QUESTION);
    const preview = await screen.findByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('Pick')).toBeInTheDocument();
    expect(within(preview).getByText('B')).toBeInTheDocument();
    const first = screen.getAllByRole('group', { name: /question \d/i })[0]!;
    await userEvent.type(within(first).getByLabelText('Question'), ' one');
    expect(within(preview).getByText('Pick one')).toBeInTheDocument();
  });

  it('asks before deleting a question that has text; an empty one goes at once (M11)', async () => {
    renderEditor(WITH_QUESTION);
    const first = (await screen.findAllByRole('group', { name: /question \d/i }))[0]!;
    await userEvent.click(within(first).getByRole('button', { name: /delete question/i }));
    const confirm = screen.getByRole('dialog', { name: 'Delete question 1?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByRole('group', { name: /question \d/i })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /add question/i }));
    const blank = screen.getAllByRole('group', { name: /question \d/i })[2]!;
    await userEvent.click(within(blank).getByRole('button', { name: /delete question/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: /question \d/i })).toHaveLength(2);
  });

  it('on Save with problems, marks the field, says what is wrong and sends nothing (L17)', async () => {
    let patched = false;
    server.use(
      http.patch('/api/admin/surveys/3', () => {
        patched = true;
        return ok({ ...DRAFT });
      }),
    );
    renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: /add question/i }));
    const card = screen.getAllByRole('group', { name: /question \d/i })[0]!;
    // Not flagged while still being written.
    expect(within(card).getByLabelText('Question')).not.toHaveAttribute('aria-invalid');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(patched).toBe(false);
    const prompt = within(card).getByLabelText('Question');
    expect(prompt).toHaveAttribute('aria-invalid', 'true');
    expect(prompt).toHaveAccessibleDescription('Write the question.');
    expect(prompt).toHaveFocus();
    expect(screen.getByText('Question 1: write the question.')).toHaveAttribute('role', 'status');
  });

  describe('unsaved changes', () => {
    it('asks before leaving with unsaved edits; Stay keeps them, Leave goes', async () => {
      renderEditor();
      const title = await screen.findByLabelText(/title/i);
      await userEvent.clear(title);
      await userEvent.type(title, 'Half written');

      await userEvent.click(screen.getByRole('button', { name: 'Surveys' }));
      const dialog = await screen.findByRole('dialog', { name: /leave without saving/i });
      await userEvent.click(within(dialog).getByRole('button', { name: /stay/i }));
      expect(screen.queryByText('Survey list')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/title/i)).toHaveValue('Half written');

      await userEvent.click(screen.getByRole('button', { name: 'Surveys' }));
      await userEvent.click(
        within(await screen.findByRole('dialog', { name: /leave without saving/i })).getByRole('button', { name: /leave/i }),
      );
      expect(await screen.findByText('Survey list')).toBeInTheDocument();
    });

    it('leaves without asking when nothing changed', async () => {
      renderEditor();
      await userEvent.click(await screen.findByRole('button', { name: 'Surveys' }));
      expect(await screen.findByText('Survey list')).toBeInTheDocument();
    });

    it('asks the browser to confirm closing the tab only while there are unsaved edits', async () => {
      renderEditor();
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      const title = await screen.findByLabelText(/title/i);
      await userEvent.type(title, '!');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });
  });
});
