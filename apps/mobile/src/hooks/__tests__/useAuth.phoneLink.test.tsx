import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Snapshot = { state: string; verificationId: string | null; code: string | null; error?: unknown };
let mockObserver: ((s: Snapshot) => void) | null = null;
const mockVerifyPhoneNumber = jest.fn(() => ({
  on: (_event: string, observer: (s: Snapshot) => void) => {
    mockObserver = observer;
  },
}));
const mockPhoneCredential = jest.fn((verificationId: string | null, code?: string) => ({ verificationId, code }));
const mockLinkWithCredential = jest.fn();
const mockUnlink = jest.fn();
const mockGetIdToken = jest.fn();
let mockCurrentUser: {
  uid: string;
  phoneNumber: string | null;
  linkWithCredential: jest.Mock;
  unlink: jest.Mock;
  getIdToken: jest.Mock;
} | null = null;

jest.mock('@mobile/lib/firebase', () => {
  const authFn = () => ({
    verifyPhoneNumber: mockVerifyPhoneNumber,
    get currentUser() {
      return mockCurrentUser;
    },
  });
  Object.defineProperty(authFn, 'PhoneAuthProvider', {
    enumerable: true,
    get: () => ({ credential: mockPhoneCredential }),
  });
  return { auth: authFn };
});

import { useLinkPhoneToCurrentUser, useSendPhoneLinkCode } from '@mobile/hooks/useAuth';

let currentUnmount: (() => void) | null = null;
function wrap<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(hook, { wrapper: Wrapper });
  currentUnmount = rendered.unmount;
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockObserver = null;
  mockCurrentUser = {
    uid: 'uid-social',
    phoneNumber: null,
    linkWithCredential: mockLinkWithCredential,
    unlink: mockUnlink,
    getIdToken: mockGetIdToken,
  };
  mockLinkWithCredential.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
  mockGetIdToken.mockResolvedValue('token');
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
});

// Lets the mutation observer settle before the test (and its afterEach
// unmount) proceeds, so React's state update isn't left dangling outside act().
async function settled(result: { current: { isSuccess: boolean; isError: boolean } }) {
  await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
}

describe('useSendPhoneLinkCode', () => {
  it('resolves as soon as the code is sent — without signing anyone in', async () => {
    const { result } = wrap(() => useSendPhoneLinkCode());
    const pending = result.current.mutateAsync({ phone: '+201234567891' });
    await Promise.resolve();
    mockObserver?.({ state: 'sent', verificationId: 'vid', code: null });

    await expect(pending).resolves.toEqual({ verificationId: 'vid', autoVerified: false, code: null });
    expect(mockVerifyPhoneNumber).toHaveBeenCalledWith('+201234567891', false);
    await settled(result);
  });

  it('reports an Android auto-verification with its code', async () => {
    const { result } = wrap(() => useSendPhoneLinkCode());
    const pending = result.current.mutateAsync({ phone: '+201234567891', forceResend: true });
    await Promise.resolve();
    mockObserver?.({ state: 'verified', verificationId: 'vid', code: '123456' });

    await expect(pending).resolves.toEqual({ verificationId: 'vid', autoVerified: true, code: '123456' });
    expect(mockVerifyPhoneNumber).toHaveBeenCalledWith('+201234567891', true);
    await settled(result);
  });

  it('maps a failure', async () => {
    const { result } = wrap(() => useSendPhoneLinkCode());
    const pending = result.current.mutateAsync({ phone: '+20' });
    await Promise.resolve();
    mockObserver?.({ state: 'error', verificationId: null, code: null, error: { code: 'auth/invalid-phone-number' } });

    await expect(pending).rejects.toEqual({ field: 'phone', message: "That phone number doesn't look right." });
    await settled(result);
  });
});

describe('useLinkPhoneToCurrentUser', () => {
  const CHALLENGE = { verificationId: 'vid', autoVerified: false, code: null };

  it('links the phone onto the signed-in account and refreshes the token', async () => {
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891', signUpUid: 'uid-social' });

    expect(mockPhoneCredential).toHaveBeenCalledWith('vid', '111111');
    expect(mockLinkWithCredential).toHaveBeenCalledWith({ verificationId: 'vid', code: '111111' });
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
    await settled(result);
  });

  it("uses the native side's credential after an instant verification", async () => {
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({
      challenge: { verificationId: null, autoVerified: true, code: null },
      code: '',
      phone: '+201234567891',
      signUpUid: 'uid-social',
    });

    expect(mockPhoneCredential).toHaveBeenCalledWith(null);
    expect(mockLinkWithCredential).toHaveBeenCalledTimes(1);
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
    await settled(result);
  });

  it('flags a number that belongs to another account', async () => {
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/credential-already-in-use' });
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await expect(
      result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891', signUpUid: 'uid-social' }),
    ).rejects.toMatchObject({ field: 'phone', code: 'auth/credential-already-in-use' });
    await settled(result);
  });

  it('treats the same number already linked (a retry) as done, without spending a credential', async () => {
    mockCurrentUser!.phoneNumber = '+201234567891';
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891', signUpUid: 'uid-social' });

    expect(mockPhoneCredential).not.toHaveBeenCalled();
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
    await settled(result);
  });

  it('unlinks a different number left by an abandoned attempt before linking once', async () => {
    mockCurrentUser!.phoneNumber = '+201111111111';
    const order: string[] = [];
    mockUnlink.mockImplementation(async () => {
      order.push('unlink');
    });
    mockLinkWithCredential.mockImplementation(async () => {
      order.push('link');
    });
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891', signUpUid: 'uid-social' });

    expect(mockUnlink).toHaveBeenCalledWith('phone');
    expect(order).toEqual(['unlink', 'link']);
    await settled(result);
  });

  it('maps an unexpected provider-already-linked from the single link like any other failure', async () => {
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/provider-already-linked' });
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await expect(
      result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891', signUpUid: 'uid-social' }),
    ).rejects.toEqual({ field: 'form', message: 'Something went wrong. Please try again.' });
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockGetIdToken).not.toHaveBeenCalled();
    await settled(result);
  });

  it('never re-spends an instant-verification credential when Complete setup is retried', async () => {
    // The native side hands its cached credential out for one link and then
    // forgets it: a second `credential(null)` link is refused. A link that
    // lands puts the number on the account, as RNFB's currentUser reflects.
    let nativeCredentialCached = true;
    mockLinkWithCredential.mockImplementation(async (credential: { verificationId: string | null }) => {
      if (credential.verificationId === null) {
        if (!nativeCredentialCached) throw { code: 'auth/invalid-credential' };
        nativeCredentialCached = false;
      }
      mockCurrentUser!.phoneNumber = '+201234567891';
    });
    const INSTANT = { verificationId: null, autoVerified: true, code: null };
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: INSTANT, code: '', phone: '+201234567891', signUpUid: 'uid-social' });
    // Register (or an ID upload) failed further down; she taps Complete setup again.
    await result.current.mutateAsync({ challenge: INSTANT, code: '', phone: '+201234567891', signUpUid: 'uid-social' });

    expect(mockLinkWithCredential).toHaveBeenCalledTimes(1);
    expect(mockGetIdToken).toHaveBeenCalledTimes(2);
    await settled(result);
  });

  const SESSION_ENDED = {
    field: 'form',
    message: 'Your session ended. Please start again.',
    code: 'session-mismatch',
  };

  it('skips the link when the account already holds the number (challenge: null)', async () => {
    mockCurrentUser!.phoneNumber = '+201234567891';
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: null, code: '', phone: '+201234567891', signUpUid: 'uid-social' });

    expect(mockPhoneCredential).not.toHaveBeenCalled();
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
    await settled(result);
  });

  it('refuses challenge: null when the account does not hold that number', async () => {
    mockCurrentUser!.phoneNumber = '+201111111111';
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await expect(
      result.current.mutateAsync({ challenge: null, code: '', phone: '+201234567891', signUpUid: 'uid-social' }),
    ).rejects.toEqual(SESSION_ENDED);
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
    expect(mockGetIdToken).not.toHaveBeenCalled();
    await settled(result);
  });

  it('refuses to touch an account the wizard did not create', async () => {
    // A registered account (say, signed in by SMS on this device since) holds
    // a phone of its own: unlinking it would strip that account's number.
    mockCurrentUser!.uid = 'uid-registered';
    mockCurrentUser!.phoneNumber = '+201111111111';
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await expect(
      result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891', signUpUid: 'uid-social' }),
    ).rejects.toEqual(SESSION_ENDED);
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
    expect(mockGetIdToken).not.toHaveBeenCalled();
    await settled(result);
  });

  it('refuses when the draft never recorded which account it created', async () => {
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await expect(
      result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891', signUpUid: null }),
    ).rejects.toEqual(SESSION_ENDED);
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
    await settled(result);
  });

  it('refuses when nobody is signed in', async () => {
    mockCurrentUser = null;
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await expect(
      result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891', signUpUid: 'uid-social' }),
    ).rejects.toEqual(SESSION_ENDED);
    await settled(result);
  });
});
