import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CareLogResponse } from '@nanny-app/shared';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));

import { api } from '@mobile/lib/api';
import { CareTimeline } from '@mobile/components/booking/CareTimeline';

const ENTRY: CareLogResponse = {
  id: 41,
  bookingId: 7,
  nannyProfileId: 3,
  type: 'MEAL',
  customLabel: null,
  childNames: ['Lina'],
  notes: 'Ate all her pasta',
  occurredAt: '2026-10-15T10:30:00.000Z',
  evidenceUrls: ['https://example.test/photo-1.jpg'],
  createdAt: '2026-10-15T10:31:00.000Z',
};

function renderTimeline(entries: CareLogResponse[]) {
  (api.get as jest.Mock).mockResolvedValue({ data: { data: entries, error: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <CareTimeline bookingId={7} title="Today so far" nannyFirstName="Sara" />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

it('opens an entry on its own screen when the mother taps it', async () => {
  const screen = renderTimeline([ENTRY]);
  fireEvent.press(await screen.findByRole('button', { name: /Meal.*see details/i }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(parent)/book/care-log-entry',
    params: { bookingId: '7', entryId: '41' },
  });
});
