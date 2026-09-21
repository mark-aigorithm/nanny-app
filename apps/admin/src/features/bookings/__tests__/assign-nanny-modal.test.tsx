/**
 * The picker's job is to make the eligibility verdicts visible and to send
 * exactly one id. A busy nanny can't be chosen at all; the soft warnings show
 * but don't block; the primary button says what will happen (approve or not).
 */
import type { AdminBooking, AdminBookingCandidate } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { AssignNannyModal } from '@admin/features/bookings/assign-nanny-modal';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const CANDIDATES: AdminBookingCandidate[] = [
  { id: 21, name: 'Amira Busy', phone: null, rating: 4.5, reviewCount: 3, conflict: true, missingSkills: [], distanceKm: 1.2, outsideRadius: false },
  { id: 22, name: 'Nour Far', phone: '+201000000002', rating: 0, reviewCount: 0, conflict: false, missingSkills: ['CPR'], distanceKm: 12.4, outsideRadius: true },
  { id: 23, name: 'Sara Near', phone: '+201000000003', rating: 4.9, reviewCount: 12, conflict: false, missingSkills: [], distanceKm: 0.8, outsideRadius: false },
];

const PENDING = { id: 4, status: 'PENDING', date: '2026-09-21', nanny: null };
const CONFIRMED = { id: 4, status: 'CONFIRMED', date: '2026-09-21', nanny: { id: 21, name: 'Amira Busy' } };

const UPDATED: AdminBooking = {
  id: 4,
  status: 'APPROVED',
  nannyDecision: 'PENDING',
  type: 'STANDARD',
  date: '2026-09-21',
  startTime: '2026-09-21T14:00:00+03:00',
  endTime: '2026-09-21T17:00:00+03:00',
  durationHours: 3,
  totalAmount: 318,
  discountAmount: 0,
  promoCode: null,
  paymentStatus: null,
  mother: { id: 10, name: 'Jane Mom', phone: null },
  nanny: { id: 23, name: 'Sara Near' },
  createdAt: '2026-09-12T00:00:00.000Z',
};

function backend() {
  const patches: unknown[] = [];
  server.use(
    http.get('/api/admin/bookings/4/candidates', () => ok(CANDIDATES)),
    http.patch('/api/admin/bookings/4/nanny', async ({ request }) => {
      patches.push(await request.json());
      return ok(UPDATED);
    }),
  );
  return patches;
}

function renderModal(booking: typeof PENDING | typeof CONFIRMED, onClose = vi.fn()) {
  renderWithProviders(
    <ToastProvider>
      <AssignNannyModal booking={booking} onClose={onClose} />
    </ToastProvider>,
  );
  return onClose;
}

describe('AssignNannyModal', () => {
  it('disables a busy nanny and shows the soft warnings', async () => {
    backend();
    renderModal(PENDING);

    expect(await screen.findByRole('radio', { name: /Amira Busy/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Nour Far/ })).toBeEnabled();
    expect(screen.getByText('Busy')).toBeInTheDocument();
    expect(screen.getByText('Missing: CPR')).toBeInTheDocument();
    expect(screen.getByText('12.4 km away')).toBeInTheDocument();
    expect(screen.getByText('★ 4.9 (12)')).toBeInTheDocument();
  });

  it('assigns and approves a pending request', async () => {
    const patches = backend();
    const onClose = renderModal(PENDING);
    const user = userEvent.setup();

    const button = await screen.findByRole('button', { name: 'Assign & approve' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/parent will be asked to pay/i)).toBeInTheDocument();

    await user.click(await screen.findByRole('radio', { name: /Sara Near/ }));
    await user.click(button);

    await waitFor(() => expect(patches).toEqual([{ nannyProfileId: 23 }]));
    expect(await screen.findByText('Nanny assigned')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('offers to change the nanny on a paid booking without an approval note', async () => {
    backend();
    renderModal(CONFIRMED);

    expect(await screen.findByRole('button', { name: 'Change nanny' })).toBeInTheDocument();
    expect(screen.queryByText(/parent will be asked to pay/i)).not.toBeInTheDocument();
  });

  it('sends the search box as q', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/admin/bookings/4/candidates', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('q') ?? '');
        return ok([]);
      }),
    );
    renderModal(PENDING);
    const user = userEvent.setup();

    await screen.findByText('No approved nannies match.');
    await user.type(screen.getByRole('searchbox', { name: 'Search nannies' }), 'sar');

    await waitFor(() => expect(seen).toContain('sar'));
  });
});
