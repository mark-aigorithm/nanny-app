import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    require('react').useEffect(effect, [effect]);
  },
}));

// The live-order card and the campaign carousel have their own queries and
// their own tests; Home's subject here is the frame around them.
jest.mock('@mobile/components/ParentActiveBookingCard', () => {
  const { Text } = require('react-native');
  return () => <Text>active-booking-card</Text>;
});
jest.mock('@mobile/components/CampaignCarousel', () => () => null);
jest.mock('@mobile/components/ParentTabHeader', () => () => null);
jest.mock('@mobile/components/BottomNav', () => () => null);

import HomeScreen from '@mobile/screens/parent/HomeScreen';
import { useGuestStore } from '@mobile/store/guestStore';
import { useRegisterPromptStore } from '@mobile/store/registerPromptStore';

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const refetchSpy = jest.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>,
  );
  return { ...view, refetchSpy };
}

beforeEach(() => {
  jest.clearAllMocks();
  useGuestStore.setState({ isGuest: false });
  useRegisterPromptStore.setState({ message: null });
});

describe('HomeScreen', () => {
  it('shows the live-order card and lets a signed-in mother start a booking', () => {
    const { getByText, queryByText } = renderHome();

    expect(getByText('active-booking-card')).toBeTruthy();
    expect(queryByText(/browsing as a guest/i)).toBeNull();

    fireEvent.press(getByText('Book care'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/book/booking-date-picker');
    expect(useRegisterPromptStore.getState().message).toBeNull();
  });

  it('greets a guest with the welcome card instead of the live-order card', () => {
    useGuestStore.setState({ isGuest: true });
    const { getByText, queryByText } = renderHome();

    expect(getByText(/browsing as a guest/i)).toBeTruthy();
    expect(queryByText('active-booking-card')).toBeNull();

    fireEvent.press(getByText('Create free account'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/role-selection');
  });

  it('turns a guest’s "Book care" into the create-account prompt', () => {
    useGuestStore.setState({ isGuest: true });
    const { getByText } = renderHome();

    fireEvent.press(getByText('Book care'));

    expect(mockPush).not.toHaveBeenCalledWith('/(parent)/book/booking-date-picker');
    expect(useRegisterPromptStore.getState().message).toMatch(/create your free account/i);
  });

  it('reloads everything on screen when pulled down', async () => {
    const { UNSAFE_getByType, refetchSpy } = renderHome();

    const control = UNSAFE_getByType(RefreshControl);
    await act(async () => {
      await control.props.onRefresh();
    });

    expect(refetchSpy).toHaveBeenCalledWith({ type: 'active' });
  });
});
