import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Router is the only per-file mock this screen needs — firebase, the API layer,
// and safe-area insets are all handled by the global jest.setup.js. This screen
// reads its booking draft from the route params and navigates on submit.
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

import BookingStep1Screen from '@mobile/screens/parent/BookingStep1Screen';

// Deliberately plain fixtures — EGP 100/h flat, no duration tiers, no extra-child
// fee, no add-ons — so every total below can be checked by hand.
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

const REWARD_CONFIG = {
  enabled: true,
  pointsPerBookedHour: 10,
  redemptionPointsPerHour: 100, // 100 points buys one free hour
  minRedemptionPoints: 100,
  referralEnabled: false,
  referrerPoints: 0,
  refereePoints: 0,
};

const dateIso = '2026-08-10';
const BASE_PARAMS = {
  dateIso,
  startTimeWall: `${dateIso}T09:00:00`,
  endTimeWall: `${dateIso}T11:00:00`,
  durationHours: '2', // 2h × EGP 100 = EGP 200.00
  children: JSON.stringify([{ ageYears: 3 }]), // 1 child, within the 2 included
  skillIds: '',
};

function renderScreen({ pointsBalance = 200 } = {}) {
  const queryClient = new QueryClient({
    // staleTime Infinity keeps the seeded cache from refetching, so nothing
    // hits the (globally mocked) API — the screen renders straight from these
    // fixtures, exactly like the preview harness.
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['pricing-config'], PRICING);
  queryClient.setQueryData(['rewards', 'config'], REWARD_CONFIG);
  queryClient.setQueryData(['rewards', 'wallet'], {
    userId: 1,
    pointsBalance,
    lifetimeEarned: pointsBalance,
    lifetimeRedeemed: 0,
  });
  queryClient.setQueryData(['package-hours'], { availableHours: 0 });
  queryClient.setQueryData(['packages', 'list'], []);
  return render(
    <QueryClientProvider client={queryClient}>
      <BookingStep1Screen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { ...BASE_PARAMS };
  // BookingSummaryBar flashes its total via Animated.timing on every change.
  // Under real timers that animation frame loop keeps the jest process alive
  // after the tests finish (a leaked handle). We assert on the CTA text, which
  // updates through a normal React render — not the animation — so faking
  // timers neutralises the leak without affecting anything we check.
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('BookingStep1Screen — price', () => {
  it('shows the base total the mother will pay (2h × EGP 100)', () => {
    const { getByText } = renderScreen();
    expect(getByText('Request care · EGP 200.00')).toBeTruthy();
  });

  it('sends her back when a deep link lands here without any children', () => {
    mockParams = { ...BASE_PARAMS, children: JSON.stringify([]) };
    const { getByText } = renderScreen();

    getByText('Tell us who needs care to continue.');
    fireEvent.press(getByText('Go back'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('BookingStep1Screen — Care Points redemption', () => {
  it('offers redemption when the wallet covers at least one free hour', () => {
    const { getByText } = renderScreen({ pointsBalance: 200 }); // 200 / 100 = 2 hours
    getByText('Care Points');
    getByText('200 pts');
    expect(getByText(/up to 2 on this booking/)).toBeTruthy();
  });

  it('hides redemption when the balance is short of one free hour', () => {
    const { queryByText } = renderScreen({ pointsBalance: 50 }); // 50 / 100 = 0 hours
    expect(queryByText('Care Points')).toBeNull();
  });

  it('reserving a free hour drops what she pays by one hour of care', () => {
    const { getByText, getByLabelText, queryByText } = renderScreen({ pointsBalance: 200 });

    // Baseline: the full EGP 200.
    expect(getByText('Request care · EGP 200.00')).toBeTruthy();

    // Reserve one Care-Points hour (EGP 100 of free care).
    fireEvent.press(getByLabelText('Increase'));

    // She now pays EGP 100, and the old total is gone from the CTA.
    expect(getByText('Request care · EGP 100.00')).toBeTruthy();
    expect(queryByText('Request care · EGP 200.00')).toBeNull();
  });
});
