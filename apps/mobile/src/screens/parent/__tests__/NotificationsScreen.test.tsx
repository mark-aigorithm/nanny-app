import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { NotificationResponse } from '@nanny-app/shared';

// `@mobile/lib/api` imports firebase, which eagerly initializes the real SDK at
// module-load time and crashes jest-expo's transform. Stub the API layer.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  unwrap: jest.fn(),
  unwrapPaginated: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockNavigateToBookingDetail = jest.fn();
jest.mock('@mobile/lib/notificationNavigation', () => ({
  navigateToBookingDetail: (...args: unknown[]) => mockNavigateToBookingDetail(...args),
}));

// The screen is a thin view over these hooks; stubbing them keeps the test on
// the tap routing rather than on React Query plumbing.
let mockNotifications: NotificationResponse[] = [];
jest.mock('@mobile/hooks/useNotifications', () => ({
  useNotifications: () => ({
    data: { pages: [{ notifications: mockNotifications }] },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useUnreadNotificationCount: () => ({ data: { unreadCount: 0 } }),
  useMarkAllNotificationsRead: () => ({ mutate: jest.fn(), isPending: false }),
  useMarkNotificationRead: () => ({ mutateAsync: jest.fn().mockResolvedValue(undefined) }),
}));

import NotificationsScreen from '@mobile/screens/parent/NotificationsScreen';

function makeNotification(overrides: Partial<NotificationResponse> = {}): NotificationResponse {
  return {
    id: 1,
    type: 'booking_confirmed',
    title: 'Booking confirmed',
    body: 'See you soon',
    isRead: true,
    referenceId: 42,
    referenceType: 'booking',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifications = [];
});

describe('NotificationsScreen tap routing', () => {
  it('sends a declined extension to the start-a-booking screen, not the booking', async () => {
    mockNotifications = [
      makeNotification({
        type: 'booking_extension_declined',
        title: "Elena can't stay longer",
        body: 'Book a new session',
      }),
    ];

    const { getByText } = render(<NotificationsScreen />);
    fireEvent.press(getByText("Elena can't stay longer"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(parent)/book/booking-date-picker');
    });
    expect(mockNavigateToBookingDetail).not.toHaveBeenCalled();
  });

  it('still opens the booking for other booking notifications', async () => {
    mockNotifications = [makeNotification()];

    const { getByText } = render(<NotificationsScreen />);
    fireEvent.press(getByText('Booking confirmed'));

    await waitFor(() => {
      expect(mockNavigateToBookingDetail).toHaveBeenCalledWith(
        expect.anything(),
        42,
        expect.objectContaining({ focusCareLog: false }),
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
