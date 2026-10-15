/**
 * Marketplace chat keeps working after its bubbles and composer moved to
 * components/chat: listing card, both sides of the thread, and sending.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ conversationId: '5' }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

import { api } from '@mobile/lib/api';
import ChatThreadScreen from '@mobile/screens/parent/ChatThreadScreen';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const author = (id: number, firstName: string) => ({ id, firstName, lastName: 'X', avatarUrl: null });

function renderScreen() {
  const routes: Record<string, unknown> = {
    '/conversations/5': {
      id: 5,
      type: 'marketplace',
      listingContext: { id: 1, title: 'Baby stroller', price: 900, imageUrl: null },
      otherParticipant: author(2, 'Seller'),
      lastMessage: null,
      unreadCount: 0,
      updatedAt: '2026-10-15T10:00:00.000Z',
      createdAt: '2026-10-15T10:00:00.000Z',
    },
    '/conversations/5/messages': {
      messages: [
        { id: 1, conversationId: 5, type: 'text', content: 'Still available?', sender: author(1, 'Me'), createdAt: '2026-10-15T10:00:00.000Z' },
        { id: 2, conversationId: 5, type: 'text', content: 'Yes it is', sender: author(2, 'Seller'), createdAt: '2026-10-15T10:01:00.000Z' },
      ],
      hasMore: false,
    },
  };
  (api.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: { data: routes[url] ?? null, error: null } }),
  );
  (api.post as jest.Mock).mockResolvedValue({ data: { data: { read: true }, error: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatThreadScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never });
});

it('shows the listing and both sides of the thread', async () => {
  const screen = renderScreen();
  expect(await screen.findByText('Baby stroller')).toBeTruthy();
  expect(screen.getByText('Still available?')).toBeTruthy();
  expect(screen.getByText('Yes it is')).toBeTruthy();
});

it('sends what she typed', async () => {
  const screen = renderScreen();
  fireEvent.changeText(await screen.findByTestId('chatThread.message'), 'Can I pick it up today?');
  fireEvent.press(screen.getByTestId('chatThread.send'));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith('/conversations/5/messages', {
      content: 'Can I pick it up today?',
    }),
  );
});
