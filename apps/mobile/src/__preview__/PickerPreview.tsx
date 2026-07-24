/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';

import BookingDatePickerScreen from '@mobile/screens/parent/BookingDatePickerScreen';
import { PreviewProviders, setPreviewParams } from './harness';

setPreviewParams({});

export default function PickerPreview() {
  return (
    <PreviewProviders>
      <BookingDatePickerScreen />
    </PreviewProviders>
  );
}
