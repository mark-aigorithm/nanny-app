/**
 * The Mommies directory shows when each mother last opened the app, sorts by
 * it, and filters to "within N days" / "not in N+ days" / "never".
 */
import type { AdminMother } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { MothersTab } from '@admin/features/users/mothers-tab';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const AMY: AdminMother = {
  id: 21, name: 'Amy Adel', email: 'amy@example.com', phone: null, avatarUrl: null, location: null,
  isEmailVerified: true, isPhoneVerified: true, isActive: true, approvalStatus: 'APPROVED',
  idDocumentType: null, rejectionReason: null, reviewedAt: null, idDocumentFrontUrl: null,
  idDocumentBackUrl: null, bookingCount: 2, createdAt: '2026-09-01T00:00:00.000Z', lastAppOpenAt: null,
};

const page = (data: AdminMother[]) =>
  HttpResponse.json({ data, error: null, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } });

describe('MothersTab', () => {
  it('shows Never for a mother who has not opened the app, and sorts and filters by last app open', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get('/api/admin/mothers', ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return page([AMY]);
      }),
    );
    renderWithProviders(
      <MemoryRouter>
        <MothersTab />
      </MemoryRouter>,
    );

    const row = (await screen.findByText('Amy Adel')).closest('tr')!;
    expect(within(row).getByText('Never')).toBeInTheDocument();
    expect(seen.at(-1)?.get('lastAppOpen')).toBe('ANY');

    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /last app open/i }));
    await waitFor(() => expect(seen.at(-1)?.get('sortBy')).toBe('lastAppOpenAt'));
    expect(seen.at(-1)?.get('sortDir')).toBe('desc');

    // The filter's trigger is named by its <label for>; the column header is not a label.
    await userEvent.click(screen.getByLabelText('Last app open'));
    await userEvent.click(await screen.findByRole('option', { name: 'Not in 30+ days' }));
    await waitFor(() => expect(seen.at(-1)?.get('lastAppOpen')).toBe('NOT_30'));
  });
});
