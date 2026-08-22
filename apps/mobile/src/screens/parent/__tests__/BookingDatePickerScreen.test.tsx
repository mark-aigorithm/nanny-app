import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Router is the only per-file mock this screen needs — firebase, the API layer,
// maps and safe-area insets are all handled by the global jest.setup.js.
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

import BookingDatePickerScreen from '@mobile/screens/parent/BookingDatePickerScreen';

/** 22:45 on the device, the same wall-clock the platform is reporting. */
const NOW = new Date(2026, 7, 21, 22, 45, 0);

/**
 * The mobile lab's platform settings: care around the clock (`start === end` is
 * the schema's full-day case) and no lead time. Under this window a booking may
 * cross midnight, so a late-evening start is legal — which is exactly what the
 * day rail used to hide.
 */
const OPTIONS = {
  bookingWindowStartHour: 0,
  bookingWindowEndHour: 0,
  minBookingHours: 2,
  maxBookingHours: 12,
  minAdvanceBookingHours: 0,
  timezone: 'Africa/Cairo',
  nowWallClock: '2026-08-21T22:45:00',
  earliestStartWallClock: '2026-08-21T22:45:00',
};

const PRICING = {
  standardHourlyRate: 100,
  serviceFeePercent: 0,
  nannyPercent: 80,
  platformPercent: 20,
  skillAddOns: [],
  durationRules: [],
  includedChildrenPerBooking: 2,
  maxChildrenPerBooking: 4,
  extraChildFeeType: 'FLAT',
  extraChildFeeValue: 0,
};

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['booking-options'], OPTIONS);
  queryClient.setQueryData(['pricing-config'], PRICING);
  return render(
    <QueryClientProvider client={queryClient}>
      <BookingDatePickerScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // BookingSummaryBar animates its total on every change, and that frame loop
  // keeps the jest process alive after the tests finish. Nothing asserted here
  // depends on the animation. The fixed clock is the point of the file: the
  // rail is built from `new Date()`.
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('BookingDatePickerScreen — late-evening availability', () => {
  it('still offers today at 22:45 when care runs around the clock', () => {
    const { getByText } = renderScreen();
    expect(getByText('Today')).toBeTruthy();
  });

  it('lands on the first start still on offer, not on a passed hour', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Today'));

    // 22:45 — the next five-minute notch, ten minutes from now. Every whole
    // hour of the day has gone.
    expect(getByText('10:45 PM')).toBeTruthy();
  });
});
