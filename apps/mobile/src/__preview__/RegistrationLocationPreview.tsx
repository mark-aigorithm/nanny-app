/* Visual-validation harness for the mother's location step (see CLAUDE.md, Visual Validation Workflow). */
import React from 'react';

import RegistrationLocationScreen from '@mobile/screens/auth/RegistrationLocationScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { PreviewProviders } from './harness';

// A pin already dropped on No. 30 Street 11, so the pre-filled parts show.
useRegistrationDraftStore.setState({
  role: 'mother',
  latitude: 29.9602,
  longitude: 31.2569,
  address: '30 Street 11, Maadi, Cairo Governorate, Egypt',
  governorate: 'Cairo',
  area: 'Maadi',
  street: 'Street 11',
  building: '30',
});

export default function RegistrationLocationPreview() {
  return (
    <PreviewProviders>
      <RegistrationLocationScreen />
    </PreviewProviders>
  );
}
