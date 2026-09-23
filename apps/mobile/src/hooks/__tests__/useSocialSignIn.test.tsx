import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSignInWithCredential = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentUser: { email: string | null; delete: jest.Mock } | null = null;
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
jest.mock('@mobile/lib/socialAuth', () => ({
  getSocialCredential: (...args: unknown[]) => mockGetSocialCredential(...args),
}));

const mockGet = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  getApiErrorMessage: (_e: unknown, fallback: string) => fallback,
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
  mockCurrentUser = { email: 'salma@gmail.com', delete: jest.fn() };
  mockGetSocialCredential.mockResolvedValue(RESULT);
  mockSignInWithCredential.mockResolvedValue(undefined);
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
});

it('signs an existing account straight in', async () => {
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('signed-in');
  expect(mockSignInWithCredential).toHaveBeenCalledWith(CREDENTIAL);
  expect(useRegistrationDraftStore.getState().authProvider).toBe('phone');
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
    firstName: 'Salma',
    lastName: 'Ali',
    email: 'salma@gmail.com',
  });
  expect(mockCurrentUser?.delete).not.toHaveBeenCalled();
  // Only a collision may park a credential for linking.
  expect(usePendingLinkStore.getState().pending).toBeNull();
});

it("falls back to Firebase's address when Apple withholds it on a repeat sign-in", async () => {
  mockGetSocialCredential.mockResolvedValue({
    ...RESULT,
    provider: 'apple',
    profile: { firstName: '', lastName: '', email: null },
  });
  mockCurrentUser = { email: 'abc@privaterelay.appleid.com', delete: jest.fn() };
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await result.current.mutateAsync({ provider: 'apple' });

  expect(useRegistrationDraftStore.getState().email).toBe('abc@privaterelay.appleid.com');
});

it('refuses a new account with no email at all, and signs out', async () => {
  mockGetSocialCredential.mockResolvedValue({ ...RESULT, profile: { firstName: '', lastName: '', email: null } });
  mockCurrentUser = { email: null, delete: jest.fn() };
  mockGet.mockRejectedValue(NOT_FOUND);
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'apple' })).rejects.toMatchObject({ field: 'form' });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

it('parks the credential when the email belongs to an account with another sign-in method', async () => {
  mockSignInWithCredential.mockRejectedValue({ code: 'auth/account-exists-with-different-credential' });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).resolves.toBe('needs-link');
  expect(usePendingLinkStore.getState().pending).toEqual({ provider: 'google', credential: CREDENTIAL, phoneHint: null });
  expect(mockGet).not.toHaveBeenCalled();
});

it('maps any other Firebase error', async () => {
  mockSignInWithCredential.mockRejectedValue({ code: 'auth/network-request-failed' });
  const { result } = renderSocialSignIn();

  await expect(result.current.mutateAsync({ provider: 'google' })).rejects.toEqual({
    field: 'form',
    message: 'Network error. Check your connection and try again.',
  });
});

it('drops a stale pending link when a new attempt starts', async () => {
  usePendingLinkStore.getState().set({ provider: 'apple', credential: CREDENTIAL as never, phoneHint: null });
  const { result } = renderSocialSignIn();

  await result.current.mutateAsync({ provider: 'google' });

  expect(usePendingLinkStore.getState().pending).toBeNull();
});
