import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BookingChatSummary, BookingMessageResponse } from '@nanny-app/shared';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: '7' }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

import { api } from '@mobile/lib/api';
import BookingChatScreen from '@mobile/screens/BookingChatScreen';
import { useMessagingStore } from '@mobile/store/messagingStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const BOOKING = {
  id: 7,
  status: 'IN_PROGRESS',
  date: '2026-10-15',
  motherFirstName: 'Mona',
  motherLastName: 'Adel',
  nanny: { firstName: 'Sara', lastName: 'Nabil' },
};

function msg(id: number, senderId: number, content: string): BookingMessageResponse {
  return {
    id,
    bookingId: 7,
    content,
    sender: { id: senderId, firstName: senderId === 1 ? 'Mona' : 'Sara', lastName: '', avatarUrl: null, role: senderId === 1 ? 'MOTHER' : 'NANNY' },
    createdAt: '2026-10-15T10:00:00.000Z',
  };
}

function renderScreen(summary: BookingChatSummary, messages: BookingMessageResponse[] = []) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    const routes: Record<string, unknown> = {
      '/bookings/7': BOOKING,
      '/bookings/7/messages': { messages, hasMore: false },
      '/bookings/7/messages/summary': summary,
    };
    return Promise.resolve({ data: { data: routes[url] ?? null, error: null } });
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { data: { read: true }, error: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <BookingChatScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never });
});

it('titles the chat with the other person and shows the thread', async () => {
  const screen = renderScreen(
    { canSend: true, messageCount: 2, unreadCount: 1 },
    [msg(1, 1, 'Nap at 1pm please'), msg(2, 2, 'Will do')],
  );
  expect(await screen.findByText('Sara Nabil')).toBeTruthy();
  expect(screen.getByText('Nap at 1pm please')).toBeTruthy();
  expect(screen.getByText('Will do')).toBeTruthy();
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bookings/7/messages/read'));
  expect(useMessagingStore.getState().activeBookingChatId).toBe('7');
});

it('sends a message while the shift runs', async () => {
  const screen = renderScreen({ canSend: true, messageCount: 0, unreadCount: 0 });
  fireEvent.changeText(await screen.findByLabelText('Message'), 'On our way back');
  (api.post as jest.Mock).mockResolvedValueOnce({ data: { data: msg(3, 1, 'On our way back'), error: null } });
  fireEvent.press(screen.getByLabelText('Send message'));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith('/bookings/7/messages', { content: 'On our way back' }),
  );
});

it('shows the read-only note instead of the composer after the booking', async () => {
  const screen = renderScreen({ canSend: false, messageCount: 1, unreadCount: 0 }, [msg(1, 2, 'Bye')]);
  expect(await screen.findByText('This booking has ended — messages are read-only.')).toBeTruthy();
  expect(screen.queryByLabelText('Send message')).toBeNull();
});

it('keeps the text and says why when a send is refused', async () => {
  const screen = renderScreen({ canSend: true, messageCount: 0, unreadCount: 0 });
  fireEvent.changeText(await screen.findByLabelText('Message'), 'Still there?');
  (api.post as jest.Mock).mockResolvedValueOnce({
    data: { data: null, error: 'Messages can only be sent while the booking is in progress.' },
  });
  fireEvent.press(screen.getByLabelText('Send message'));
  expect(
    await screen.findByText('Messages can only be sent while the booking is in progress.'),
  ).toBeTruthy();
  expect(screen.getByDisplayValue('Still there?')).toBeTruthy();
});
