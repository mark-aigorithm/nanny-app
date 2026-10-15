import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CareLogResponse } from '@nanny-app/shared';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ bookingId: '7', entryId: '41' }),
}));

import { api } from '@mobile/lib/api';
import CareLogEntryScreen from '@mobile/screens/parent/CareLogEntryScreen';

const BOOKING = { id: 7, status: 'IN_PROGRESS', date: '2026-10-15', nanny: { firstName: 'Sara', lastName: 'Nabil' } };

function entry(overrides: Partial<CareLogResponse> = {}): CareLogResponse {
  return {
    id: 41,
    bookingId: 7,
    nannyProfileId: 3,
    type: 'MEAL',
    customLabel: null,
    childNames: ['Lina', 'Omar'],
    notes: 'Ate all her pasta and asked for more.',
    occurredAt: '2026-10-15T10:30:00.000Z',
    evidenceUrls: ['https://example.test/photo-1.jpg', 'https://example.test/photo-2.jpg'],
    createdAt: '2026-10-15T10:31:00.000Z',
    ...overrides,
  };
}

function renderScreen(entries: CareLogResponse[]) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    const routes: Record<string, unknown> = {
      '/bookings/7': BOOKING,
      '/bookings/7/care-logs': entries,
    };
    return Promise.resolve({ data: { data: routes[url] ?? null, error: null } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <CareLogEntryScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

it('shows the entry in full: type, children, notes, who logged it and every photo', async () => {
  const screen = renderScreen([entry()]);
  expect(await screen.findByText('Meal')).toBeTruthy();
  expect(screen.getByText('Lina & Omar')).toBeTruthy();
  expect(screen.getByText('Ate all her pasta and asked for more.')).toBeTruthy();
  expect(await screen.findByText(/Logged by Sara/)).toBeTruthy();
  expect(screen.getAllByRole('imagebutton')).toHaveLength(2);
});

it('opens a photo full screen and closes it again', async () => {
  const screen = renderScreen([entry()]);
  fireEvent.press((await screen.findAllByRole('imagebutton'))[1]!);
  expect(screen.getByTestId('care-log-entry.viewer')).toBeTruthy();
  expect(screen.getByText('2 of 2')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Close photo' }));
  expect(screen.queryByTestId('care-log-entry.viewer')).toBeNull();
});

it('says so when the nanny attached no photo', async () => {
  const screen = renderScreen([entry({ evidenceUrls: [], notes: null })]);
  expect(await screen.findByText('Meal')).toBeTruthy();
  expect(screen.queryAllByRole('imagebutton')).toHaveLength(0);
  expect(screen.getByText('No photo with this update.')).toBeTruthy();
  expect(screen.getByText('No notes with this update.')).toBeTruthy();
});

it('explains when the entry is not on this booking', async () => {
  const screen = renderScreen([entry({ id: 99 })]);
  expect(await screen.findByText("This update isn't available any more.")).toBeTruthy();
});
