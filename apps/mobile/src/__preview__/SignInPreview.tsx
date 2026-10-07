/* Visual-validation harness for the signed-out landing (phone step). */
import React from 'react';

import SignInScreen from '@mobile/screens/auth/SignInScreen';
import { PreviewProviders } from './harness';

export default function SignInPreview() {
  return (
    <PreviewProviders>
      <SignInScreen />
    </PreviewProviders>
  );
}
