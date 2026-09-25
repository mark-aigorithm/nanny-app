import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockConfirm = jest.fn();
const mockSignOut = jest.fn();
const mockApiGet = jest.fn();

// Names start with "mock" so jest.mock's hoisted factories may close over them.
let mockCurrentUser: {
  uid: string;
  phoneNumber: string | null;
  providerData: { providerId: string }[];
} | null = null;

jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
    signOut: mockSignOut,
  }),
}));

jest.mock('@mobile/lib/api', () => {
  const actual = jest.requireActual('@mobile/lib/api');
  return { ...actual, api: { get: (...args: unknown[]) => mockApiGet(...args), post: jest.fn() } };
});

import { ApiRequestError } from '@mobile/lib/api';
import { PHONE_HAS_ACCOUNT_ERROR, useConfirmRegistrationPhone } from '@mobile/hooks/useAuth';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const PHONE = '+201001234567';
const CONFIRMATION = { confirm: mockConfirm } as never;
const CALL = { confirmation: CONFIRMATION, code: '123456', phone: PHONE };

let unmount: (() => void) | null = null;

function renderConfirm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useConfirmRegistrationPhone(), { wrapper: Wrapper });
  unmount = rendered.unmount;
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  mockConfirm.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
  mockApiGet.mockRejectedValue(new ApiRequestError('User profile not found.', 404));
  mockCurrentUser = { uid: 'uid-new', phoneNumber: PHONE, providerData: [{ providerId: 'phone' }] };
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

it('a new number: records the account on the draft and goes on', async () => {
  const { result } = renderConfirm();

  await expect(result.current.mutateAsync(CALL)).resolves.toBe('fresh');

  expect(mockConfirm).toHaveBeenCalledWith('123456');
  expect(mockApiGet).toHaveBeenCalledWith('/auth/me');
  expect(useRegistrationDraftStore.getState()).toMatchObject({ signUpUid: 'uid-new', accountPhone: PHONE });
  expect(mockSignOut).not.toHaveBeenCalled();
});

it('a changed number that signs in as another account drops the uploads made under the old one', async () => {
  const upload = { uri: 'file:///a.jpg', url: 'https://storage.test/avatars/uid-old/a.jpg' };
  useRegistrationDraftStore.setState({ signUpUid: 'uid-old', avatarUpload: upload, idFrontUpload: upload });
  const { result } = renderConfirm();

  await result.current.mutateAsync(CALL);

  expect(useRegistrationDraftStore.getState()).toMatchObject({
    signUpUid: 'uid-new',
    avatarUpload: null,
    idFrontUpload: null,
    idBackUpload: null,
  });
});

it('keeps the uploads when it signs in as the same account again', async () => {
  const upload = { uri: 'file:///a.jpg', url: 'https://storage.test/avatars/uid-new/a.jpg' };
  useRegistrationDraftStore.setState({ signUpUid: 'uid-new', avatarUpload: upload });
  const { result } = renderConfirm();

  await result.current.mutateAsync(CALL);

  expect(useRegistrationDraftStore.getState().avatarUpload).toEqual(upload);
});

it('a number with a registered row: signs out and says so', async () => {
  mockApiGet.mockResolvedValue({ data: { data: {}, error: null } });
  const { result } = renderConfirm();

  await expect(result.current.mutateAsync(CALL)).rejects.toEqual(PHONE_HAS_ACCOUNT_ERROR);

  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(useRegistrationDraftStore.getState().signUpUid).toBeNull();
});

it('a stalled sign-up that holds more than the phone: a leftover for the root gate', async () => {
  mockCurrentUser!.providerData = [{ providerId: 'phone' }, { providerId: 'password' }];
  const { result } = renderConfirm();

  await expect(result.current.mutateAsync(CALL)).resolves.toBe('leftover');

  expect(useRegistrationDraftStore.getState().signUpUid).toBeNull();
  expect(mockSignOut).not.toHaveBeenCalled();
});

it("can't tell (5xx or offline): says it couldn't connect and stays signed in for a retry", async () => {
  mockApiGet.mockRejectedValue(new ApiRequestError('boom', 500));
  const { result } = renderConfirm();

  await expect(result.current.mutateAsync(CALL)).rejects.toEqual({
    field: 'form',
    message: "Couldn't connect. Check your connection and try again.",
  });
  expect(mockSignOut).not.toHaveBeenCalled();
});

it('a wrong code: the mapped Firebase error, and /auth/me is never asked', async () => {
  mockCurrentUser = null;
  mockConfirm.mockRejectedValue({ code: 'auth/invalid-verification-code' });
  const { result } = renderConfirm();

  await expect(result.current.mutateAsync(CALL)).rejects.toEqual({
    field: 'form',
    message: "That code isn't right. Check and try again.",
  });
  expect(mockApiGet).not.toHaveBeenCalled();
});

it('a retry with a spent code, already signed in as the number, still goes on', async () => {
  mockConfirm.mockRejectedValue({ code: 'auth/session-expired' });
  const { result } = renderConfirm();

  await expect(result.current.mutateAsync(CALL)).resolves.toBe('fresh');
});
