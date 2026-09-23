import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * `useVerifiedEmailSubmit` composes four `useAuth` mutations; mocking them at
 * that boundary (rather than `@mobile/lib/api`) keeps this file focused on
 * what the hook itself decides — whether to re-sign-in, sign out, or just
 * hand back an outcome — not on how each request is shaped on the wire.
 */
const mockSendOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSetVerifiedEmail = jest.fn();
const mockSignOutMutateAsync = jest.fn();

jest.mock('@mobile/hooks/useAuth', () => ({
  useSendEmailOtp: () => ({ mutateAsync: mockSendOtp, isPending: false }),
  useVerifyEmailOtp: () => ({ mutateAsync: mockVerifyOtp, isPending: false }),
  useSetVerifiedEmail: () => ({ mutateAsync: mockSetVerifiedEmail, isPending: false }),
  useSignOut: () => ({ mutateAsync: mockSignOutMutateAsync, isPending: false }),
}));

// Overrides jest.setup.js's global stub — this hook is the one place that
// needs signInWithCustomToken, to re-establish a session after the backend's
// email swap revokes the one it was called with.
const mockSignInWithCustomToken = jest.fn();
jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({ signInWithCustomToken: mockSignInWithCustomToken }),
}));

const mockNoticeDialog = jest.fn();
jest.mock('@mobile/store/confirmDialogStore', () => ({
  noticeDialog: (options: unknown) => mockNoticeDialog(options),
}));

import { useVerifiedEmailSubmit } from '@mobile/hooks/useVerifiedEmailSubmit';

const EMAIL = 'sarah@example.com';
const CODE = '123456';
const CUSTOM_TOKEN = 'custom-token-abc';

function renderSubmit() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useVerifiedEmailSubmit(), { wrapper });
  return { ...rendered, invalidateSpy };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyOtp.mockResolvedValue({ verificationToken: 'v-tok' });
  mockSignInWithCustomToken.mockResolvedValue(undefined);
  mockSignOutMutateAsync.mockResolvedValue(undefined);
});

describe('confirmCode', () => {
  it('re-signs in with the returned custom token and reports "home"', async () => {
    mockSetVerifiedEmail.mockResolvedValue({ customToken: CUSTOM_TOKEN, id: 1 });
    const { result, invalidateSpy } = renderSubmit();

    const outcome = await result.current.confirmCode(EMAIL, CODE);

    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: EMAIL, code: CODE });
    expect(mockSetVerifiedEmail).toHaveBeenCalledWith({
      email: EMAIL,
      verificationToken: 'v-tok',
    });
    expect(mockSignInWithCustomToken).toHaveBeenCalledWith(CUSTOM_TOKEN);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
    expect(outcome).toBe('home');
  });

  it('skips the re-sign-in and still reports "home" when no customToken comes back', async () => {
    // Guards the mismatched-deploy window: the new app binary can reach users before the
    // backend that returns customToken deploys (see the spec's Rollout), so a
    // plain profile response from an old backend must not be mistaken for a
    // dead session — nothing was revoked, so there's nothing to trade in.
    mockSetVerifiedEmail.mockResolvedValue({ id: 1 });
    const { result } = renderSubmit();

    const outcome = await result.current.confirmCode(EMAIL, CODE);

    expect(mockSignInWithCustomToken).not.toHaveBeenCalled();
    expect(mockSignOutMutateAsync).not.toHaveBeenCalled();
    expect(outcome).toBe('home');
  });

  it('signs out, raises the notice dialog, and reports "sign-in" when the re-sign-in fails', async () => {
    mockSetVerifiedEmail.mockResolvedValue({ customToken: CUSTOM_TOKEN, id: 1 });
    mockSignInWithCustomToken.mockRejectedValue(new Error('network blip'));
    const { result } = renderSubmit();

    const outcome = await result.current.confirmCode(EMAIL, CODE);

    // The gate already succeeded server-side — only re-establishing a session
    // failed — so the dead one must be dropped explicitly rather than left
    // half-alive.
    expect(mockSignOutMutateAsync).toHaveBeenCalled();
    expect(mockNoticeDialog).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Your email is verified. Please sign in again.' }),
    );
    expect(outcome).toBe('sign-in');
  });

  it('still reports "sign-in" even if the sign-out call itself fails', async () => {
    mockSetVerifiedEmail.mockResolvedValue({ customToken: CUSTOM_TOKEN, id: 1 });
    mockSignInWithCustomToken.mockRejectedValue(new Error('network blip'));
    mockSignOutMutateAsync.mockRejectedValue(new Error('also offline'));
    const { result } = renderSubmit();

    const outcome = await result.current.confirmCode(EMAIL, CODE);

    expect(mockNoticeDialog).toHaveBeenCalled();
    expect(outcome).toBe('sign-in');
  });

  it('reports null and sets an error when the code is wrong', async () => {
    mockVerifyOtp.mockRejectedValue(new Error('That code is not right.'));
    const { result } = renderSubmit();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.confirmCode(EMAIL, '000000');
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(mockSetVerifiedEmail).not.toHaveBeenCalled();
    expect(mockSignInWithCustomToken).not.toHaveBeenCalled();
  });

  it('reports null and sets an error when the backend refuses the address', async () => {
    mockSetVerifiedEmail.mockRejectedValue(new Error('An account with this email already exists.'));
    const { result } = renderSubmit();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.confirmCode(EMAIL, CODE);
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(mockSignInWithCustomToken).not.toHaveBeenCalled();
  });
});
