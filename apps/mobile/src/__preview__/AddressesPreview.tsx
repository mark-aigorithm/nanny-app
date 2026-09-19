/* Visual-validation harness for the address book screen. */
import React from 'react';

import AddressesScreen from '@mobile/screens/parent/AddressesScreen';
import { PreviewProviders, setPreviewParams } from './harness';

setPreviewParams({});

export default function AddressesPreview() {
  return (
    <PreviewProviders>
      <AddressesScreen />
    </PreviewProviders>
  );
}
