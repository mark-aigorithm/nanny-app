/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';

import BookingStep1Screen from '@mobile/screens/parent/BookingStep1Screen';
import { PreviewProviders, setPreviewParams } from './harness';

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const dateIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

setPreviewParams({
  dateIso,
  startTimeWall: `${dateIso}T09:00:00`,
  endTimeWall: `${dateIso}T17:00:00`,
  durationHours: '8',
});

export default function ReviewPreview() {
  return (
    <PreviewProviders>
      <BookingStep1Screen />
    </PreviewProviders>
  );
}
