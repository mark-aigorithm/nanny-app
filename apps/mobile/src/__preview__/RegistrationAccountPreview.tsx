/* Visual-validation harness for "Secure your account" (see CLAUDE.md, Visual Validation Workflow). */
import React from 'react';

import { api } from '@mobile/lib/api';
import RegistrationAccountScreen from '@mobile/screens/auth/RegistrationAccountScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { PreviewProviders } from './harness';

// The screen sends a code on mount; there is no backend behind a preview, so
// stub the call rather than render the failure banner over the layout.
(api as unknown as { post: () => Promise<unknown> }).post = () =>
  Promise.resolve({ data: { data: null, error: null } });

// The email already proved, so the password half shows.
useRegistrationDraftStore.setState({
  role: 'nanny',
  email: 'amira.hassan@example.com',
  emailVerificationToken: 'preview-token',
  verifiedEmail: 'amira.hassan@example.com',
});

export default function RegistrationAccountPreview() {
  return (
    <PreviewProviders>
      <RegistrationAccountScreen />
    </PreviewProviders>
  );
}
