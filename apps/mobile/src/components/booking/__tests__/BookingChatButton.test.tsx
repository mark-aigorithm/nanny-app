import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BookingChatSummary } from '@nanny-app/shared';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

import { BookingChatButton } from '@mobile/components/booking/BookingChatButton';
import { api } from '@mobile/lib/api';

function renderButton(summary: BookingChatSummary, onOpen = jest.fn()) {
  (api.get as jest.Mock).mockResolvedValue({ data: { data: summary, error: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const screen = render(
    <QueryClientProvider client={client}>
      <BookingChatButton bookingId={7} otherFirstName="Mona" tone="onDark" onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { screen, onOpen };
}

it('opens the chat and shows the unread count on its corner', async () => {
  const { screen, onOpen } = renderButton({ canSend: true, messageCount: 3, unreadCount: 2 });
  fireEvent.press(await screen.findByLabelText('Message Mona, 2 unread'));
  expect(onOpen).toHaveBeenCalled();
  expect(screen.getByText('2')).toBeTruthy();
});

it('shows no badge when everything is read', async () => {
  const { screen } = renderButton({ canSend: true, messageCount: 3, unreadCount: 0 });
  expect(await screen.findByLabelText('Message Mona')).toBeTruthy();
  expect(screen.queryByText('0')).toBeNull();
});

it('shows nothing when the chat is closed and empty', async () => {
  const { screen } = renderButton({ canSend: false, messageCount: 0, unreadCount: 0 });
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByLabelText(/Message/)).toBeNull();
});
