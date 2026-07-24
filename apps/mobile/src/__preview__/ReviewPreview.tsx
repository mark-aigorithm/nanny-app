/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';

import BookingStep1Screen from '@mobile/screens/parent/BookingStep1Screen';
import { PreviewProviders, setPreviewParams } from './harness';

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const dateIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// Children and skills arrive from the care step as params now, so the
// preview has to supply them for the price breakdown to have anything to show.
setPreviewParams({
  dateIso,
  startTimeWall: `${dateIso}T09:00:00`,
  endTimeWall: `${dateIso}T17:00:00`,
  durationHours: '8',
  children: JSON.stringify([
    { name: 'Lina', ageYears: 3 },
    { name: 'Omar', ageYears: 6 },
    { name: null, ageYears: 0 },
  ]),
  skillIds: '1',
});

export default function ReviewPreview() {
  return (
    <PreviewProviders>
      <BookingStep1Screen />
    </PreviewProviders>
  );
}
