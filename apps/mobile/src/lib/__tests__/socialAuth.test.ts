import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';

let mockExtra: Record<string, unknown> = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

const mockGoogleCredential = jest.fn((token: string) => ({ providerId: 'google.com', token, secret: '' }));
const mockAppleCredential = jest.fn((token: string, secret: string) => ({ providerId: 'apple.com', token, secret }));
// Getters: the factory runs before the consts above are assigned.
jest.mock('@mobile/lib/firebase', () => {
  const authFn = () => ({});
  Object.defineProperty(authFn, 'GoogleAuthProvider', {
    enumerable: true,
    get: () => ({ credential: mockGoogleCredential }),
  });
  Object.defineProperty(authFn, 'AppleAuthProvider', {
    enumerable: true,
    get: () => ({ credential: mockAppleCredential }),
  });
  return { auth: authFn };
});

import {
  getAppleAuthorizationCode,
  getAppleCredential,
  getGoogleCredential,
  isAppleSignInAvailable,
  signOutOfGoogle,
} from '@mobile/lib/socialAuth';
import { useE2eGooglePickerStore } from '@mobile/store/e2eGooglePickerStore';

const mockSignIn = GoogleSignin.signIn as jest.Mock;
const mockHasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;
const mockConfigure = GoogleSignin.configure as jest.Mock;
const mockGoogleSignOut = GoogleSignin.signOut as jest.Mock;
const mockAppleSignIn = AppleAuthentication.signInAsync as jest.Mock;
const mockAppleAvailable = AppleAuthentication.isAvailableAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockExtra = { googleWebClientId: 'web-client-id' };
  mockHasPlayServices.mockResolvedValue(true);
});

describe('getGoogleCredential', () => {
  it('turns the Google ID token into a Firebase credential and passes the profile along', async () => {
    mockSignIn.mockResolvedValue({
      type: 'success',
      data: { idToken: 'google-id-token', user: { givenName: 'Salma', familyName: 'Ali', email: 'salma@gmail.com' } },
    });

    const result = await getGoogleCredential();

    expect(mockConfigure).toHaveBeenCalledWith({ webClientId: 'web-client-id' });
    expect(mockGoogleCredential).toHaveBeenCalledWith('google-id-token');
    expect(result).toEqual({
      provider: 'google',
      credential: { providerId: 'google.com', token: 'google-id-token', secret: '' },
      profile: { firstName: 'Salma', lastName: 'Ali', email: 'salma@gmail.com' },
    });
  });

  it('returns null when the user closes the sheet', async () => {
    mockSignIn.mockResolvedValue({ type: 'cancelled', data: null });

    await expect(getGoogleCredential()).resolves.toBeNull();
    expect(mockGoogleCredential).not.toHaveBeenCalled();
  });

  it('explains when Google Play services are missing', async () => {
    mockHasPlayServices.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });

    await expect(getGoogleCredential()).rejects.toEqual({
      field: 'form',
      message: 'Google sign-in needs Google Play services on this device.',
    });
  });

  it('fails with generic copy when Google returns no ID token', async () => {
    mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: null, user: { email: 'x@gmail.com' } } });

    await expect(getGoogleCredential()).rejects.toEqual({
      field: 'form',
      message: 'Google sign-in failed. Please try again.',
    });
  });

  it('uses the E2E picker instead of Google when the app points at the Auth emulator', async () => {
    mockExtra = { firebaseAuthEmulatorHost: '10.0.2.2:9099' };

    const pending = getGoogleCredential();
    await Promise.resolve();
    useE2eGooglePickerStore.getState().settle('Mona@Test.local');
    const result = await pending;

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockGoogleCredential).toHaveBeenCalledWith(
      JSON.stringify({ sub: 'e2e-mona@test.local', email: 'mona@test.local', email_verified: true, name: 'E2E Google' }),
    );
    expect(result?.profile).toEqual({ firstName: 'E2E', lastName: 'Google', email: 'mona@test.local' });
  });

  it('returns null when the E2E picker is cancelled', async () => {
    mockExtra = { firebaseAuthEmulatorHost: '10.0.2.2:9099' };

    const pending = getGoogleCredential();
    await Promise.resolve();
    useE2eGooglePickerStore.getState().settle(null);

    await expect(pending).resolves.toBeNull();
  });
});

describe('getAppleCredential', () => {
  it('sends Apple the hashed nonce and Firebase the raw one', async () => {
    mockAppleSignIn.mockResolvedValue({
      identityToken: 'apple-id-token',
      fullName: { givenName: 'Mona', familyName: 'Adel' },
      email: 'abc@privaterelay.appleid.com',
    });

    const result = await getAppleCredential();

    expect(mockAppleSignIn).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: 'hashed-nonce' });
    expect(mockAppleCredential).toHaveBeenCalledWith('apple-id-token', 'raw-nonce');
    expect(result?.profile).toEqual({ firstName: 'Mona', lastName: 'Adel', email: 'abc@privaterelay.appleid.com' });
  });

  it('returns blank names when Apple withholds them on a repeat sign-in', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-id-token', fullName: null, email: null });

    const result = await getAppleCredential();

    expect(result?.profile).toEqual({ firstName: '', lastName: '', email: null });
  });

  it('returns null when the user cancels', async () => {
    mockAppleSignIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });

    await expect(getAppleCredential()).resolves.toBeNull();
  });
});

describe('getAppleAuthorizationCode', () => {
  it('asks Apple for no scopes and hands back the authorization code', async () => {
    mockAppleSignIn.mockResolvedValue({ authorizationCode: 'apple-auth-code', identityToken: 'apple-id-token' });

    await expect(getAppleAuthorizationCode()).resolves.toBe('apple-auth-code');
    expect(mockAppleSignIn).toHaveBeenCalledWith({ requestedScopes: [] });
  });

  it('returns null when the user cancels', async () => {
    mockAppleSignIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });

    await expect(getAppleAuthorizationCode()).resolves.toBeNull();
  });

  it('fails with generic copy when Apple returns no code', async () => {
    mockAppleSignIn.mockResolvedValue({ authorizationCode: null, identityToken: 'apple-id-token' });

    await expect(getAppleAuthorizationCode()).rejects.toEqual({
      field: 'form',
      message: 'Apple sign-in failed. Please try again.',
    });
  });

  it('fails with generic copy on any other error', async () => {
    mockAppleSignIn.mockRejectedValue({ code: 'ERR_REQUEST_FAILED' });

    await expect(getAppleAuthorizationCode()).rejects.toEqual({
      field: 'form',
      message: 'Apple sign-in failed. Please try again.',
    });
  });
});

describe('isAppleSignInAvailable', () => {
  it('is false on Android without asking the native module', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    await expect(isAppleSignInAvailable()).resolves.toBe(false);
    expect(mockAppleAvailable).not.toHaveBeenCalled();
  });

  it('asks the native module on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockAppleAvailable.mockResolvedValue(true);

    await expect(isAppleSignInAvailable()).resolves.toBe(true);
  });
});

describe('signOutOfGoogle', () => {
  it('never throws', async () => {
    mockGoogleSignOut.mockRejectedValue(new Error('not signed in'));

    await expect(signOutOfGoogle()).resolves.toBeUndefined();
  });
});
