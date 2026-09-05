/**
 * The checklist page is the one screen in the console a signed-out person
 * uses, so the things worth pinning are about that: it renders and saves
 * without an account, the number a tester reads out is the catalogue position,
 * and a failed save does not leave a tick that was never recorded.
 */
import { QA_SCENARIOS } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { QaChecklistPage } from '@admin/pages/qa-checklist-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const FIRST = QA_SCENARIOS[0]!;

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

function checklist(entries: Record<string, unknown> = {}) {
  return http.get('/api/qa-checklist', () => ok({ entries }));
}

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <QaChecklistPage />
    </ToastProvider>,
  );
}

describe('QaChecklistPage', () => {
  it('renders the catalogue with no signed-in user', async () => {
    server.use(checklist());
    renderPage();

    expect(await screen.findByText(FIRST.title)).toBeInTheDocument();
    // No token exists in this environment; a page that needed one would have
    // failed the request rather than rendered a row.
    expect(screen.getByRole('heading', { name: /release test/i })).toBeInTheDocument();
  });

  it('numbers scenarios by their position in the catalogue', async () => {
    server.use(checklist());
    renderPage();

    const row = (await screen.findByText(FIRST.title)).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('1')).toBeInTheDocument();
  });

  it('counts nothing as run before anyone has recorded a result', async () => {
    server.use(checklist());
    renderPage();

    expect(await screen.findByText(`0 / ${QA_SCENARIOS.length}`)).toBeInTheDocument();
  });

  it('reflects results the server already holds', async () => {
    server.use(
      checklist({
        [FIRST.id]: {
          status: 'PASS',
          note: 'clean run',
          tester: 'MB',
          updatedAt: '2026-09-05T10:00:00.000Z',
        },
      }),
    );
    renderPage();

    expect(await screen.findByText(`1 / ${QA_SCENARIOS.length}`)).toBeInTheDocument();
    expect(screen.getByText('MB')).toBeInTheDocument();
  });

  it('saves a result to the server when one is picked', async () => {
    const saved = vi.fn();
    server.use(
      checklist(),
      http.put('/api/qa-checklist/:scenarioId', async ({ params, request }) => {
        saved({ id: params['scenarioId'], body: await request.json() });
        return ok({
          status: 'PASS',
          note: '',
          tester: '',
          updatedAt: '2026-09-05T10:00:00.000Z',
        });
      }),
    );
    renderPage();

    const row = (await screen.findByText(FIRST.title)).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /result for scenario 1/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Pass' }));

    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(saved.mock.calls[0]![0]).toMatchObject({
      id: FIRST.id,
      body: { status: 'PASS' },
    });
  });

  it('puts the previous result back when the save fails', async () => {
    server.use(
      checklist(),
      http.put('/api/qa-checklist/:scenarioId', () =>
        HttpResponse.json({ data: null, error: 'nope' }, { status: 500 }),
      ),
    );
    renderPage();

    const row = (await screen.findByText(FIRST.title)).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /result for scenario 1/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Pass' }));

    // The optimistic tick shows, then rolls back — so the counter must land
    // back on zero rather than keeping a result the server never stored.
    await waitFor(() =>
      expect(screen.getByText(`0 / ${QA_SCENARIOS.length}`)).toBeInTheDocument(),
    );
  });

  it('carries a half-typed note into the write that records the result', async () => {
    // The bug this pins: the note used to live in the expanded row, so picking
    // a result re-rendered it and sent the *server's* note — losing whatever
    // the tester had just typed but not yet blurred.
    const saved = vi.fn();
    server.use(
      checklist(),
      http.put('/api/qa-checklist/:scenarioId', async ({ request }) => {
        saved(await request.json());
        return ok({
          status: 'FAIL',
          note: 'nanny never appeared',
          tester: '',
          updatedAt: '2026-09-05T10:00:00.000Z',
        });
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: new RegExp(FIRST.title, 'i') }));
    await userEvent.type(await screen.findByLabelText(/what happened/i), 'nanny never appeared');

    // Straight from the textarea to the result control, with no blur in
    // between — the sequence that used to drop the text.
    const row = screen.getByText(FIRST.title).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /result for scenario 1/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Fail' }));

    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(saved.mock.calls.at(-1)![0]).toMatchObject({
      status: 'FAIL',
      note: 'nanny never appeared',
    });
  });

  it('shows the steps and the expected outcome when a scenario is opened', async () => {
    server.use(checklist());
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: new RegExp(FIRST.title, 'i') }));

    expect(await screen.findByText(FIRST.steps[0]!)).toBeInTheDocument();
    expect(screen.getByText(FIRST.expected[0]!)).toBeInTheDocument();
  });

  it('narrows the list when a filter is applied', async () => {
    server.use(checklist());
    renderPage();

    await screen.findByText(FIRST.title);
    await userEvent.click(screen.getByLabelText('Priority'));
    await userEvent.click(await screen.findByRole('option', { name: /P0/ }));

    const p0 = QA_SCENARIOS.filter((s) => s.priority === 'P0').length;
    expect(
      await screen.findByText(`Showing ${p0} of ${QA_SCENARIOS.length} scenarios.`),
    ).toBeInTheDocument();
  });

  it('explains itself when the checklist cannot be loaded', async () => {
    server.use(
      http.get('/api/qa-checklist', () =>
        HttpResponse.json({ data: null, error: 'down' }, { status: 503 }),
      ),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load/i);
  });
});
