/**
 * Choosing who gets a survey: all mothers, any groups and ticked mothers,
 * combined. The summary says what will be sent before anything is.
 */
import type { AdminSurvey, MotherPickerRow, UserGroup } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { RecipientPickerModal } from '@admin/features/surveys/recipient-picker-modal';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const GROUP: UserGroup = { id: 2, name: 'Beta', description: null, kind: 'STATIC', rules: null, memberCount: 12, createdAt: '2026-10-01T00:00:00.000Z' };
const AMY: MotherPickerRow = {
  id: 11, name: 'Amy', phone: null, completedBookings: 0, hoursBooked: 0, totalSpent: 0,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null, lastAppOpenAt: null,
};

const paged = <T,>(data: T[], total = data.length) =>
  HttpResponse.json({ data, error: null, meta: { page: 1, limit: 20, total, totalPages: 1 } });
/** Publish is irreversible, so it is confirmed with the reach in the title. */
const confirmPublish = async () => {
  await userEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
  await userEvent.click(within(screen.getByRole('dialog', { name: /^publish to/i })).getByRole('button', { name: 'Publish' }));
};

describe('RecipientPickerModal', () => {
  it('publishes to a group plus a ticked mother', async () => {
    let body: unknown;
    const onDone = vi.fn();
    server.use(
      http.get('/api/admin/groups', () => ok([GROUP])),
      http.get('/api/admin/mother-picker', () =>
        HttpResponse.json({ data: [AMY], error: null, meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      ),
      http.post('/api/admin/surveys/3/publish', async ({ request }) => {
        body = await request.json();
        return ok({ count: 13 });
      }),
    );
    renderWithProviders(
      <ToastProvider>
        <RecipientPickerModal surveyId={3} mode="publish" onDone={onDone} onClose={vi.fn()} />
      </ToastProvider>,
    );

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Beta (12)' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));
    expect(screen.getByText(/1 group and 1 mother/i)).toBeInTheDocument();
    // The reach before sending: 12 in the group plus Amy, at most (overlaps are sent once).
    expect(screen.getByText(/up to 13 mothers/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
    expect(body).toBeUndefined();
    expect(screen.getByRole('dialog', { name: 'Publish to up to 13 mothers?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(body).toEqual({ allMothers: false, groupIds: [2], userIds: [11] }));
    expect(onDone).toHaveBeenCalledWith(13);
  });

  it('hides the picker when All mothers is on and sends allMothers', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/groups', () => ok([GROUP])),
      http.get('/api/admin/mother-picker', () => paged([AMY], 214)),
      http.post('/api/admin/surveys/3/publish', async ({ request }) => {
        body = await request.json();
        return ok({ count: 40 });
      }),
    );
    renderWithProviders(
      <ToastProvider>
        <RecipientPickerModal surveyId={3} mode="publish" onDone={vi.fn()} onClose={vi.fn()} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /all mothers/i }));
    expect(screen.queryByLabelText('Search mothers')).not.toBeInTheDocument();
    expect(await screen.findByText(/all 214 active mothers/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
    expect(screen.getByRole('dialog', { name: 'Publish to all 214 mothers?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(body).toEqual({ allMothers: true, groupIds: [], userIds: [] }));
  });

  it('adds recipients through the add endpoint and disables sending with nothing chosen', async () => {
    let hit = false;
    server.use(
      http.get('/api/admin/groups', () => ok([GROUP])),
      http.post('/api/admin/surveys/3/recipients', () => {
        hit = true;
        return ok({ count: 12 });
      }),
    );
    const onDone = vi.fn();
    renderWithProviders(
      <ToastProvider>
        <RecipientPickerModal surveyId={3} mode="add" onDone={onDone} onClose={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Add recipients' })).toBeDisabled();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Beta (12)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add recipients' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(12));
    expect(hit).toBe(true);
  });

  it('a publish that timed out after it went through closes with a partial-delivery note, not a failure', async () => {
    const survey = { id: 3, status: 'PUBLISHED' } as AdminSurvey;
    server.use(
      http.get('/api/admin/groups', () => ok([GROUP])),
      // Vercel cut the function off mid-fan-out: the survey is published, some pushes were not sent.
      http.get('/api/admin/mother-picker', () => paged([AMY], 214)),
      http.post('/api/admin/surveys/3/publish', () => new HttpResponse(null, { status: 504 })),
      http.get('/api/admin/surveys/3', () => ok(survey)),
    );
    const onClose = vi.fn();
    const onDone = vi.fn();
    renderWithProviders(
      <ToastProvider>
        <RecipientPickerModal surveyId={3} mode="publish" onDone={onDone} onClose={onClose} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /all mothers/i }));
    await confirmPublish();

    expect(await screen.findByText('Published; some notifications may not have been delivered')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn't send the survey")).not.toBeInTheDocument();
  });

  it('a publish that failed and left the draft a draft still reports the failure', async () => {
    server.use(
      http.get('/api/admin/groups', () => ok([GROUP])),
      http.get('/api/admin/mother-picker', () => paged([AMY], 214)),
      http.post('/api/admin/surveys/3/publish', () => new HttpResponse(null, { status: 504 })),
      http.get('/api/admin/surveys/3', () => ok({ id: 3, status: 'DRAFT' } as AdminSurvey)),
    );
    const onClose = vi.fn();
    renderWithProviders(
      <ToastProvider>
        <RecipientPickerModal surveyId={3} mode="publish" onDone={vi.fn()} onClose={onClose} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /all mothers/i }));
    await confirmPublish();

    expect(await screen.findByText("Couldn't send the survey")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the groups loading, then a retryable error instead of an empty list (M2)', async () => {
    let fail = true;
    server.use(
      http.get('/api/admin/groups', () => (fail ? new HttpResponse(null, { status: 500 }) : ok([GROUP]))),
      http.get('/api/admin/mother-picker', () => paged([AMY])),
    );
    renderWithProviders(
      <ToastProvider>
        <RecipientPickerModal surveyId={3} mode="add" onDone={vi.fn()} onClose={vi.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByText('Loading groups…')).toBeInTheDocument();
    expect(await screen.findByText(/couldn.t load the groups/i, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText('No groups yet.')).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox', { name: 'Beta (12)' })).toBeInTheDocument();
  });

  it('asks before Escape or Close throws a selection away, and ignores the backdrop (M12)', async () => {
    server.use(
      http.get('/api/admin/groups', () => ok([GROUP])),
      http.get('/api/admin/mother-picker', () => paged([AMY])),
    );
    const onClose = vi.fn();
    renderWithProviders(
      <ToastProvider>
        <RecipientPickerModal surveyId={3} mode="add" onDone={vi.fn()} onClose={onClose} />
      </ToastProvider>,
    );
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));

    await userEvent.click(document.querySelector('.modal-backdrop') as Element);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Discard your selection?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep picking' }));
    expect(screen.getByRole('checkbox', { name: 'Select Amy' })).toBeChecked();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes straight away when nothing is picked', async () => {
    server.use(
      http.get('/api/admin/groups', () => ok([GROUP])),
      http.get('/api/admin/mother-picker', () => paged([AMY])),
    );
    const onClose = vi.fn();
    renderWithProviders(
      <ToastProvider>
        <RecipientPickerModal surveyId={3} mode="add" onDone={vi.fn()} onClose={onClose} />
      </ToastProvider>,
    );
    await screen.findByRole('checkbox', { name: 'Select Amy' });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
