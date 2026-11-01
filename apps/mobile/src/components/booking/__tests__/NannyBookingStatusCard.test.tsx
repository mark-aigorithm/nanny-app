import React from 'react';
import { render } from '@testing-library/react-native';
import { BookingChildSchema, type BookingResponse } from '@nanny-app/shared';

import { NannyBookingStatusCard } from '@mobile/components/booking/NannyBookingStatusCard';

function booking(over: Partial<BookingResponse>): BookingResponse {
  return {
    id: 7,
    status: 'CONFIRMED',
    motherFirstName: 'Asma',
    motherLastName: 'Emad',
    motherAvatarUrl: null,
    startTime: '2026-11-01T08:30:00.000Z',
    endTime: '2026-11-01T10:30:00.000Z',
    durationHours: 2,
    childrenCount: 2,
    children: [
      BookingChildSchema.parse({ name: 'Ali', ageYears: 5 }),
      BookingChildSchema.parse({ name: 'Alia', ageYears: 5 }),
    ],
    ...over,
  } as BookingResponse;
}

it('shows whose family, the status, the hours and the children', () => {
  const screen = render(<NannyBookingStatusCard booking={booking({})} />);
  expect(screen.getByText('Asma Emad')).toBeTruthy();
  expect(screen.getByText('AE')).toBeTruthy();
  expect(screen.getByText(/2 hours$/)).toBeTruthy();
  expect(screen.getByText('Ali and Alia')).toBeTruthy();
});

it('counts the children when any of them has no name', () => {
  const screen = render(
    <NannyBookingStatusCard
      booking={booking({ children: [BookingChildSchema.parse({ ageYears: 3 })], childrenCount: 1 })}
    />,
  );
  expect(screen.getByText('One child')).toBeTruthy();
});
