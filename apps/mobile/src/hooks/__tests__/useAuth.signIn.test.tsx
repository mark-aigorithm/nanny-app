import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSignInWithEmailAndPassword = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentUser: {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  providerData: { providerId: string }[];
  delete: jest.Mock;
  updatePassword: jest.Mock;
} | null = null;
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
  apiStatusOf: (e: unknown) => (e as { response?: { status?: number } })?.response?.status ?? null,
  isNotFound: (e: unknown) => (e as { response?: { status?: number } })?.response?.status === 404,
}));

const mockLinkPendingCredential = jest.fn();
jest.mock('@mobile/lib/pendingLink', () => ({
  linkPendingCredential: (...args: unknown[]) => mockLinkPendingCredential(...args),
}));

import {
  useConfirmPhoneAndResetPassword,
  useConfirmPhoneSignIn,
  useSignInWithEmail,
} from '@mobile/hooks/useAuth';
import { COULD_NOT_CONNECT } from '@mobile/lib/authErrors';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const CREDENTIAL = { providerId: 'google.com', token: 't', secret: '' };
const NOT_FOUND = { isAxiosError: true, response: { status: 404, data: {} } };
const SERVER_ERROR = { isAxiosError: true, response: { status: 500, data: {} } };
const PHONE = '+201234567890';
const NO_ACCOUNT = "We couldn't find an account for that number. Sign up first.";

/** A number Firebase has never seen: confirming the code mints a phone-only account. */
function phoneOnlyUser() {
  mockCurrentUser = {
    uid: 'uid-minted',
    email: null,
    phoneNumber: PHONE,
    providerData: [{ providerId: 'phone' }],
    delete: jest.fn().mockResolvedValue(undefined),
    updatePassword: jest.fn(),
  };
}

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
  mockCurrentUser = {
    uid: 'uid-registered',
    email: 'mona@example.com',
    phoneNumber: PHONE,
    providerData: [{ providerId: 'phone' }, { providerId: 'password' }],
    delete: jest.fn().mockResolvedValue(undefined),
    updatePassword: jest.fn().mockResolvedValue(undefined),
  };
  mockSignInWithEmailAndPassword.mockImplementation(async () => ({ user: mockCurrentUser }));
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

  it('links a parked credential onto an unfinished account — the password proved it is hers', async () => {
    // A phone+password leftover from an abandoned wizard: the root gate
    // resumes it, so the Google identity she came with rides along.
    parkCredential();
    mockGet.mockRejectedValue(NOT_FOUND);
    const { result } = wrap(() => useSignInWithEmail());

    await result.current.mutateAsync({ email: 'mona@example.com', password: 'Password1' });

    expect(mockLinkPendingCredential).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
    await settled(result);
  });

  it("says it couldn't connect when /auth/me fails otherwise, signing out but keeping the parked credential", async () => {
    parkCredential();
    mockGet.mockRejectedValue(SERVER_ERROR);
    const { result } = wrap(() => useSignInWithEmail());

    await expect(
      result.current.mutateAsync({ email: 'mona@example.com', password: 'Password1' }),
    ).rejects.toEqual({ field: 'form', message: COULD_NOT_CONNECT });

    expect(mockLinkPendingCredential).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending?.credential).toEqual(CREDENTIAL);
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

    await result.current.mutateAsync({ confirmation: confirmation as never, code: '111111', phone: PHONE });

    expect(useRegistrationDraftStore.getState()).toMatchObject({
      authProvider: 'phone',
      socialCredential: null,
      signUpUid: null,
    });
    // Collision A/B link from pendingLinkStore, which the reset leaves alone.
    expect(usePendingLinkStore.getState().pending?.credential).toEqual(CREDENTIAL);
    await settled(result);
  });

  it("resolves 'signed-in' when the account has a row", async () => {
    const { result } = wrap(() => useConfirmPhoneSignIn());

    await expect(
      result.current.mutateAsync({ confirmation: confirmation as never, code: '111111', phone: PHONE }),
    ).resolves.toBe('signed-in');
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
    await settled(result);
  });

  it('deletes a phone-only account Firebase just minted and says the number has no account', async () => {
    phoneOnlyUser();
    mockGet.mockRejectedValue(NOT_FOUND);
    const { result } = wrap(() => useConfirmPhoneSignIn());

    await expect(
      result.current.mutateAsync({ confirmation: confirmation as never, code: '111111', phone: PHONE }),
    ).rejects.toEqual({ field: 'phone', message: NO_ACCOUNT });
    expect(mockCurrentUser?.delete).toHaveBeenCalledTimes(1);
    await settled(result);
  });

  it("resolves 'needs-setup' for a phone+password leftover and deletes nothing", async () => {
    mockGet.mockRejectedValue(NOT_FOUND);
    const { result } = wrap(() => useConfirmPhoneSignIn());

    await expect(
      result.current.mutateAsync({ confirmation: confirmation as never, code: '111111', phone: PHONE }),
    ).resolves.toBe('needs-setup');
    expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    await settled(result);
  });

  it("signs out, resets the draft and says it couldn't connect on any other failure, keeping the parked credential", async () => {
    seedStaleSocialDraft();
    parkCredential();
    mockGet.mockRejectedValue(SERVER_ERROR);
    const { result } = wrap(() => useConfirmPhoneSignIn());

    await expect(
      result.current.mutateAsync({ confirmation: confirmation as never, code: '111111', phone: PHONE }),
    ).rejects.toEqual({ field: 'form', message: COULD_NOT_CONNECT });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(useRegistrationDraftStore.getState()).toMatchObject({ authProvider: 'phone', signUpUid: null });
    expect(usePendingLinkStore.getState().pending?.credential).toEqual(CREDENTIAL);
    expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
    await settled(result);
  });

  it('carries on when Android auto sign-in already consumed the code', async () => {
    const consumed = { confirm: jest.fn().mockRejectedValue({ code: 'auth/session-expired' }) };
    const { result } = wrap(() => useConfirmPhoneSignIn());

    await expect(
      result.current.mutateAsync({ confirmation: consumed as never, code: '111111', phone: PHONE }),
    ).resolves.toBe('signed-in');
    await settled(result);
  });

  it('maps a failed confirm when no one is signed in as that number', async () => {
    mockCurrentUser = null;
    const failed = { confirm: jest.fn().mockRejectedValue({ code: 'auth/invalid-verification-code' }) };
    const { result } = wrap(() => useConfirmPhoneSignIn());

    await expect(
      result.current.mutateAsync({ confirmation: failed as never, code: '000000', phone: PHONE }),
    ).rejects.toMatchObject({ field: expect.any(String) });
    expect(mockGet).not.toHaveBeenCalled();
    await settled(result);
  });
});

describe('useConfirmPhoneAndResetPassword', () => {
  const confirmation = { confirm: jest.fn().mockResolvedValue(undefined) };
  const vars = { confirmation: confirmation as never, code: '111111', phone: PHONE, newPassword: 'Password1' };

  it("updates the password for an account with a row and resolves 'password-updated'", async () => {
    const { result } = wrap(() => useConfirmPhoneAndResetPassword());

    await expect(result.current.mutateAsync(vars)).resolves.toBe('password-updated');
    expect(mockCurrentUser?.updatePassword).toHaveBeenCalledWith('Password1');
    await settled(result);
  });

  it("resolves 'needs-setup' for a leftover without touching its password", async () => {
    mockGet.mockRejectedValue(NOT_FOUND);
    const { result } = wrap(() => useConfirmPhoneAndResetPassword());

    await expect(result.current.mutateAsync(vars)).resolves.toBe('needs-setup');
    expect(mockCurrentUser?.updatePassword).not.toHaveBeenCalled();
    expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
    await settled(result);
  });

  it('discards a phone-only account Firebase just minted', async () => {
    phoneOnlyUser();
    mockGet.mockRejectedValue(NOT_FOUND);
    const { result } = wrap(() => useConfirmPhoneAndResetPassword());

    await expect(result.current.mutateAsync(vars)).rejects.toEqual({ field: 'phone', message: NO_ACCOUNT });
    expect(mockCurrentUser?.delete).toHaveBeenCalledTimes(1);
    expect(mockCurrentUser?.updatePassword).not.toHaveBeenCalled();
    await settled(result);
  });

  it('signs out, but never deletes, an account with a row and no email', async () => {
    // A row re-attached to a fresh phone-only Firebase account after its old
    // one was deleted: /auth/me finds the row, but there is no email to put a
    // password on. Deleting this Firebase account would orphan the row again.
    phoneOnlyUser();
    const { result } = wrap(() => useConfirmPhoneAndResetPassword());

    await expect(result.current.mutateAsync(vars)).rejects.toEqual({ field: 'phone', message: NO_ACCOUNT });
    expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockCurrentUser?.updatePassword).not.toHaveBeenCalled();
    await settled(result);
  });

  it("says it couldn't connect on any other failure and writes no password", async () => {
    mockGet.mockRejectedValue(SERVER_ERROR);
    const { result } = wrap(() => useConfirmPhoneAndResetPassword());

    await expect(result.current.mutateAsync(vars)).rejects.toEqual({ field: 'form', message: COULD_NOT_CONNECT });
    expect(mockCurrentUser?.updatePassword).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    await settled(result);
  });
});
