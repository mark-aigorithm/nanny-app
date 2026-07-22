import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn().mockResolvedValue({ data: { data: { unreadCount: 0 }, error: null } }) },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

// ID gate passes through by default (verified mother).
jest.mock('@mobile/hooks/useIdGate', () => ({
  useIdGate: () => ({ needsId: false, gate: (fn: () => void) => fn }),
}));

// No SafeAreaProvider in jest — stub the insets hook the floating bar uses.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import ServicesHubScreen from '@mobile/screens/parent/ServicesHubScreen';
import { useGuestStore } from '@mobile/store/guestStore';
import { useRegisterPromptStore } from '@mobile/store/registerPromptStore';

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ServicesHubScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useGuestStore.setState({ isGuest: false });
  useRegisterPromptStore.setState({ message: null });
});

describe('ServicesHubScreen', () => {
  it('shows the hero and the four service tiles', () => {
    const { getByText } = renderScreen();
    getByText('Book a Nanny');
    getByText('Community');
    getByText('Marketplace');
    getByText('Events & Meetups');
    getByText('Care Points');
  });

  it('navigates to each destination', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Book a Nanny'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/book/booking-date-picker');

    fireEvent.press(getByText('Community'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/community');

    fireEvent.press(getByText('Marketplace'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/marketplace');

    fireEvent.press(getByText('Events & Meetups'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/events-meetups');

    fireEvent.press(getByText('Care Points'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/rewards',
      params: { returnTo: 'services' },
    });
  });

  it('gates booking and Care Points for guests but leaves browsing open', () => {
    useGuestStore.setState({ isGuest: true });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Book a Nanny'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegisterPromptStore.getState().message).toBe(
      'Create your free account to book trusted, vetted nannies.',
    );

    useRegisterPromptStore.setState({ message: null });
    fireEvent.press(getByText('Care Points'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegisterPromptStore.getState().message).toBe(
      'Create your free account to earn Care Points.',
    );

    fireEvent.press(getByText('Community'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/community');
  });
});
