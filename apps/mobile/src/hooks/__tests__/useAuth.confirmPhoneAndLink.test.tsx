import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockConfirm = jest.fn();
const mockLinkWithCredential = jest.fn();
const mockUnlink = jest.fn();
const mockCredential = jest.fn((email: string, password: string) => ({ email, password }));

// babel-plugin-jest-hoist only allows a jest.mock() factory to close over
// variables whose name starts with "mock" (see SignInScreen.test.tsx) — hence
// `mockCurrentUser` rather than `currentUser`.
let mockCurrentUser: {
  email: string | null;
  linkWithCredential: jest.Mock;
  unlink: jest.Mock;
  getIdToken: jest.Mock;
} | null = null;

// `jest.mock`'s factory runs eagerly, as soon as this module is first
// required — well before the `const mockCredential = jest.fn(...)` above it
// is actually assigned (module-level statements run in source order; the
// factory itself does not). A property set directly here (e.g. via
// `Object.assign(fn, { EmailAuthProvider: { credential: mockCredential } })`)
// would therefore capture `mockCredential` while it is still `undefined`.
// Defining it as a getter on the function object defers reading
// `mockCredential` until something actually accesses `auth.EmailAuthProvider`
// — which only happens later, inside a test, by which point it is assigned.
// `currentUser` already does this correctly via its own getter.
jest.mock('@mobile/lib/firebase', () => {
  const authFn = () => ({
    get currentUser() {
      return mockCurrentUser;
    },
  });
  Object.defineProperty(authFn, 'EmailAuthProvider', {
    enumerable: true,
    get() {
      return { credential: mockCredential };
    },
  });
  return { auth: authFn };
});

import { useConfirmPhoneAndLink } from '@mobile/hooks/useAuth';

let currentUnmount: (() => void) | null = null;

function renderConfirmPhoneAndLink() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useConfirmPhoneAndLink(), { wrapper: Wrapper });
  currentUnmount = rendered.unmount;
  return rendered;
}

const CONFIRMATION = { confirm: mockConfirm } as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(undefined);
  mockCurrentUser = {
    email: 'old@example.com',
    linkWithCredential: mockLinkWithCredential,
    unlink: mockUnlink,
    getIdToken: jest.fn().mockResolvedValue('fresh-token'),
  };
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
});

it('links the credential straight away when nothing is linked yet', async () => {
  mockLinkWithCredential.mockResolvedValue(undefined);
  const { result } = renderConfirmPhoneAndLink();

  await result.current.mutateAsync({
    confirmation: CONFIRMATION,
    code: '111111',
    email: 'Mona@Example.com',
    password: 'Password1',
  });

  expect(mockCredential).toHaveBeenCalledWith('mona@example.com', 'Password1');
  expect(mockLinkWithCredential).toHaveBeenCalledTimes(1);
  expect(mockUnlink).not.toHaveBeenCalled();
});

it('unlinks and relinks with the new credential when a password provider is already linked', async () => {
  // A wizard abandoned after this step, then restarted with a different
  // email or password, confirms into the same uid: the link call is a
  // no-op from Firebase's point of view (auth/provider-already-linked), but
  // now that the credential is the user's own chosen email + password
  // rather than a phone-derived placeholder, treating that as success would
  // silently leave Firebase on the abandoned attempt's email/password while
  // the DB row gets the new one. `updateEmail` cannot fix this up afterward
  // — it is blocked under email-enumeration protection — so the fix is to
  // unlink the stale credential and link the new one in its place.
  const order: string[] = [];
  mockLinkWithCredential
    .mockImplementationOnce(async () => {
      order.push('link-1');
      throw { code: 'auth/provider-already-linked' };
    })
    .mockImplementationOnce(async () => {
      order.push('link-2');
    });
  mockUnlink.mockImplementation(async () => {
    order.push('unlink');
  });

  const { result } = renderConfirmPhoneAndLink();

  await result.current.mutateAsync({
    confirmation: CONFIRMATION,
    code: '111111',
    email: 'new@example.com',
    password: 'NewPassword1',
  });

  expect(mockUnlink).toHaveBeenCalledWith('password');
  expect(mockLinkWithCredential).toHaveBeenCalledTimes(2);
  expect(mockCredential).toHaveBeenLastCalledWith('new@example.com', 'NewPassword1');
  expect(order).toEqual(['link-1', 'unlink', 'link-2']);
});

it('maps a relink failure through mapFirebaseAuthError instead of silently succeeding', async () => {
  mockLinkWithCredential
    .mockImplementationOnce(async () => {
      throw { code: 'auth/provider-already-linked' };
    })
    .mockImplementationOnce(async () => {
      throw { code: 'auth/email-already-in-use' };
    });
  mockUnlink.mockResolvedValue(undefined);

  const { result } = renderConfirmPhoneAndLink();

  await expect(
    result.current.mutateAsync({
      confirmation: CONFIRMATION,
      code: '111111',
      email: 'taken@example.com',
      password: 'NewPassword1',
    }),
  ).rejects.toEqual({
    field: 'email',
    message: 'An account with this email already exists.',
  });

  expect(mockUnlink).toHaveBeenCalledWith('password');
});

it('surfaces an unlink failure through mapFirebaseAuthError', async () => {
  mockLinkWithCredential.mockImplementationOnce(async () => {
    throw { code: 'auth/provider-already-linked' };
  });
  mockUnlink.mockRejectedValue({ code: 'auth/network-request-failed' });

  const { result } = renderConfirmPhoneAndLink();

  await expect(
    result.current.mutateAsync({
      confirmation: CONFIRMATION,
      code: '111111',
      email: 'new@example.com',
      password: 'NewPassword1',
    }),
  ).rejects.toEqual({
    field: 'form',
    message: 'Network error. Check your connection and try again.',
  });

  expect(mockLinkWithCredential).toHaveBeenCalledTimes(1);
});

it('still maps a genuine link failure that is not the already-linked code', async () => {
  mockLinkWithCredential.mockRejectedValue({ code: 'auth/email-already-in-use' });

  const { result } = renderConfirmPhoneAndLink();

  await expect(
    result.current.mutateAsync({
      confirmation: CONFIRMATION,
      code: '111111',
      email: 'taken@example.com',
      password: 'NewPassword1',
    }),
  ).rejects.toEqual({
    field: 'email',
    message: 'An account with this email already exists.',
  });

  expect(mockUnlink).not.toHaveBeenCalled();
});

it('refreshes the ID token after linking, so /auth/register sees the linked email', async () => {
  mockLinkWithCredential.mockResolvedValue(undefined);
  const { result } = renderConfirmPhoneAndLink();

  await result.current.mutateAsync({
    confirmation: CONFIRMATION,
    code: '111111',
    email: 'mona@example.com',
    password: 'Password1',
  });

  expect(mockCurrentUser?.getIdToken).toHaveBeenCalledWith(true);
});

