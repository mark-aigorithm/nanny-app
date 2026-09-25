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
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  providerData: { providerId: string; email?: string | null }[];
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
    signOut: mockSignOut,
  });
  Object.defineProperty(authFn, 'EmailAuthProvider', {
    enumerable: true,
    get() {
      return { credential: mockCredential };
    },
  });
  return { auth: authFn };
});

const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockApiPost = jest.fn();
const mockApiGet = jest.fn();
jest.mock('@mobile/lib/api', () => {
  const actual = jest.requireActual('@mobile/lib/api');
  return {
    ...actual,
    api: {
      post: (...args: unknown[]) => mockApiPost(...args),
      get: (...args: unknown[]) => mockApiGet(...args),
    },
  };
});

import { ApiRequestError } from '@mobile/lib/api';
import { EMAIL_TAKEN_ERROR, useConfirmPhoneAndLink } from '@mobile/hooks/useAuth';

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
const PHONE = '+201234567891';
/** The fields every call below shares. */
const BASE = {
  confirmation: CONFIRMATION,
  code: '111111',
  phone: PHONE,
  emailVerificationToken: null,
  signUpUid: 'uid-social',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(undefined);
  // No row for the uid — the abandoned-wizard case the unlink/relink is for.
  mockApiGet.mockRejectedValue(new ApiRequestError('User profile not found.', 404));
  mockSignOut.mockResolvedValue(undefined);
  mockCurrentUser = {
    uid: 'uid-social',
    email: 'old@example.com',
    phoneNumber: PHONE,
    providerData: [{ providerId: 'phone' }],
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
    ...BASE,
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
    ...BASE,
    email: 'new@example.com',
    password: 'NewPassword1',
  });

  expect(mockUnlink).toHaveBeenCalledWith('password');
  expect(mockLinkWithCredential).toHaveBeenCalledTimes(2);
  expect(mockCredential).toHaveBeenLastCalledWith('new@example.com', 'NewPassword1');
  expect(order).toEqual(['link-1', 'unlink', 'link-2']);
});

it('reports a taken email from the relink instead of silently succeeding', async () => {
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
      ...BASE,
      email: 'taken@example.com',
      password: 'NewPassword1',
    }),
  ).rejects.toEqual(EMAIL_TAKEN_ERROR);

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
      ...BASE,
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
  mockLinkWithCredential.mockRejectedValue({ code: 'auth/weak-password' });

  const { result } = renderConfirmPhoneAndLink();

  await expect(
    result.current.mutateAsync({
      ...BASE,
      email: 'taken@example.com',
      password: 'NewPassword1',
    }),
  ).rejects.toEqual({
    field: 'password',
    message: 'Password is too weak. Use at least 8 characters.',
  });

  expect(mockUnlink).not.toHaveBeenCalled();
});

it('refreshes the ID token after linking, so /auth/register sees the linked email', async () => {
  mockLinkWithCredential.mockResolvedValue(undefined);
  const { result } = renderConfirmPhoneAndLink();

  await result.current.mutateAsync({
    ...BASE,
    email: 'mona@example.com',
    password: 'Password1',
  });

  expect(mockCurrentUser?.getIdToken).toHaveBeenCalledWith(true);
});


describe('a retry or a resumed sign-up', () => {
  it('accepts a spent code when the app is already signed in as that number', async () => {
    // A retry after a later step failed: the code was spent by the first try.
    mockConfirm.mockRejectedValue({ code: 'auth/session-expired' });
    mockLinkWithCredential.mockResolvedValue(undefined);
    const { result } = renderConfirmPhoneAndLink();

    await result.current.mutateAsync({ ...BASE, email: 'mona@example.com', password: 'Password1' });

    expect(mockLinkWithCredential).toHaveBeenCalledTimes(1);
  });

  it('skips the code when the account already holds the number (confirmation: null)', async () => {
    mockLinkWithCredential.mockResolvedValue(undefined);
    const { result } = renderConfirmPhoneAndLink();

    await result.current.mutateAsync({ ...BASE, confirmation: null, code: '', email: 'mona@example.com', password: 'Password1' });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockLinkWithCredential).toHaveBeenCalledTimes(1);
    expect(mockCurrentUser?.getIdToken).toHaveBeenCalledWith(true);
  });

  it('refuses confirmation: null when the signed-in account does not hold that number', async () => {
    mockCurrentUser!.phoneNumber = '+201111111111';
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, confirmation: null, code: '', email: 'mona@example.com', password: 'Password1' }),
    ).rejects.toMatchObject({ field: 'form', code: 'session-mismatch' });
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
  });

  it('refuses confirmation: null when nobody is signed in', async () => {
    mockCurrentUser = null;
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, confirmation: null, code: '', email: 'mona@example.com', password: 'Password1' }),
    ).rejects.toMatchObject({ code: 'session-mismatch' });
  });

  it('refuses confirmation: null when the signed-in account is not the one this sign-up created', async () => {
    // Mirrors useLinkPhoneToCurrentUser's signUpUid guard: the phone matches,
    // but this uid is not the sign-up's own (say, a registered account signed
    // in by SMS on this device since) — nothing here should be touched.
    mockCurrentUser!.uid = 'uid-someone-else';
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, confirmation: null, code: '', email: 'mona@example.com', password: 'Password1' }),
    ).rejects.toMatchObject({ field: 'form', code: 'session-mismatch' });
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
  });

  it('skips the link when the same-email password is already on the account and none was typed', async () => {
    // A resumed sign-up whose create-password step was skipped.
    mockCurrentUser!.providerData = [{ providerId: 'phone' }, { providerId: 'password', email: 'Mona@Example.com' }];
    const { result } = renderConfirmPhoneAndLink();

    await result.current.mutateAsync({ ...BASE, confirmation: null, code: '', email: 'mona@example.com', password: '' });

    expect(mockLinkWithCredential).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockCurrentUser?.getIdToken).toHaveBeenCalledWith(true);
  });

  it('asks for a password when none was typed and the account has none for that email', async () => {
    mockCurrentUser!.providerData = [{ providerId: 'phone' }, { providerId: 'password', email: 'other@example.com' }];
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, email: 'mona@example.com', password: '' }),
    ).rejects.toEqual({ field: 'form', message: 'Please go back and create a password.' });
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
  });
});

describe('an email held by another unfinished account', () => {
  it('reclaims the proven email and links once more', async () => {
    mockLinkWithCredential
      .mockRejectedValueOnce({ code: 'auth/email-already-in-use' })
      .mockResolvedValueOnce(undefined);
    mockApiPost.mockResolvedValue({ status: 204 });
    const { result } = renderConfirmPhoneAndLink();

    await result.current.mutateAsync({ ...BASE, email: 'Mona@Example.com', password: 'Password1', emailVerificationToken: 'tok' });

    expect(mockApiPost).toHaveBeenCalledWith('/auth/reclaim-email', { email: 'mona@example.com', emailVerificationToken: 'tok' });
    expect(mockLinkWithCredential).toHaveBeenCalledTimes(2);
    expect(mockApiPost.mock.invocationCallOrder[0]).toBeLessThan(
      mockLinkWithCredential.mock.invocationCallOrder[1] as number,
    );
    expect(mockCurrentUser?.getIdToken).toHaveBeenCalledWith(true);
  });

  it('treats credential-already-in-use the same way', async () => {
    mockLinkWithCredential
      .mockRejectedValueOnce({ code: 'auth/credential-already-in-use' })
      .mockResolvedValueOnce(undefined);
    mockApiPost.mockResolvedValue({ status: 204 });
    const { result } = renderConfirmPhoneAndLink();

    await result.current.mutateAsync({ ...BASE, email: 'mona@example.com', password: 'Password1', emailVerificationToken: 'tok' });

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockLinkWithCredential).toHaveBeenCalledTimes(2);
  });

  it('says the email is taken when the server refuses the reclaim (409)', async () => {
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/email-already-in-use' });
    mockApiPost.mockRejectedValue(new ApiRequestError('taken', 409));
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, email: 'mona@example.com', password: 'Password1', emailVerificationToken: 'tok' }),
    ).rejects.toEqual(EMAIL_TAKEN_ERROR);
    expect(mockLinkWithCredential).toHaveBeenCalledTimes(1);
    expect(EMAIL_TAKEN_ERROR).toEqual({
      field: 'form',
      message: 'An account with this email already exists. Sign in instead.',
      code: 'auth/email-already-in-use',
    });
  });

  it("says it couldn't connect when the reclaim fails any other way", async () => {
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/email-already-in-use' });
    mockApiPost.mockRejectedValue(new ApiRequestError('offline', null));
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, email: 'mona@example.com', password: 'Password1', emailVerificationToken: 'tok' }),
    ).rejects.toEqual({ field: 'form', message: "Couldn't connect. Check your connection and try again." });
  });

  it('says the email is taken, without asking the server, when there is no proof of the email', async () => {
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, email: 'mona@example.com', password: 'Password1' }),
    ).rejects.toEqual(EMAIL_TAKEN_ERROR);
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('maps a failure of the second link', async () => {
    mockLinkWithCredential
      .mockRejectedValueOnce({ code: 'auth/email-already-in-use' })
      .mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    mockApiPost.mockResolvedValue({ status: 204 });
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, email: 'mona@example.com', password: 'Password1', emailVerificationToken: 'tok' }),
    ).rejects.toEqual({ field: 'form', message: 'Network error. Check your connection and try again.' });
  });
});

describe('a password already on the uid', () => {
  beforeEach(() => {
    mockLinkWithCredential.mockImplementationOnce(async () => {
      throw { code: 'auth/provider-already-linked' };
    });
  });

  it('is never replaced when the uid is a registered account', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { data: {}, error: null } });
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, email: 'new@example.com', password: 'NewPassword1' }),
    ).rejects.toEqual({
      field: 'form',
      message: 'This number already has an account. Sign in instead.',
      code: 'account-exists',
    });
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("says it couldn't connect, and touches nothing, when the row check fails", async () => {
    mockApiGet.mockRejectedValueOnce(new ApiRequestError('boom', 500));
    const { result } = renderConfirmPhoneAndLink();

    await expect(
      result.current.mutateAsync({ ...BASE, email: 'new@example.com', password: 'NewPassword1' }),
    ).rejects.toEqual({ field: 'form', message: "Couldn't connect. Check your connection and try again." });
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
