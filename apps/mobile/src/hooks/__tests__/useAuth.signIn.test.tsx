import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSignInWithEmailAndPassword = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentUser: { uid: string; providerData: { providerId: string }[]; delete: jest.Mock } | null = null;
// babel-plugin-jest-hoist only lets a jest.mock() factory close over
// variables whose name starts with "mock".
jest.mock('@mobile/lib/firebase', () => ({
  auth: Object.assign(
    () => ({
      signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
      signOut: mockSignOut,
      get currentUser() {
        return mockCurrentUser;
      },
    }),
    { EmailAuthProvider: { credential: jest.fn() } },
  ),
}));

const mockGet = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  unwrap: async (p: Promise<{ data: { data: unknown } }>) => (await p).data.data,
  getApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const mockLinkPendingCredential = jest.fn();
jest.mock('@mobile/lib/pendingLink', () => ({
  linkPendingCredential: (...args: unknown[]) => mockLinkPendingCredential(...args),
}));

import { useConfirmPhoneSignIn, useSignInWithEmail } from '@mobile/hooks/useAuth';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const CREDENTIAL = { providerId: 'google.com', token: 't', secret: '' };
const NOT_FOUND = { isAxiosError: true, response: { status: 404, data: {} } };
const SERVER_ERROR = { isAxiosError: true, response: { status: 500, data: {} } };

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

/** An unfinished Google sign-up from earlier on this device. */
function seedStaleSocialDraft() {
  useRegistrationDraftStore.getState().patch({
    authProvider: 'google',
    socialCredential: CREDENTIAL as never,
    signUpUid: 'uid-social',
    email: 'someone@gmail.com',
  });
}

function parkCredential() {
  usePendingLinkStore.getState().set({ provider: 'google', credential: CREDENTIAL as never, phoneHint: null });
}

// Lets the mutation observer settle before the test (and its afterEach
// unmount) proceeds, so React's state update isn't left dangling outside act().
async function settled(result: { current: { isSuccess: boolean; isError: boolean } }) {
  await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { uid: 'uid-registered', providerData: [{ providerId: 'phone' }], delete: jest.fn() };
  mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-registered' } });
  mockSignOut.mockResolvedValue(undefined);
  mockGet.mockResolvedValue({ data: { data: { id: 1 }, error: null } });
  mockLinkPendingCredential.mockImplementation(async () => {
    usePendingLinkStore.getState().clear();
  });
  usePendingLinkStore.getState().clear();
  useRegistrationDraftStore.getState().reset();
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
});

describe('useSignInWithEmail', () => {
  it('links a parked Google identity once /auth/me proves the account is real', async () => {
    parkCredential();
    const { result } = wrap(() => useSignInWithEmail());

    await result.current.mutateAsync({ email: 'Mona@Example.com', password: 'Password1' });

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith('mona@example.com', 'Password1');
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
    expect(mockLinkPendingCredential).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.invocationCallOrder[0]).toBeLessThan(
      mockLinkPendingCredential.mock.invocationCallOrder[0] as number,
    );
    await settled(result);
  });

  it('never links onto a Firebase account that has no row, and drops the parked credential', async () => {
    // A phone+password leftover from an abandoned phone wizard: the password
    // is right, but nothing proves this is anyone's account.
    parkCredential();
    mockGet.mockRejectedValue(NOT_FOUND);
    const { result } = wrap(() => useSignInWithEmail());

    // Still resolves: the root router signs a row-less account out, as before.
    await result.current.mutateAsync({ email: 'mona@example.com', password: 'Password1' });

    expect(mockLinkPendingCredential).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending).toBeNull();
    await settled(result);
  });

  it('does not link when /auth/me fails for any other reason', async () => {
    parkCredential();
    mockGet.mockRejectedValue(SERVER_ERROR);
    const { result } = wrap(() => useSignInWithEmail());

    await result.current.mutateAsync({ email: 'mona@example.com', password: 'Password1' });

    expect(mockLinkPendingCredential).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending).toBeNull();
    await settled(result);
  });

  it('drops an unfinished social sign-up once signed in', async () => {
    seedStaleSocialDraft();
    const { result } = wrap(() => useSignInWithEmail());

    await result.current.mutateAsync({ email: 'mona@example.com', password: 'Password1' });

    expect(useRegistrationDraftStore.getState()).toMatchObject({ authProvider: 'phone', signUpUid: null });
    await settled(result);
  });

  it('maps a wrong password and asks the backend nothing', async () => {
    parkCredential();
    mockSignInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });
    const { result } = wrap(() => useSignInWithEmail());

    await expect(
      result.current.mutateAsync({ email: 'mona@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ message: 'Incorrect email or password.' });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockLinkPendingCredential).not.toHaveBeenCalled();
    // Kept for another try at the password.
    expect(usePendingLinkStore.getState().pending).not.toBeNull();
    await settled(result);
  });
});

describe('useConfirmPhoneSignIn', () => {
  const confirmation = { confirm: jest.fn().mockResolvedValue(undefined) };

  it('drops an unfinished social sign-up once signed in, leaving the parked link for the screen', async () => {
    seedStaleSocialDraft();
    parkCredential();
    const { result } = wrap(() => useConfirmPhoneSignIn());

    await result.current.mutateAsync({ confirmation: confirmation as never, code: '111111' });

    expect(useRegistrationDraftStore.getState()).toMatchObject({
      authProvider: 'phone',
      socialCredential: null,
      signUpUid: null,
    });
    // Collision A/B link from pendingLinkStore, which the reset leaves alone.
    expect(usePendingLinkStore.getState().pending?.credential).toEqual(CREDENTIAL);
    await settled(result);
  });
});
