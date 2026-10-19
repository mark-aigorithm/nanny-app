import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserResponse } from '@nanny-app/shared';

jest.mock('@mobile/lib/api', () => ({
  api: {
    get: jest.fn((url: string) => {
      const data: Record<string, unknown> = {
        '/packages/me/hours': { availableHours: 12, buckets: [] },
        '/rewards/wallet': { pointsBalance: 1250, lifetimeEarned: 1500, lifetimeRedeemed: 250 },
      };
      return Promise.resolve({ data: { data: data[url] ?? { unreadCount: 0 }, error: null } });
    }),
  },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown } }>) => promise.then((res) => res.data.data)),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('@mobile/hooks/useAuth', () => ({
  useSignOut: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteAccount: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockPending: Array<{ id: number }> = [];
jest.mock('@mobile/hooks/useSurveys', () => ({ usePendingSurveys: () => ({ data: mockPending }) }));

import MotherProfileWalletScreen from '@mobile/screens/parent/MotherProfileWalletScreen';
import { useGuestStore } from '@mobile/store/guestStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const PROFILE = {
  id: 1, firebaseUid: 'uid', email: 'mina@example.com', phone: null, firstName: 'Mina', lastName: 'Roger',
  dateOfBirth: null, avatarUrl: null, role: 'MOTHER', isEmailVerified: true, isPhoneVerified: false,
  approvalStatus: 'APPROVED', idDocumentType: null, rejectionReason: null, address: null, latitude: null,
  longitude: null, createdAt: '2026-01-15T00:00:00.000Z',
} as UserResponse;

const tree = () => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    <MotherProfileWalletScreen />
  </QueryClientProvider>
);

// Icon fonts and queries resolve asynchronously; let them land inside act.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  mockPush.mockReset();
  useUserProfileStore.setState({ profile: PROFILE });
  useGuestStore.setState({ isGuest: false });
});

it('shows the Surveys card only when there is something to answer', async () => {
  mockPending = [];
  const { rerender } = render(tree());
  await settle();
  expect(screen.queryByText('Surveys')).toBeNull();

  mockPending = [{ id: 1 }, { id: 2 }];
  rerender(tree());
  await settle();
  expect(screen.getByText('Surveys')).toBeTruthy();
  expect(screen.getByText('2 waiting for your answer')).toBeTruthy();
  fireEvent.press(screen.getByText('Surveys'));
  expect(mockPush).toHaveBeenCalledWith('/(parent)/surveys');
});
