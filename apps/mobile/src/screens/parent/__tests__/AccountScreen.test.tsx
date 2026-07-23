import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserResponse } from '@nanny-app/shared';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn().mockResolvedValue({ data: { data: { unreadCount: 2 }, error: null } }) },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockSignOutMutate = jest.fn();
jest.mock('@mobile/hooks/useAuth', () => ({
  useSignOut: () => ({ mutate: mockSignOutMutate, isPending: false }),
}));

// No SafeAreaProvider in jest — stub the insets hook the floating bar uses.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import MotherProfileWalletScreen from '@mobile/screens/parent/MotherProfileWalletScreen';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const PROFILE = {
  id: 1,
  firebaseUid: 'uid',
  email: 'mina@example.com',
  phone: null,
  firstName: 'Mina',
  lastName: 'Roger',
  dateOfBirth: null,
  avatarUrl: null,
  role: 'MOTHER',
  isEmailVerified: true,
  isPhoneVerified: false,
  idVerificationStatus: 'APPROVED',
  idDocumentType: null,
  idRejectionReason: null,
  address: null,
  latitude: null,
  longitude: null,
  createdAt: '2026-01-15T00:00:00.000Z',
} as UserResponse;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MotherProfileWalletScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: PROFILE });
});

describe('Account screen', () => {
  it('shows the big name header and verified pill', () => {
    const { getByText } = renderScreen();
    getByText('Mina Roger');
    getByText('Verified');
  });

  it('shows Member since year when not verified', () => {
    useUserProfileStore.setState({
      profile: { ...PROFILE, idVerificationStatus: 'PENDING_ID' },
    });
    const { getByText } = renderScreen();
    getByText('Member since 2026');
  });

  it('routes the quick tiles', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Help'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/customer-support',
      params: { returnTo: 'mother-profile' },
    });

    fireEvent.press(getByText('Wallet'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/payment-methods');

    fireEvent.press(getByText('Inbox'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/messages');

    fireEvent.press(getByText('Notifications'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/notifications');
  });

  it('routes the promo cards with returnTo mother-profile', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Care Points'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/rewards',
      params: { returnTo: 'mother-profile' },
    });

    fireEvent.press(getByText('Refer a friend'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/refer-a-friend',
      params: { returnTo: 'mother-profile' },
    });
  });

  it('signs out from the list section', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Sign out'));
    expect(mockSignOutMutate).toHaveBeenCalled();
  });
});
