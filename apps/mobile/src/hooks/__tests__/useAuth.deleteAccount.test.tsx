import React from 'react';
import { Platform } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockClearLocalSession = jest.fn();
jest.mock('@mobile/lib/session', () => ({
  clearLocalSession: (...args: unknown[]) => mockClearLocalSession(...args),
}));

const mockGetAppleAuthorizationCode = jest.fn();
jest.mock('@mobile/lib/socialAuth', () => ({
  getAppleAuthorizationCode: (...args: unknown[]) => mockGetAppleAuthorizationCode(...args),
}));

const mockRevokeToken = jest.fn();
let mockCurrentUser: { uid: string; providerData: { providerId: string }[] } | null = null;
jest.mock('@mobile/lib/firebase', () => {
  const authFn = () => ({
    revokeToken: mockRevokeToken,
    get currentUser() {
      return mockCurrentUser;
    },
  });
  return { auth: authFn };
});

import { api } from '@mobile/lib/api';
import { COULD_NOT_CONNECT } from '@mobile/lib/authErrors';
import { useDeleteAccount } from '@mobile/hooks/useAuth';

const mockDelete = api.delete as jest.Mock;

const CONFIRM_BODY = (appleRevoked: boolean) => ({
  data: { confirm: 'delete-my-account', appleRevoked },
});

let currentUnmount: (() => void) | null = null;
function renderDelete() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useDeleteAccount(), { wrapper: Wrapper });
  currentUnmount = rendered.unmount;
  return rendered;
}

type Rendered = ReturnType<typeof renderDelete>['result'];

/**
 * Runs the mutation and waits for the hook to show how it settled, so no
 * state update lands after the test (React's "not wrapped in act" warning).
 */
async function run(result: Rendered): Promise<unknown> {
  const settled = await result.current.mutateAsync().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await waitFor(() => expect(['success', 'error']).toContain(result.current.status));
  return settled;
}

function signedInWith(...providerIds: string[]): void {
  mockCurrentUser = { uid: 'uid-1', providerData: providerIds.map((providerId) => ({ providerId })) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDelete.mockReset();
  mockDelete.mockResolvedValue({ status: 204, data: '' });
  mockClearLocalSession.mockResolvedValue(undefined);
  mockRevokeToken.mockResolvedValue(undefined);
  mockGetAppleAuthorizationCode.mockResolvedValue('apple-auth-code');
  jest.replaceProperty(Platform, 'OS', 'ios');
  signedInWith('phone');
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
});

describe('useDeleteAccount', () => {
  it('deletes a phone-only account, then signs out locally', async () => {
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ value: 'deleted' });

    expect(mockGetAppleAuthorizationCode).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('/auth/me', CONFIRM_BODY(false));
    expect(mockClearLocalSession).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockClearLocalSession.mock.invocationCallOrder[0] as number,
    );
    expect(result.current.isSuccess).toBe(true);
  });

  it('revokes Apple first on iOS and tells the server it did', async () => {
    signedInWith('apple.com');
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ value: 'deleted' });

    expect(mockRevokeToken).toHaveBeenCalledWith('apple-auth-code');
    expect(mockRevokeToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockDelete.mock.invocationCallOrder[0] as number,
    );
    expect(mockDelete).toHaveBeenCalledWith('/auth/me', CONFIRM_BODY(true));
  });

  it('stops without deleting when the Apple sheet is cancelled', async () => {
    signedInWith('apple.com');
    mockGetAppleAuthorizationCode.mockResolvedValue(null);
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ value: 'cancelled' });

    expect(mockRevokeToken).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockClearLocalSession).not.toHaveBeenCalled();
  });

  it('refuses to delete when Apple cannot be revoked', async () => {
    signedInWith('apple.com');
    mockRevokeToken.mockRejectedValue(new Error('revoke failed'));
    const { result } = renderDelete();

    expect(await run(result)).toEqual({
      error: { field: 'form', message: "We couldn't disconnect your Apple ID. Please try again." },
    });

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockClearLocalSession).not.toHaveBeenCalled();
  });

  it('passes on an Apple sheet failure without deleting', async () => {
    signedInWith('apple.com');
    const appleFailed = { field: 'form', message: 'Apple sign-in failed. Please try again.' };
    mockGetAppleAuthorizationCode.mockRejectedValue(appleFailed);
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ error: appleFailed });

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes on Android without revoking, since Android cannot', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    signedInWith('apple.com');
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ value: 'deleted' });

    expect(mockGetAppleAuthorizationCode).not.toHaveBeenCalled();
    expect(mockRevokeToken).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('/auth/me', CONFIRM_BODY(false));
  });

  it('shows the server message on a 409 and stays signed in', async () => {
    const message = 'Finish or cancel your upcoming bookings before deleting your account.';
    mockDelete.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { error: message } } });
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ error: { field: 'form', message } });

    expect(mockClearLocalSession).not.toHaveBeenCalled();
  });

  it('shows the server message on a 403', async () => {
    const message = 'Staff accounts are removed from the admin console.';
    mockDelete.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { error: message } } });
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ error: { field: 'form', message } });
  });

  it('says it could not connect on a network error and stays signed in', async () => {
    mockDelete.mockRejectedValue({ isAxiosError: true, message: 'Network Error' });
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ error: { field: 'form', message: COULD_NOT_CONNECT } });

    expect(mockClearLocalSession).not.toHaveBeenCalled();
  });

  it('still reports the deletion when the local sign-out fails', async () => {
    mockClearLocalSession.mockRejectedValue({ code: 'auth/network-request-failed' });
    const { result } = renderDelete();

    expect(await run(result)).toEqual({ value: 'deleted' });
  });

  it('fails without calling the server when nobody is signed in', async () => {
    mockCurrentUser = null;
    const { result } = renderDelete();

    expect(await run(result)).toMatchObject({ error: { field: 'form' } });

    expect(mockDelete).not.toHaveBeenCalled();
  });
});
