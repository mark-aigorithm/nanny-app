import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BookingResponse, CareLogResponse } from '@nanny-app/shared';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: '1' }),
}));

import { api } from '@mobile/lib/api';
import BookingDetailScreen from '@mobile/screens/parent/BookingDetailScreen';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const MIN = 60_000;
const iso = (offsetMin: number) => new Date(Date.now() + offsetMin * MIN).toISOString();

function booking(overrides: Partial<BookingResponse> = {}): BookingResponse {
  return {
    id: 1,
    status: 'IN_PROGRESS',
    date: '2026-09-28',
    startTime: iso(-60),
    endTime: iso(180),
    durationHours: 4,
    baseRate: 120,
    effectiveHourlyRate: 120,
    subtotal: 480,
    discountAmount: 0,
    totalAmount: 480,
    extraChildren: 0,
    extraChildFeePerHour: 0,
    skillAddOns: [],
    rewardCreditHoursApplied: 0,
    rewardCreditAmount: 0,
    packageHoursApplied: 0,
    packageSkillsCovered: 0,
    packageCreditAmount: 0,
    childrenCount: 2,
    children: [
      { name: 'Laila', ageYears: 3, allergies: 'Peanuts' },
      { name: 'Omar', ageYears: 1, allergies: null },
    ],
    specialInstructions: 'Nap at 1pm.',
    address: {
      area: 'Maadi',
      details: {
        addressId: 1,
        label: 'Home',
        formattedAddress: '12 Rd 9, Maadi, Cairo',
        governorate: 'Cairo',
        area: 'Maadi',
        street: null,
        building: '4',
        floor: '2',
        apartment: '7',
        landmark: null,
        latitude: 29.96,
        longitude: 31.25,
      },
    },
    nanny: {
      nannyProfileId: 19,
      firstName: 'Elena',
      lastName: 'Hassan',
      avatarUrl: null,
      location: null,
      phone: '+201001234567',
    },
    nannyPhoneRevealMinutes: 60,
    nannyCheckedInAt: iso(-60),
    nannyCheckedOutAt: null,
    motherEndedAt: null,
    cancellationReason: null,
    hasCamera: true,
    balanceDue: null,
    canExtend: true,
    extendableHours: [1, 2],
    activeExtension: null,
    startPinActive: false,
    payment: { id: 9, status: 'CAPTURED', method: 'CARD', amount: 480 },
    myReview: null,
    ...overrides,
  } as unknown as BookingResponse;
}

function log(id: number, minutesAgo: number, notes: string): CareLogResponse {
  return {
    id,
    bookingId: 1,
    nannyProfileId: 19,
    type: 'MEAL',
    customLabel: null,
    notes,
    occurredAt: iso(-minutesAgo),
    evidenceUrls: [],
    createdAt: iso(-minutesAgo),
  };
}

function renderScreen(b: BookingResponse, careLogs: CareLogResponse[] = []) {
  const routes: Record<string, unknown> = {
    '/bookings/1': b,
    '/bookings/1/care-logs': careLogs,
    '/bookings/options': { cancellationWindowHours: 24 },
  };
  (api.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: { data: routes[url] ?? null, error: null } }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <BookingDetailScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: { role: 'MOTHER' } as never });
});

describe('BookingDetailScreen — a running shift', () => {
  it('opens on the live card: who, for how long, and what she can do', async () => {
    const screen = renderScreen(booking());

    expect(await screen.findByText('On shift now')).toBeTruthy();
    expect(screen.getByText('Elena Hassan')).toBeTruthy();
    expect(screen.getByText('With Laila and Omar at Home')).toBeTruthy();
    expect(screen.getByText(/left$/)).toBeTruthy();
    expect(screen.getByText('Watch live')).toBeTruthy();
    expect(screen.getByLabelText('Call Elena')).toBeTruthy();
    expect(screen.getByText('Extend booking')).toBeTruthy();
    expect(screen.getByText('End booking')).toBeTruthy();
    // Nothing to cancel once the nanny is there.
    expect(screen.queryByText('Cancel booking')).toBeNull();
  });

  it('goes to the camera from Watch live', async () => {
    const screen = renderScreen(booking());

    fireEvent.press(await screen.findByText('Watch live'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/nanny/live-video-monitor',
      params: { bookingId: '1' },
    });
  });

  it('makes calling her the main action when she has no camera', async () => {
    const screen = renderScreen(booking({ hasCamera: false }));

    expect(await screen.findByText('Call Elena')).toBeTruthy();
    expect(screen.queryByText('Watch live')).toBeNull();
  });

  it('offers the hours the server allows when she taps Extend', async () => {
    const screen = renderScreen(booking());

    fireEvent.press(await screen.findByText('Extend booking'));

    expect(screen.getByText('+1 hour')).toBeTruthy();
    expect(screen.getByText('+2 hours')).toBeTruthy();
    expect(screen.queryByText('End booking')).toBeNull();
  });

  it('shows the latest three care updates and opens the rest in place', async () => {
    const logs = [5, 4, 3, 2, 1].map((n) => log(n, 60 - n * 10, `Update ${n}`));
    const screen = renderScreen(booking(), logs);

    expect(await screen.findByText('Today so far')).toBeTruthy();
    expect(await screen.findByText('Update 5')).toBeTruthy();
    expect(screen.getByText('Update 3')).toBeTruthy();
    expect(screen.queryByText('Update 2')).toBeNull();

    fireEvent.press(screen.getByText('See all 5'));

    expect(screen.getByText('Update 1')).toBeTruthy();
    expect(screen.getByText('Show less')).toBeTruthy();
  });

  it('reads back the children, their allergies and her notes in one card', async () => {
    const screen = renderScreen(booking());

    expect(await screen.findByText('Care instructions')).toBeTruthy();
    expect(screen.getByLabelText('Allergy: Peanuts')).toBeTruthy();
    expect(screen.getByText('No allergies')).toBeTruthy();
    expect(screen.getByText('Your notes to Elena')).toBeTruthy();
    expect(screen.getByText('Nap at 1pm.')).toBeTruthy();
  });

  it('folds the price to one line until she opens it', async () => {
    const screen = renderScreen(booking());

    expect(await screen.findByText('4 hours')).toBeTruthy();
    expect(screen.getByText('Paid · Card')).toBeTruthy();
    expect(screen.queryByText('Base rate')).toBeNull();

    fireEvent.press(screen.getByText('Paid · Card'));

    expect(screen.getByText('Base rate')).toBeTruthy();
    expect(screen.getByText('Charged')).toBeTruthy();
  });

  it('takes her to support from the last row', async () => {
    const screen = renderScreen(booking());

    fireEvent.press(await screen.findByText('Something wrong?'));

    expect(mockPush).toHaveBeenCalledWith('/(parent)/customer-support');
  });
});

describe('BookingDetailScreen — other states', () => {
  it('counts down to an upcoming booking and lets her cancel it', async () => {
    const screen = renderScreen(
      booking({ status: 'CONFIRMED', startTime: iso(300), endTime: iso(540) }),
    );

    expect(await screen.findByText('Confirmed')).toBeTruthy();
    expect(screen.getByText(/^Starts in /)).toBeTruthy();
    expect(screen.getByText('Cancel booking')).toBeTruthy();
    // No log before the shift, and no live controls.
    expect(screen.queryByText('Today so far')).toBeNull();
    expect(screen.queryByText('On shift now')).toBeNull();
  });

  it('asks for a review once the booking is over', async () => {
    const screen = renderScreen(booking({ status: 'COMPLETED' }));

    expect(await screen.findByText('Completed')).toBeTruthy();
    expect(screen.getByText('Care log')).toBeTruthy();

    fireEvent.press(screen.getByText('Leave a review'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/book/review',
      params: { bookingId: '1' },
    });
  });

  it('shows her review instead of asking again', async () => {
    const screen = renderScreen(
      booking({
        status: 'COMPLETED',
        myReview: { id: 3, rating: 4, comment: 'Lovely with the kids.', createdAt: iso(-10) },
      }),
    );

    expect(await screen.findByLabelText('You rated 4 of 5')).toBeTruthy();
    expect(screen.getByText('Lovely with the kids.')).toBeTruthy();
    expect(screen.queryByText('Leave a review')).toBeNull();
  });

  it('opens the price breakdown when payment is what she came to do', async () => {
    const screen = renderScreen(booking({ status: 'APPROVED', payment: null }));

    expect(await screen.findByText('Complete payment')).toBeTruthy();
    expect(screen.getByText('Not paid yet')).toBeTruthy();
    expect(screen.getByText('Base rate')).toBeTruthy();
  });
});
