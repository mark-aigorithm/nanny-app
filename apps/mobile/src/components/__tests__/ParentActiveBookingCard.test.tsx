import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BookingResponse } from '@nanny-app/shared';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

let mockBookings: Partial<BookingResponse>[] = [];
jest.mock('@mobile/hooks/useBookings', () => ({
  useBookingList: () => ({ data: mockBookings }),
  fmtBookingDate: (d: string) => d,
}));
// Their own rules decide when they show; this file is about the card.
jest.mock('@mobile/components/ParentStartPinCard', () => () => null);
jest.mock('@mobile/components/booking/AmountDueCard', () => ({ AmountDueCard: () => null }));

import ParentActiveBookingCard from '@mobile/components/ParentActiveBookingCard';

function booking(id: string, status: string, extra: Partial<BookingResponse> = {}) {
  return { id, status, balanceDue: null, nanny: null, date: '2026-10-20', ...extra } as Partial<BookingResponse>;
}

beforeEach(() => {
  mockPush.mockClear();
});

it('speaks for one searching request as before', () => {
  mockBookings = [booking('b1', 'PENDING')];
  render(<ParentActiveBookingCard />);

  expect(screen.getByText('Reaching out to nannies…')).toBeTruthy();
  expect(screen.queryByText(/more request/)).toBeNull();
  fireEvent.press(screen.getByText('Reaching out to nannies…'));
  expect(mockPush).toHaveBeenCalledWith(
    expect.objectContaining({ params: { bookingId: 'b1' } }),
  );
});

// The bug: two requests still searching showed as one.
it('counts every request still searching and opens the list of them', () => {
  mockBookings = [booking('b1', 'PENDING'), booking('b2', 'PENDING')];
  render(<ParentActiveBookingCard />);

  expect(screen.getByText('2 requests still searching')).toBeTruthy();
  expect(screen.getByText('Tap to see them all')).toBeTruthy();
  fireEvent.press(screen.getByText('2 requests still searching'));
  expect(mockPush).toHaveBeenCalledWith('/(parent)/(tabs)/bookings');
});

it('notes the searching requests behind a booking that needs her first', () => {
  mockBookings = [
    booking('b1', 'PENDING'),
    booking('b2', 'APPROVED', { nanny: { firstName: 'Sara', lastName: 'Ali' } as BookingResponse['nanny'] }),
    booking('b3', 'PENDING'),
  ];
  render(<ParentActiveBookingCard />);

  expect(screen.getByText('Sara Ali is ready')).toBeTruthy();
  fireEvent.press(screen.getByText('2 more requests are still finding a nanny'));
  expect(mockPush).toHaveBeenCalledWith('/(parent)/(tabs)/bookings');
});

it('counts other active bookings that are not searching', () => {
  mockBookings = [booking('b1', 'IN_PROGRESS'), booking('b2', 'CONFIRMED')];
  render(<ParentActiveBookingCard />);

  expect(screen.getByText('1 more active booking')).toBeTruthy();
});
