import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BookingChatSummary } from '@nanny-app/shared';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

import { BookingChatCard } from '@mobile/components/booking/BookingChatCard';
import { api } from '@mobile/lib/api';

function renderCard(summary: BookingChatSummary, onOpen = jest.fn()) {
  (api.get as jest.Mock).mockResolvedValue({ data: { data: summary, error: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const screen = render(
    <QueryClientProvider client={client}>
      <BookingChatCard bookingId={7} otherFirstName="Sara" onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { screen, onOpen };
}

it('invites her to message during the shift and shows unread', async () => {
  const { screen, onOpen } = renderCard({ canSend: true, messageCount: 3, unreadCount: 2 });
  fireEvent.press(await screen.findByText('Message Sara'));
  expect(onOpen).toHaveBeenCalled();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByLabelText('Message Sara, 2 unread')).toBeTruthy();
});

it('offers the history read-only after the booking', async () => {
  const { screen } = renderCard({ canSend: false, messageCount: 1, unreadCount: 0 });
  expect(await screen.findByText('View messages')).toBeTruthy();
  expect(screen.getByText('1 message · read-only')).toBeTruthy();
});

it('shows nothing when the chat is closed and empty', async () => {
  const { screen } = renderCard({ canSend: false, messageCount: 0, unreadCount: 0 });
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText('View messages')).toBeNull();
  expect(screen.queryByText(/Message/)).toBeNull();
});
