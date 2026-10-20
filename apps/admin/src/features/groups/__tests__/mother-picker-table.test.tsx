/**
 * The picker behind groups and survey recipients: it asks the API to sort (the
 * aggregates are computed server-side), and the selection survives paging.
 */
import type { MotherPickerRow } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const row = (id: number, name: string): MotherPickerRow => ({
  id, name, phone: null, completedBookings: id, hoursBooked: id * 4, totalSpent: id * 100,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null, lastAppOpenAt: null,
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
  it('does not jump back to page 1 when the debounce fires after paging', async () => {
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

    await screen.findByRole('checkbox', { name: 'Select Amy' });
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByRole('checkbox', { name: 'Select Cleo' });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(seen.at(-1)?.get('page')).toBe('2');
    expect(screen.getByRole('checkbox', { name: 'Select Cleo' })).toBeInTheDocument();
  });

  it('is a plain list with selectable={false}: no checkboxes, and a row click ticks nothing', async () => {
    server.use(
      http.get('/api/admin/mother-picker', () =>
        HttpResponse.json({ data: [row(1, 'Amy')], error: null, meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      ),
    );
    const onSelectedChange = vi.fn();
    renderWithProviders(<MotherPickerTable selected={new Set()} onSelectedChange={onSelectedChange} selectable={false} />);

    await userEvent.click(await screen.findByText('Amy'));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it('labels its search, shows spend in EGP and one date style, and marks a partly ticked page (L2, L4, L6, L7)', async () => {
    server.use(
      http.get('/api/admin/mother-picker', () =>
        HttpResponse.json({
          data: [row(1, 'Amy'), { ...row(2, 'Bea'), lastBookingAt: '2026-10-15T23:30:00.000Z' }],
          error: null,
          meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
        }),
      ),
    );
    renderWithProviders(<Harness />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));
    // A visible label, not just a placeholder.
    expect(screen.getByText('Search mothers', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search mothers' })).toBeInTheDocument();
    expect(screen.getByText('EGP 200.00')).toBeInTheDocument();
    expect(screen.getByText('16 Oct 2026')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select all on this page' })).toHaveProperty('indeterminate', true);
  });
});
