/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';

import { api } from '@mobile/lib/api';
import RegistrationNannyEmailScreen from '@mobile/screens/auth/RegistrationNannyEmailScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { PreviewProviders, setPreviewParams } from './harness';

setPreviewParams({ role: 'nanny' });

// The screen sends a code on mount; there is no backend behind a preview, so
// stub the call rather than render the failure banner over the layout.
(api as unknown as { post: () => Promise<unknown> }).post = () =>
  Promise.resolve({ data: { data: null, error: null } });

useRegistrationDraftStore.setState({ email: 'amira.hassan@example.com' });

export default function NannyEmailPreview() {
  return (
    <PreviewProviders>
      <RegistrationNannyEmailScreen />
    </PreviewProviders>
  );
}
