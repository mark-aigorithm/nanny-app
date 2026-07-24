/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';

import BookingConfirmationScreen from '@mobile/screens/parent/BookingConfirmationScreen';
import { PreviewProviders, mockBooking, setPreviewParams } from './harness';

setPreviewParams({ bookingId: '1', pointsHours: '2' });

export default function MatchingPreview() {
  return (
    <PreviewProviders bookings={[mockBooking()]}>
      <BookingConfirmationScreen />
    </PreviewProviders>
  );
}
