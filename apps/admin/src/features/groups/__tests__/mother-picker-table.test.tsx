/**
 * The picker behind groups and survey recipients: it asks the API to sort (the
 * aggregates are computed server-side), and the selection survives paging.
 */
import type { MotherPickerRow } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const row = (id: number, name: string): MotherPickerRow => ({
  id, name, phone: null, completedBookings: id, hoursBooked: id * 4, totalSpent: id * 100,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null,
});

function Harness() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  return (
    <>
      <MotherPickerTable selected={selected} onSelectedChange={setSelected} />
      <output>{[...selected].sort().join(',')}</output>
    </>
  );
}

describe('MotherPickerTable', () => {
  it('sends the clicked column as the sort and keeps ticks across pages', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get('/api/admin/mother-picker', ({ request }) => {
        const params = new URL(request.url).searchParams;
        seen.push(params);
        const page = Number(params.get('page'));
        const data = page === 1 ? [row(1, 'Amy'), row(2, 'Bea')] : [row(3, 'Cleo')];
        return HttpResponse.json({ data, error: null, meta: { page, limit: 2, total: 3, totalPages: 2 } });
      }),
    );
    renderWithProviders(<Harness />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));
    await userEvent.click(screen.getByRole('button', { name: /bookings/i }));
    await waitFor(() => expect(seen.at(-1)?.get('sortBy')).toBe('completedBookings'));

    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Cleo' }));
    expect(screen.getByRole('status')).toHaveTextContent('1,3');
  });
});
