import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Router is the only per-file mock this screen needs — firebase, the API layer,
// maps and safe-area insets are all handled by the global jest.setup.js.
const mockPush = jest.fn();
const mockBack = jest.fn();
// Every `beforeRemove` listener the screen registers, so a test can fire the
// event the navigator emits when the screen is popped.
const mockBeforeRemoveListeners: Array<() => void> = [];
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
    useNavigation: () => ({
      addListener: (event: string, cb: () => void) => {
        if (event === 'beforeRemove') mockBeforeRemoveListeners.push(cb);
        return () => {
          const i = mockBeforeRemoveListeners.indexOf(cb);
          if (i >= 0) mockBeforeRemoveListeners.splice(i, 1);
        };
      },
    }),
    // Runs like a screen gaining focus once, on mount.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

import { api } from '@mobile/lib/api';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';
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
  cancellationWindowHours: 24,
  cancellationFeePercent: 50,
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
  queryClient.setQueryData(['addresses'], []);
  return render(
    <QueryClientProvider client={queryClient}>
      <BookingDatePickerScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBeforeRemoveListeners.length = 0;
  usePendingPromoStore.setState({ pendingPromoCode: null });
  // BookingSummaryBar animates its total on every change, and that frame loop
  // keeps the jest process alive after the tests finish. Nothing asserted here
  // depends on the animation. The fixed clock is the point of the file: the
  // rail is built from `new Date()`.
  jest.useFakeTimers({ now: NOW });
  // The screen asks again for the options and addresses every time it opens.
  (api.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({
      data: { data: url === '/bookings/options' ? OPTIONS : url === '/addresses' ? [] : null, error: null },
    }),
  );
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

describe('BookingDatePickerScreen — default length', () => {
  it('opens on the minimum booking length the admin configured', () => {
    const { getByText, getAllByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Today'));

    expect(getAllByText('2h').length).toBeGreaterThan(0);
    expect(queryByText('4h')).toBeNull();
  });
});

describe('BookingDatePickerScreen — service areas', () => {
  it('asks again for the options and addresses each time booking opens, however fresh the cache', async () => {
    renderScreen();
    await act(async () => {});

    const urls = (api.get as jest.Mock).mock.calls.map(([url]) => url);
    expect(urls).toContain('/bookings/options');
    expect(urls).toContain('/addresses');
  });
});

describe('BookingDatePickerScreen — abandoned promo flow', () => {
  it('clears a handed-over promo code when the screen is removed by going back', () => {
    usePendingPromoStore.setState({ pendingPromoCode: 'WELCOME10' });
    renderScreen();

    // Still there while she is in the flow (Step 1 reads it two screens later).
    expect(usePendingPromoStore.getState().pendingPromoCode).toBe('WELCOME10');

    act(() => {
      mockBeforeRemoveListeners.forEach((cb) => cb());
    });

    expect(usePendingPromoStore.getState().pendingPromoCode).toBeNull();
  });
});
