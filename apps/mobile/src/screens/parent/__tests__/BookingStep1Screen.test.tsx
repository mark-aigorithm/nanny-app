import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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

import { api } from '@mobile/lib/api';
import BookingStep1Screen from '@mobile/screens/parent/BookingStep1Screen';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';

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
  // 1 child, within the 2 included. The ids are what is submitted; the JSON is
  // the snapshot the care step hands over for the summary and price.
  childIds: '5',
  children: JSON.stringify([{ name: 'Lina', ageYears: 3 }]),
  skillIds: '',
  // Chosen on the Where step; the draft is incomplete without it.
  addressId: '7',
};

function packageBucket(hoursRemaining: number) {
  return {
    id: 1,
    packageId: 1,
    packageName: 'Starter Pack',
    hoursPurchased: 20,
    hoursRemaining,
    maxSkills: 0,
    status: 'ACTIVE',
    purchasedAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

function renderScreen({ pointsBalance = 200, packageHoursLeft = 0, seedPricing = true } = {}) {
  const queryClient = new QueryClient({
    // staleTime Infinity keeps the seeded cache from refetching, so nothing
    // hits the (globally mocked) API — the screen renders straight from these
    // fixtures, exactly like the preview harness.
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // Left out to test what happens before the price is known: the screen's own
  // fetch then fails against the global API stub, and a test seeds it later.
  if (seedPricing) queryClient.setQueryData(['pricing-config'], PRICING);
  queryClient.setQueryData(['rewards', 'config'], REWARD_CONFIG);
  queryClient.setQueryData(['rewards', 'wallet'], {
    userId: 1,
    pointsBalance,
    lifetimeEarned: pointsBalance,
    lifetimeRedeemed: 0,
  });
  queryClient.setQueryData(['package-hours'], {
    availableHours: packageHoursLeft,
    buckets: packageHoursLeft > 0 ? [packageBucket(packageHoursLeft)] : [],
  });
  queryClient.setQueryData(['packages', 'list'], []);
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <BookingStep1Screen />
      </QueryClientProvider>,
    ),
    queryClient,
  };
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

describe('BookingStep1Screen — children', () => {
  // Joined with non-breaking spaces, so a wrap never splits "(3" from "yrs)".
  it('reads back the children she picked by name', () => {
    const { getByText } = renderScreen();
    getByText('Lina\u00A0(3\u00A0yrs)');
  });

  // One title on every step of the flow, matching the date picker.
  it('keeps the booking flow title', () => {
    const { getByText } = renderScreen();
    getByText('Book care');
  });

  it('submits the saved children she picked, by id', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { data: { id: 9 }, error: null } });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Request care · EGP 200.00'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = (api.post as jest.Mock).mock.calls[0][1];
    expect(body.childIds).toEqual([5]);
    // The server snapshots them itself; nothing typed is sent alongside.
    expect(body).not.toHaveProperty('children');
    expect(body).not.toHaveProperty('saveChildren');
  });

  it('sends her back when the picked ids are missing', () => {
    mockParams = { ...BASE_PARAMS, childIds: '' };
    const { getByText } = renderScreen();
    getByText('Tell us who needs care to continue.');
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

  it('spends the chosen hours with the request — and says there is nothing to pay when they cover it', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { data: { id: 9 }, error: null } });
    const { getByText, getByLabelText } = renderScreen({ pointsBalance: 200 });

    // Two free hours cover the whole 2h booking.
    fireEvent.press(getByLabelText('Increase'));
    fireEvent.press(getByLabelText('Increase'));
    getByText('Nothing to pay — your booking is confirmed as soon as a nanny accepts.');

    fireEvent.press(getByText('Request care · Covered'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/bookings', expect.objectContaining({ redeemPointsHours: 2 })),
    );
    // Nothing rides along to be applied later — the server already has them.
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(parent)/book/booking-confirmation',
        params: { bookingId: '9' },
      }),
    );
  });
});

describe('BookingStep1Screen — prepaid package used first', () => {
  it('shows the package covering the booking before any payment', () => {
    // 2h booking, 18 package hours: the package pays for all of it.
    const { getByText } = renderScreen({ packageHoursLeft: 18 });

    getByText('Paying with');
    getByText('Starter Pack');
    getByText('Used first');
    getByText('2h of your 18h · 16h left after this');
    getByText('Fully covered');
    // The estimate reflects the package — this was EGP 200.00 before.
    getByText('Request care · Covered');
    getByText('Nothing to pay — your booking is confirmed as soon as a nanny accepts.');
  });

  it('says Care Points are not needed and offers no stepper when the package covers everything', () => {
    const { getByText, queryByLabelText } = renderScreen({ packageHoursLeft: 18, pointsBalance: 227 });

    getByText('Not needed — your package covers this booking. Your points stay in your wallet.');
    expect(queryByLabelText('Increase')).toBeNull();
  });

  it('lets Care Points cover only the hours the package leaves owed', () => {
    // 1 package hour of 2 → EGP 100 owed, so at most 1 point-hour.
    const { getByText, getByLabelText } = renderScreen({ packageHoursLeft: 1, pointsBalance: 500 });

    getByText('Request care · EGP 100.00');
    getByText(/up to 1\./);

    fireEvent.press(getByLabelText('Increase'));
    fireEvent.press(getByLabelText('Increase')); // already at the cap

    getByText('Request care · Covered');
    getByText('1 free hour');
  });

  it('sends only the points still needed, and never an opt-out of the package', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { data: { id: 9 }, error: null } });
    const { getByText, getByLabelText } = renderScreen({ packageHoursLeft: 1, pointsBalance: 500 });

    fireEvent.press(getByLabelText('Increase'));
    fireEvent.press(getByText('Request care · Covered'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = (api.post as jest.Mock).mock.calls[0][1];
    expect(body.redeemPointsHours).toBe(1);
    expect(body).not.toHaveProperty('usePackageHours');
  });

  it('says when the booking uses the last of the package', () => {
    const { getByText } = renderScreen({ packageHoursLeft: 2 });
    getByText('2h of your 2h · uses the last of your package');
  });

  it('itemises the package in the savings tally', () => {
    const { getByText } = renderScreen({ packageHoursLeft: 18 });

    getByText('You’re saving');
    getByText('2h from your package');
  });
});

describe('BookingStep1Screen — a code handed over by a campaign or announcement', () => {
  const VALIDATE = '/bookings/validate-promo';
  const validateCalls = () =>
    (api.post as jest.Mock).mock.calls.filter(([url]) => url === VALIDATE);

  /** The promo check answers with `envelope`; creating the booking succeeds as #9. */
  function answerValidate(envelope: { data: unknown; error: string | null }) {
    (api.post as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url === VALIDATE ? { data: envelope } : { data: { data: { id: 9 }, error: null } },
      ),
    );
  }

  beforeEach(() => usePendingPromoStore.getState().setPendingPromoCode('WELCOME20'));

  afterEach(() => {
    usePendingPromoStore.getState().clear();
    // Back to the global stub's default, so no implementation leaks into a later file.
    (api.post as jest.Mock).mockReset().mockResolvedValue({ data: { data: null, error: null } });
  });

  it('applies the code once the price is ready, exactly once', async () => {
    answerValidate({ data: { discountAmount: 20 }, error: null });
    const { getByText } = renderScreen();

    await waitFor(() => getByText(/WELCOME20.*EGP 20\.00 off/));
    // 2h × EGP 100 before any discount.
    expect(validateCalls()).toEqual([[VALIDATE, { code: 'WELCOME20', subtotal: 200 }]]);
    getByText('Request care · EGP 180.00');
    // A one-shot handoff: it never rides into a later booking.
    expect(usePendingPromoStore.getState().pendingPromoCode).toBeNull();
  });

  // UI sweep s20: the chip's × was a bare 16dp icon with an 8dp slop (32dp)
  // and no name for a screen reader.
  it("labels the applied chip's remove control and gives it a 44dp target", async () => {
    answerValidate({ data: { discountAmount: 20 }, error: null });
    const { getByText, getByLabelText } = renderScreen();

    await waitFor(() => getByText(/WELCOME20.*EGP 20\.00 off/));
    const remove = getByLabelText('Remove promo code WELCOME20');
    expect(remove.props.accessibilityRole).toBe('button');
    // 16dp icon + 14dp of slop each side.
    expect(remove.props.hitSlop).toBe(14);
  });

  it('waits for the price breakdown before applying', async () => {
    answerValidate({ data: { discountAmount: 20 }, error: null });
    const { getByText, queryClient } = renderScreen({ seedPricing: false });

    await act(async () => {
      await Promise.resolve();
    });
    expect(validateCalls()).toHaveLength(0);

    act(() => {
      queryClient.setQueryData(['pricing-config'], PRICING);
    });
    await waitFor(() => getByText(/WELCOME20.*EGP 20\.00 off/));
    expect(validateCalls()).toHaveLength(1);
  });

  it('an invalid pending code shows the error and booking still proceeds', async () => {
    answerValidate({ data: null, error: 'This promo code has expired.' });
    const { getByText, getByTestId } = renderScreen();

    await waitFor(() => getByText('This promo code has expired.'));
    // The code stays where she can see what was refused.
    expect(getByTestId('booking.promoInput').props.value).toBe('WELCOME20');
    // Nothing was taken off, and nothing blocks the request.
    fireEvent.press(getByText('Request care · EGP 200.00'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/bookings', expect.any(Object)),
    );
    const body = (api.post as jest.Mock).mock.calls.find(([url]) => url === '/bookings')![1];
    expect(body).not.toHaveProperty('promoCode');
    expect(validateCalls()).toHaveLength(1);
  });

  it('lets her remove a refused code, which clears the error', async () => {
    answerValidate({ data: null, error: 'This promo code has expired.' });
    const { getByText, getByTestId, queryByText } = renderScreen();

    await waitFor(() => getByText('This promo code has expired.'));
    fireEvent.changeText(getByTestId('booking.promoInput'), '');

    expect(getByTestId('booking.promoInput').props.value).toBe('');
    expect(queryByText('This promo code has expired.')).toBeNull();
  });
});
