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
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockNavigateToBookingDetail = jest.fn();
jest.mock('@mobile/lib/notificationNavigation', () => ({
  navigateToBookingDetail: (...args: unknown[]) => mockNavigateToBookingDetail(...args),
}));

const mockOpenPromoLink = jest.fn();
jest.mock('@mobile/lib/openPromoLink', () => ({
  openPromoLink: (...args: unknown[]) => mockOpenPromoLink(...args),
}));

const mockMarkRead = jest.fn();

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
  useMarkNotificationRead: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    mutate: mockMarkRead,
  }),
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
    imageUrl: null,
    link: null,
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

describe('NotificationsScreen rows', () => {
  // UI sweep: "We'd love your f…" truncated on every survey row at 1.3×.
  it('wraps a long title instead of truncating it', () => {
    mockNotifications = [makeNotification({ type: 'survey', title: "We'd love your feedback" })];
    const { getByText } = render(<NotificationsScreen />);
    expect(getByText("We'd love your feedback").props.numberOfLines).toBeUndefined();
  });
});

describe('NotificationsScreen announcements', () => {
  function announcement(overrides: Partial<NotificationResponse> = {}) {
    return makeNotification({
      id: 7,
      type: 'announcement',
      title: 'Spring offer',
      body: '20% off this week',
      isRead: false,
      referenceId: null,
      referenceType: null,
      link: { type: 'promo_code', code: 'SAVE20' },
      ...overrides,
    });
  }

  it('marks it read, then opens its link', () => {
    mockNotifications = [announcement()];
    const { getByRole } = render(<NotificationsScreen />);

    fireEvent.press(getByRole('button', { name: 'Spring offer. Book with code SAVE20' }));

    expect(mockMarkRead).toHaveBeenCalledWith(7);
    expect(mockOpenPromoLink).toHaveBeenCalledWith(expect.anything(), {
      type: 'promo_code',
      code: 'SAVE20',
    });
    expect(mockMarkRead.mock.invocationCallOrder[0]).toBeLessThan(
      mockOpenPromoLink.mock.invocationCallOrder[0],
    );
  });

  it('marks a link-less announcement read and opens Home', () => {
    mockNotifications = [announcement({ link: null })];
    const { getByRole } = render(<NotificationsScreen />);

    fireEvent.press(getByRole('button', { name: 'Spring offer' }));

    expect(mockMarkRead).toHaveBeenCalledWith(7);
    expect(mockOpenPromoLink).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(parent)/(tabs)/home');
  });

  it('does not mark an already-read announcement again', () => {
    mockNotifications = [announcement({ isRead: true })];
    const { getByRole } = render(<NotificationsScreen />);

    fireEvent.press(getByRole('button', { name: 'Spring offer. Book with code SAVE20' }));

    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockOpenPromoLink).toHaveBeenCalled();
  });

  it('keeps ordinary notifications as rows', () => {
    mockNotifications = [announcement(), makeNotification({ id: 2 })];
    const { getByText, getByTestId } = render(<NotificationsScreen />);

    expect(getByTestId('announcement.7')).toBeTruthy();
    expect(getByText('Booking confirmed')).toBeTruthy();
  });
});
