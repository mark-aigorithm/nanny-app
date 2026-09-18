import { NativeModules } from 'react-native';

// `isNativePushAvailable()` reads `Constants.executionEnvironment`; jest-expo's
// stub reports Expo Go, which would short-circuit to "push unavailable".
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone', expoConfig: { extra: {} } },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockRequestPermission = jest.fn();
const mockGetToken = jest.fn();
jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({
    requestPermission: mockRequestPermission,
    getToken: mockGetToken,
    onMessage: jest.fn(() => () => {}),
    onNotificationOpenedApp: jest.fn(() => () => {}),
    getInitialNotification: jest.fn().mockResolvedValue(null),
  }),
}));

const mockRequestPermissionsAsync = jest.fn().mockResolvedValue({ granted: true });
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: mockRequestPermissionsAsync,
}));

import { api } from '@mobile/lib/api';
import { requestPushPermissionAndRegister } from '@mobile/hooks/usePushNotifications';

const mockPost = api.post as jest.Mock;

/** RNFirebase's AuthorizationStatus: 1 = AUTHORIZED, 2 = PROVISIONAL, 0 = DENIED. */
const AUTHORIZED = 1;
const DENIED = 0;

beforeEach(() => {
  jest.clearAllMocks();
  (NativeModules as Record<string, unknown>)['RNFBAppModule'] = {};
  mockGetToken.mockResolvedValue('fcm-token-for-this-device');
  mockPost.mockResolvedValue({ data: { data: { ok: true }, error: null } });
});

afterEach(() => {
  delete (NativeModules as Record<string, unknown>)['RNFBAppModule'];
});

describe('requestPushPermissionAndRegister', () => {
  it('registers the device with the backend once the user allows notifications', async () => {
    mockRequestPermission.mockResolvedValue(AUTHORIZED);

    await expect(requestPushPermissionAndRegister()).resolves.toBe(true);

    expect(mockPost).toHaveBeenCalledWith('/devices/push-token', {
      token: 'fcm-token-for-this-device',
      platform: expect.stringMatching(/^(ios|android)$/),
    });
  });

  it('registers nothing when the user denies, and does not throw', async () => {
    mockRequestPermission.mockResolvedValue(DENIED);

    await expect(requestPushPermissionAndRegister()).resolves.toBe(false);

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('never lets a backend failure block the flow', async () => {
    mockRequestPermission.mockResolvedValue(AUTHORIZED);
    mockPost.mockRejectedValue(new Error('Network Error'));

    await expect(requestPushPermissionAndRegister()).resolves.toBe(false);
  });
});
