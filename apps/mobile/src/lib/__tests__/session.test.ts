const mockUnregisterPushToken = jest.fn();
jest.mock('@mobile/hooks/usePushNotifications', () => ({
  unregisterPushToken: (...args: unknown[]) => mockUnregisterPushToken(...args),
}));

const mockSignOutOfGoogle = jest.fn();
jest.mock('@mobile/lib/socialAuth', () => ({
  signOutOfGoogle: (...args: unknown[]) => mockSignOutOfGoogle(...args),
}));

import { auth } from '@mobile/lib/firebase';
import { queryClient } from '@mobile/lib/queryClient';
import { clearLocalSession } from '@mobile/lib/session';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const mockSignOut = auth().signOut as jest.Mock;
const CREDENTIAL = { providerId: 'google.com', token: 't', secret: '' };

function seedEverything() {
  usePendingLinkStore.getState().set({ provider: 'google', credential: CREDENTIAL as never, phoneHint: null });
  useRegistrationDraftStore.getState().patch({ authProvider: 'google', signUpUid: 'uid-1', email: 'a@b.co' });
  useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never });
  queryClient.setQueryData(['auth', 'me', 'uid-1'], { id: 1 });
}

function expectEverythingCleared() {
  expect(usePendingLinkStore.getState().pending).toBeNull();
  expect(useRegistrationDraftStore.getState()).toMatchObject({ authProvider: 'phone', signUpUid: null, email: '' });
  expect(useUserProfileStore.getState().profile).toBeNull();
  expect(queryClient.getQueryData(['auth', 'me', 'uid-1'])).toBeUndefined();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUnregisterPushToken.mockResolvedValue(true);
  mockSignOutOfGoogle.mockResolvedValue(undefined);
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue(undefined);
  usePendingLinkStore.getState().clear();
  useRegistrationDraftStore.getState().reset();
  useUserProfileStore.setState({ profile: null });
  queryClient.clear();
});

afterAll(() => queryClient.clear());

describe('clearLocalSession', () => {
  it('releases the push token, then signs out, then forgets Google', async () => {
    seedEverything();

    await clearLocalSession();

    const push = mockUnregisterPushToken.mock.invocationCallOrder[0] as number;
    const signOut = mockSignOut.mock.invocationCallOrder[0] as number;
    const google = mockSignOutOfGoogle.mock.invocationCallOrder[0] as number;
    expect(push).toBeLessThan(signOut);
    expect(signOut).toBeLessThan(google);
    expectEverythingCleared();
  });

  it('clears the parked link and the draft before the sign-out call', async () => {
    seedEverything();
    let seenAtSignOut: { pending: unknown; signUpUid: string | null } | null = null;
    mockSignOut.mockImplementation(async () => {
      seenAtSignOut = {
        pending: usePendingLinkStore.getState().pending,
        signUpUid: useRegistrationDraftStore.getState().signUpUid,
      };
    });

    await clearLocalSession();

    expect(seenAtSignOut).toEqual({ pending: null, signUpUid: null });
  });

  it('still clears everything and forgets Google when the sign-out throws, then rethrows', async () => {
    seedEverything();
    const failure = { code: 'auth/network-request-failed' };
    mockSignOut.mockRejectedValue(failure);

    await expect(clearLocalSession()).rejects.toBe(failure);

    expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
    expectEverythingCleared();
  });
});
