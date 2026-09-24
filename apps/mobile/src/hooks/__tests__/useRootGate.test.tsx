import { act, renderHook } from '@testing-library/react-native';
import type { UserResponse } from '@nanny-app/shared';

type MeQueryStub = {
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: jest.Mock;
};
let mockMeQuery: MeQueryStub;
jest.mock('@mobile/hooks/useMe', () => ({
  useMe: () => mockMeQuery,
}));

const mockSignOutMutate = jest.fn();
jest.mock('@mobile/hooks/useAuth', () => ({
  useSignOut: () => ({ mutate: mockSignOutMutate, isPending: false }),
}));

const mockSeed = jest.fn();
jest.mock('@mobile/lib/resumeSignUp', () => ({
  seedDraftFromAccount: (...args: unknown[]) => mockSeed(...args),
}));

import { ApiRequestError } from '@mobile/lib/api';
import type { FirebaseUser } from '@mobile/lib/firebase';
import { useRootGate } from '@mobile/hooks/useRootGate';
import { useAuthStore } from '@mobile/store/authStore';
import { useGuestStore } from '@mobile/store/guestStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const USER = { uid: 'uid-leftover', providerData: [] } as unknown as FirebaseUser;

function meQuery(overrides: Partial<MeQueryStub> = {}): MeQueryStub {
  return { isFetching: false, isError: false, error: null, refetch: jest.fn(), ...overrides };
}

function profile(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    role: 'MOTHER',
    isEmailVerified: true,
    approvalStatus: 'APPROVED',
    ...overrides,
  } as unknown as UserResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMeQuery = meQuery();
  useAuthStore.setState({ user: USER });
  useGuestStore.setState({ isGuest: false });
  useUserProfileStore.setState({ profile: null });
  useRegistrationDraftStore.getState().reset();
});

it('sends a signed-out visitor to sign-in, and a guest home', () => {
  useAuthStore.setState({ user: null });
  const { result, rerender } = renderHook(() => useRootGate());
  expect(result.current).toEqual({ kind: 'redirect', href: '/(auth)/sign-in' });

  act(() => useGuestStore.setState({ isGuest: true }));
  rerender({});
  expect(result.current).toEqual({ kind: 'redirect', href: '/(parent)/home' });
});

it('waits while /auth/me is in flight', () => {
  mockMeQuery = meQuery({ isFetching: true });
  const { result } = renderHook(() => useRootGate());
  expect(result.current).toEqual({ kind: 'wait' });
});

it('routes a profile by role, approval and email as before', () => {
  useUserProfileStore.setState({ profile: profile() });
  const { result, rerender } = renderHook(() => useRootGate());
  expect(result.current).toEqual({ kind: 'redirect', href: '/(parent)/home' });

  act(() => useUserProfileStore.setState({ profile: profile({ isEmailVerified: false }) }));
  rerender({});
  expect(result.current).toEqual({ kind: 'redirect', href: '/(auth)/verify-email' });

  act(() => useUserProfileStore.setState({ profile: profile({ role: 'NANNY', approvalStatus: 'APPROVED' } as Partial<UserResponse>) }));
  rerender({});
  expect(result.current).toEqual({ kind: 'redirect', href: '/(nanny)/dashboard' });

  act(() => useUserProfileStore.setState({ profile: profile({ role: 'NANNY', approvalStatus: 'REJECTED' } as Partial<UserResponse>) }));
  rerender({});
  expect(result.current).toEqual({ kind: 'redirect', href: '/(auth)/upload-id' });

  act(() => useUserProfileStore.setState({ profile: profile({ role: 'NANNY', approvalStatus: 'PENDING_REVIEW' } as Partial<UserResponse>) }));
  rerender({});
  expect(result.current).toEqual({ kind: 'redirect', href: '/(auth)/pending-review' });
});

it('seeds a leftover account once and opens role selection instead of signing it out', () => {
  mockMeQuery = meQuery({ isError: true, error: new ApiRequestError('Not found', 404) });
  const { result, rerender } = renderHook(() => useRootGate());

  expect(result.current).toEqual({ kind: 'redirect', href: '/(auth)/role-selection' });
  expect(mockSeed).toHaveBeenCalledTimes(1);
  expect(mockSeed).toHaveBeenCalledWith(USER);

  rerender({});
  rerender({});
  expect(mockSeed).toHaveBeenCalledTimes(1);
  expect(mockSignOutMutate).not.toHaveBeenCalled();
});

it('keeps the draft of a wizard already under way for this account', () => {
  useRegistrationDraftStore.getState().patch({ signUpUid: 'uid-leftover', address: '1 Nile St' });
  mockMeQuery = meQuery({ isError: true, error: new ApiRequestError('Not found', 404) });

  const { result } = renderHook(() => useRootGate());

  expect(result.current).toEqual({ kind: 'redirect', href: '/(auth)/role-selection' });
  expect(mockSeed).not.toHaveBeenCalled();
});

it('offers Retry and Sign out on any other error, and never signs out by itself', () => {
  mockMeQuery = meQuery({ isError: true, error: new ApiRequestError('Server error', 500) });
  const { result } = renderHook(() => useRootGate());

  expect(result.current).toMatchObject({ kind: 'error', isSigningOut: false });
  expect(mockSignOutMutate).not.toHaveBeenCalled();
  expect(mockSeed).not.toHaveBeenCalled();

  const gate = result.current;
  if (gate.kind !== 'error') throw new Error('expected the error gate');
  act(() => gate.retry());
  expect(mockMeQuery.refetch).toHaveBeenCalledTimes(1);
  expect(mockSignOutMutate).not.toHaveBeenCalled();

  act(() => gate.signOut());
  expect(mockSignOutMutate).toHaveBeenCalledTimes(1);
});
