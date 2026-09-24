import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSignInWithCredential = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentUser: {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  displayName: string | null;
  providerData: { providerId: string; email?: string; phoneNumber?: string }[];
  delete: jest.Mock;
} | null = null;
jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    signInWithCredential: mockSignInWithCredential,
    signOut: mockSignOut,
    get currentUser() {
      return mockCurrentUser;
    },
  }),
}));

const mockGetSocialCredential = jest.fn();
const mockSignOutOfGoogle = jest.fn();
jest.mock('@mobile/lib/socialAuth', () => ({
  getSocialCredential: (...args: unknown[]) => mockGetSocialCredential(...args),
  signOutOfGoogle: (...args: unknown[]) => mockSignOutOfGoogle(...args),
  SOCIAL_PROVIDER_LABEL: { google: 'Google', apple: 'Apple' },
}));

const mockGet = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  getApiErrorMessage: (_e: unknown, fallback: string) => fallback,
  apiStatusOf: (e: unknown) => (e as { response?: { status?: number } })?.response?.status ?? null,
  isNotFound: (e: unknown) => (e as { response?: { status?: number } })?.response?.status === 404,
}));

import { useSocialSignIn } from '@mobile/hooks/useSocialSignIn';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const CREDENTIAL = { providerId: 'google.com', token: 'google-id-token', secret: '' };
const RESULT = {
  provider: 'google',
  credential: CREDENTIAL,
  profile: { firstName: 'Salma', lastName: 'Ali', email: 'salma@gmail.com' },
};
const NOT_FOUND = { isAxiosError: true, response: { status: 404, data: {} } };
const SERVER_ERROR = { isAxiosError: true, response: { status: 500, data: {} } };

function newUser(overrides: Partial<NonNullable<typeof mockCurrentUser>> = {}) {
  return {
    uid: 'uid-new',
    email: 'salma@gmail.com',
    emailVerified: true,
    phoneNumber: null,
    displayName: 'Salma Ali',
    providerData: [{ providerId: 'google.com', email: 'salma@gmail.com' }],
    delete: jest.fn(),
    ...overrides,
  };
}

/** A social sign-up someone started earlier and never finished. */
function seedStaleSocialDraft() {
  useRegistrationDraftStore.getState().patch({
    authProvider: 'apple',
    socialCredential: { providerId: 'apple.com', token: 'old', secret: 'n' } as never,
    signUpUid: 'uid-old',
    email: 'old@privaterelay.appleid.com',
    firstName: 'Old',
  });
}

function expectDraftCleared() {
  expect(useRegistrationDraftStore.getState()).toMatchObject({
    authProvider: 'phone',
    socialCredential: null,
    signUpUid: null,
    email: '',
    firstName: '',
  });
}

let currentUnmount: (() => void) | null = null;
function renderSocialSignIn() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useSocialSignIn(), { wrapper: Wrapper });
  currentUnmount = rendered.unmount;
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = newUser();
  mockGetSocialCredential.mockResolvedValue(RESULT);
  mockSignInWithCredential.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
  mockSignOutOfGoogle.mockResolvedValue(undefined);
  mockGet.mockResolvedValue({ data: { data: { id: 1 }, error: null } });
  usePendingLinkStore.getState().clear();
  useRegistrationDraftStore.getState().reset();
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
});

it('does nothing when the sheet is closed', async () => {
  mockGetSocialCredential.mockResolvedValue(null);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('cancelled');
  expect(mockSignInWithCredential).not.toHaveBeenCalled();
  // Let the mutation observer settle before the test (and its afterEach
  // unmount) proceeds, so React's state update isn't left dangling outside act().
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('signs an existing account straight in', async () => {
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('signed-in');
  expect(mockSignInWithCredential).toHaveBeenCalledWith(CREDENTIAL);
  expect(useRegistrationDraftStore.getState().authProvider).toBe('phone');
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('keeps a brand-new account and seeds the social draft', async () => {
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google', role: 'parent' })).resolves.toBe('new-user');

  const draft = useRegistrationDraftStore.getState();
  expect(draft).toMatchObject({
    role: 'parent',
    authProvider: 'google',
    socialCredential: CREDENTIAL,
    // Which Firebase account this sign-up owns: the only one collision B may
    // delete, and the only one step 3 may link a phone onto.
    signUpUid: 'uid-new',
    firstName: 'Salma',
    lastName: 'Ali',
    email: 'salma@gmail.com',
  });
  expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
  // Only a collision may park a credential for linking.
  expect(usePendingLinkStore.getState().pending).toBeNull();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('carries a phone already linked to the Google account into the draft', async () => {
  mockGet.mockRejectedValue(NOT_FOUND);
  mockCurrentUser = newUser({
    phoneNumber: '+201001234567',
    providerData: [
      { providerId: 'google.com', email: 'salma@gmail.com' },
      { providerId: 'phone', phoneNumber: '+201001234567' },
    ],
  });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('new-user');

  expect(useRegistrationDraftStore.getState()).toMatchObject({
    isResume: false,
    signUpUid: 'uid-new',
    authProvider: 'google',
    phone: '1001234567',
    accountPhone: '+201001234567',
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it("falls back to Firebase's address when Apple withholds it on a repeat sign-in", async () => {
  mockGetSocialCredential.mockResolvedValue({
    ...RESULT,
    provider: 'apple',
    profile: { firstName: '', lastName: '', email: null },
  });
  mockCurrentUser = newUser({ email: 'abc@privaterelay.appleid.com' });
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await result.current.mutateAsync({ provider: 'apple' });

  expect(useRegistrationDraftStore.getState().email).toBe('abc@privaterelay.appleid.com');
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('refuses a new account with no email at all, and signs out', async () => {
  mockGetSocialCredential.mockResolvedValue({ ...RESULT, profile: { firstName: '', lastName: '', email: null } });
  mockCurrentUser = newUser({ email: null, emailVerified: false });
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'apple' })).rejects.toMatchObject({ field: 'form' });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  // Let the mutation observer settle before the test (and its afterEach
  // unmount) proceeds, so React's state update isn't left dangling outside act().
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('parks the credential when the email belongs to an account with another sign-in method', async () => {
  mockSignInWithCredential.mockRejectedValue({ code: 'auth/account-exists-with-different-credential' });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('needs-link');
  expect(usePendingLinkStore.getState().pending).toEqual({ provider: 'google', credential: CREDENTIAL, phoneHint: null });
  expect(mockGet).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('maps any other Firebase error', async () => {
  mockSignInWithCredential.mockRejectedValue({ code: 'auth/network-request-failed' });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).rejects.toEqual({
    field: 'form',
    message: 'Network error. Check your connection and try again.',
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('drops a stale pending link even when the new attempt is cancelled', async () => {
  // Pins that clearing happens unconditionally at the start of the mutation,
  // before the "sheet closed" check returns early — not just as a side
  // effect of a successful sign-in.
  usePendingLinkStore.getState().set({ provider: 'apple', credential: CREDENTIAL as never, phoneHint: null });
  mockGetSocialCredential.mockResolvedValue(null);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('cancelled');

  expect(usePendingLinkStore.getState().pending).toBeNull();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('clears a social draft left by an earlier attempt when an existing account signs in', async () => {
  seedStaleSocialDraft();
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('signed-in');

  expectDraftCleared();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('clears a social draft left by an earlier attempt when the email needs linking', async () => {
  seedStaleSocialDraft();
  mockSignInWithCredential.mockRejectedValue({ code: 'auth/account-exists-with-different-credential' });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('needs-link');

  expectDraftCleared();
  // The new credential is parked in pendingLinkStore, which the reset leaves alone.
  expect(usePendingLinkStore.getState().pending?.credential).toEqual(CREDENTIAL);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('signs out rather than leave her signed in on an auth screen when /auth/me fails', async () => {
  mockGet.mockRejectedValue(SERVER_ERROR);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).rejects.toEqual({
    field: 'form',
    message: 'Could not sign you in. Please try again.',
  });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('still reports the /auth/me failure when that sign-out fails too', async () => {
  mockGet.mockRejectedValue(SERVER_ERROR);
  mockSignOut.mockRejectedValue(new Error('native'));
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).rejects.toEqual({
    field: 'form',
    message: 'Could not sign you in. Please try again.',
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it("seeds the Firebase account's address, which the backend checks, over the provider profile's", async () => {
  mockCurrentUser = newUser({ email: 'Salma.Ali@Workspace.example' });
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await result.current.mutateAsync({ provider: 'google', role: 'parent' });

  expect(useRegistrationDraftStore.getState().email).toBe('salma.ali@workspace.example');
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});

it('refuses a new account whose email Firebase has not verified, up front, and signs out', async () => {
  mockCurrentUser = newUser({ emailVerified: false });
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google', role: 'parent' })).rejects.toEqual({
    field: 'form',
    message: "Your Google account's email isn't verified. Sign up with your phone number instead.",
  });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
  expect(useRegistrationDraftStore.getState().authProvider).toBe('phone');
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('forgets the Google account on the device when it refuses a sign-in, so the next tap offers the picker', async () => {
  mockCurrentUser = newUser({ emailVerified: false });
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).rejects.toMatchObject({ field: 'form' });

  expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
  expect(mockSignOutOfGoogle.mock.invocationCallOrder[0]).toBeGreaterThan(
    mockSignOut.mock.invocationCallOrder[0] as number,
  );
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('forgets the Google account even when the Firebase sign-out fails', async () => {
  mockGet.mockRejectedValue(SERVER_ERROR);
  mockSignOut.mockRejectedValue(new Error('native'));
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).rejects.toMatchObject({ field: 'form' });

  expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('does not hold an existing account to the verified-email rule', async () => {
  // Only a sign-up needs the proof; an account that already has a row is in.
  mockCurrentUser = newUser({ emailVerified: false });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('signed-in');
  expect(mockSignOut).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
