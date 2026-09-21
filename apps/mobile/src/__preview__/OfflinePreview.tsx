/* Visual-validation harness for the offline overlay. */
import React from 'react';

import OfflineScreen from '@mobile/screens/OfflineScreen';
import { PreviewProviders } from './harness';

// Resolves after a beat so the button's loading spinner is visible in a screenshot.
const fakeRetry = () => new Promise<void>((resolve) => setTimeout(resolve, 1500));

export default function OfflinePreview() {
  return (
    <PreviewProviders>
      <OfflineScreen onRetry={fakeRetry} />
    </PreviewProviders>
  );
}
