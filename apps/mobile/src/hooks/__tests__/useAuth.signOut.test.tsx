import React from 'react';
import { NativeModules } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// `isNativePushAvailable()` reads `Constants.executionEnvironment`; jest-expo's
// own stub reports the Expo Go client, which would short-circuit every test to
// the "push unavailable" branch. Pretend to be a native build instead — the
// remaining half of the guard (`NativeModules.RNFBAppModule`) is what each test
// toggles to pick its branch.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone', expoConfig: { extra: {} } },
}));

// `usePushNotifications` imports expo-router for its notification-tap routing.
// Sign-out never reaches that code, but the import still has to resolve.
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockGetToken = jest.fn();
jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({
    requestPermission: jest.fn().mockResolvedValue(1),
    getToken: mockGetToken,
    onMessage: jest.fn(() => () => {}),
    onNotificationOpenedApp: jest.fn(() => () => {}),
    getInitialNotification: jest.fn().mockResolvedValue(null),
  }),
}));

import { api } from '@mobile/lib/api';
import { auth } from '@mobile/lib/firebase';
import { useSignOut } from '@mobile/hooks/useAuth';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const mockDelete = api.delete as jest.Mock;
const mockSignOut = auth().signOut as jest.Mock;

const FCM_TOKEN = 'fcm-token-for-this-device';

/** Both halves of `isNativePushAvailable()` — the native module is the toggle. */
function withNativePush(available: boolean): void {
  if (available) {
    (NativeModules as Record<string, unknown>)['RNFBAppModule'] = {};
  } else {
    delete (NativeModules as Record<string, unknown>)['RNFBAppModule'];
  }
}

// Tracks the mounted hook so afterEach can unmount it. Left mounted, the
// mutation's state settles after the test has finished — React logs an
// "update not wrapped in act(...)" warning and Jest's worker never exits.
let currentUnmount: (() => void) | null = null;

function renderSignOut() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useSignOut(), { wrapper: Wrapper });
  currentUnmount = rendered.unmount;
  return rendered;
}

describe('useSignOut', () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockDelete.mockResolvedValue({ data: { data: { removed: true }, error: null } });
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue(undefined);
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue(FCM_TOKEN);
    useUserProfileStore.setState({ profile: null });
  });

  afterEach(() => {
    currentUnmount?.();
    currentUnmount = null;
    withNativePush(false);
  });

  describe('when push is available (a native build)', () => {
    beforeEach(() => withNativePush(true));

    it('deletes this device\'s push token before signing out', async () => {
      const { result } = renderSignOut();

      await result.current.mutateAsync();

      expect(mockDelete).toHaveBeenCalledWith('/devices/push-token', {
        data: { token: FCM_TOKEN },
      });
      // Order matters: the axios interceptor signs the DELETE with
      // `auth().currentUser`'s JWT, which is null once sign-out completes.
      expect(mockDelete.mock.invocationCallOrder[0]).toBeLessThan(
        mockSignOut.mock.invocationCallOrder[0] as number,
      );
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('still signs out when the backend rejects the delete', async () => {
      mockDelete.mockRejectedValue(new Error('Network Error'));

      const { result } = renderSignOut();

      await result.current.mutateAsync();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('does not call the backend when the device has no token', async () => {
      mockGetToken.mockResolvedValue('');

      const { result } = renderSignOut();

      await result.current.mutateAsync();

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('when push is unavailable (Expo Go / no native module)', () => {
    beforeEach(() => withNativePush(false));

    it('signs out without touching messaging or the devices endpoint', async () => {
      const { result } = renderSignOut();

      await result.current.mutateAsync();

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  it('clears the cached profile once sign-out succeeds', async () => {
    withNativePush(true);
    useUserProfileStore.setState({
      profile: { id: 1, role: 'MOTHER' } as never,
    });

    const { result } = renderSignOut();

    await result.current.mutateAsync();

    await waitFor(() => expect(useUserProfileStore.getState().profile).toBeNull());
  });
});
