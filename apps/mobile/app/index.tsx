import { Redirect } from 'expo-router';

import { useRootGate } from '@mobile/hooks/useRootGate';
import CouldNotConnectScreen from '@mobile/screens/CouldNotConnectScreen';

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
