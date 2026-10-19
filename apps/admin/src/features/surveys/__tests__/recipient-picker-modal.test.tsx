/**
 * Choosing who gets a survey: all mothers, any groups and ticked mothers,
 * combined. The summary says what will be sent before anything is.
 */
import type { MotherPickerRow, UserGroup } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { RecipientPickerModal } from '@admin/features/surveys/recipient-picker-modal';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const GROUP: UserGroup = { id: 2, name: 'Beta', description: null, memberCount: 12, createdAt: '2026-10-01T00:00:00.000Z' };
const AMY: MotherPickerRow = {
  id: 11, name: 'Amy', phone: null, completedBookings: 0, hoursBooked: 0, totalSpent: 0,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null,
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
    await userEvent.click(screen.getByRole('button', { name: /publish and notify/i }));

    await waitFor(() => expect(body).toEqual({ allMothers: false, groupIds: [2], userIds: [11] }));
    expect(onDone).toHaveBeenCalledWith(13);
  });

  it('hides the picker when All mothers is on and sends allMothers', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/groups', () => ok([GROUP])),
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
    expect(screen.getByText(/every active mother/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
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
    const send = screen.getByRole('button', { name: /send to them/i });
    expect(send).toBeDisabled();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Beta (12)' }));
    await userEvent.click(send);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(12));
    expect(hit).toBe(true);
  });
});
