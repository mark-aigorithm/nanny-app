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
    phoneNumber: null,
    linkWithCredential: mockLinkWithCredential,
    unlink: mockUnlink,
    getIdToken: mockGetIdToken,
  };
  mockLinkWithCredential.mockResolvedValue(undefined);
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

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891' });

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
    });

    expect(mockPhoneCredential).toHaveBeenCalledWith(null);
    await settled(result);
  });

  it('flags a number that belongs to another account', async () => {
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/credential-already-in-use' });
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await expect(
      result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891' }),
    ).rejects.toMatchObject({ field: 'phone', code: 'auth/credential-already-in-use' });
    await settled(result);
  });

  it('treats the same number already linked (a retry) as done', async () => {
    mockCurrentUser!.phoneNumber = '+201234567891';
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/provider-already-linked' });
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891' });

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
    await settled(result);
  });

  it('swaps a different number left by an abandoned attempt', async () => {
    mockCurrentUser!.phoneNumber = '+201111111111';
    mockLinkWithCredential
      .mockRejectedValueOnce({ code: 'auth/provider-already-linked' })
      .mockResolvedValueOnce(undefined);
    const { result } = wrap(() => useLinkPhoneToCurrentUser());

    await result.current.mutateAsync({ challenge: CHALLENGE, code: '111111', phone: '+201234567891' });

    expect(mockUnlink).toHaveBeenCalledWith('phone');
    expect(mockLinkWithCredential).toHaveBeenCalledTimes(2);
    await settled(result);
  });
});
