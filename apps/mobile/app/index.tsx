import { Redirect } from 'expo-router';

import { useRootGate } from '@mobile/hooks/useRootGate';
import CouldNotConnectScreen from '@mobile/screens/CouldNotConnectScreen';

/**
 * The app root. `useRootGate` decides where a launch (or a sign-in routed
 * back through `/`) belongs: signed-out non-guests go to the sign-in landing,
 * a row-less account resumes its sign-up, everyone else to their area. When
 * `/auth/me` fails for any reason but "no account", she stays signed in and
 * sees CouldNotConnectScreen.
 */
export default function Index() {
  const gate = useRootGate();

  switch (gate.kind) {
    case 'wait':
      return null;
    case 'redirect':
      return <Redirect href={gate.href} />;
    case 'error':
      return (
        <CouldNotConnectScreen onRetry={gate.retry} onSignOut={gate.signOut} isSigningOut={gate.isSigningOut} />
      );
  }
}
