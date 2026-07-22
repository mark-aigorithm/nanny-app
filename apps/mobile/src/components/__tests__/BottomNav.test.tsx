import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// `@mobile/lib/api` imports firebase, which eagerly initializes the real SDK
// at module-load time and crashes jest-expo's transform. Stub the API layer.
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

// No SafeAreaProvider in jest — stub the insets hook the floating bar uses.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import BottomNav from '@mobile/components/BottomNav';
import { useGuestStore } from '@mobile/store/guestStore';
import { useRegisterPromptStore } from '@mobile/store/registerPromptStore';

function renderNav(activeTab: React.ComponentProps<typeof BottomNav>['activeTab'] = 'home') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BottomNav activeTab={activeTab} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useGuestStore.setState({ isGuest: false });
  useRegisterPromptStore.setState({ message: null });
});

describe('BottomNav', () => {
  it('renders the four Uber-style tabs', () => {
    const { getByText } = renderNav();
    getByText('Home');
    getByText('Services');
    getByText('Activity');
    getByText('Account');
  });

  it('navigates to the services hub', () => {
    const { getByText } = renderNav();
    fireEvent.press(getByText('Services'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/services');
  });

  it('navigates to bookings for Activity and mother-profile for Account when signed in', () => {
    const { getByText } = renderNav();
    fireEvent.press(getByText('Activity'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/bookings');
    fireEvent.press(getByText('Account'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/mother-profile');
  });

  it('gates Activity and Account behind the register prompt for guests', () => {
    useGuestStore.setState({ isGuest: true });
    const { getByText } = renderNav();

    fireEvent.press(getByText('Activity'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegisterPromptStore.getState().message).toBe(
      'Create your free account to book and manage care.',
    );

    useRegisterPromptStore.setState({ message: null });
    fireEvent.press(getByText('Account'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegisterPromptStore.getState().message).toBe(
      'Create your free account to set up your profile.',
    );
  });

  it('does not gate Home or Services for guests', () => {
    useGuestStore.setState({ isGuest: true });
    const { getByText } = renderNav();
    fireEvent.press(getByText('Services'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/services');
    expect(useRegisterPromptStore.getState().message).toBeNull();
  });
});
