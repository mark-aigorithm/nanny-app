import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), dismissTo: mockDismissTo }),
}));

// The email OTP hooks run for real against the mocked API (jest.setup.js);
// the Firebase link and sign-out are stubbed.
const mockLink = jest.fn();
const mockSignOut = jest.fn((_v: unknown, o?: { onSettled?: () => void }) => o?.onSettled?.());
jest.mock('@mobile/hooks/useAuth', () => ({
  ...jest.requireActual('@mobile/hooks/useAuth'),
  useLinkEmailPassword: () => ({ mutateAsync: mockLink, isPending: false }),
  useSignOut: () => ({ mutate: mockSignOut, isPending: false }),
}));

import { api } from '@mobile/lib/api';
import RegistrationAccountScreen from '@mobile/screens/auth/RegistrationAccountScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const mockPost = api.post as jest.Mock;
const EMAIL = 'mona@example.com';

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrationAccountScreen />
    </QueryClientProvider>,
  );
}

async function enterCode() {
  // The code is sent on arrival; let that settle.
  await act(async () => {});
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('registerAccount.code'), '123456');
  });
}

function typePassword(password = 'Passw0rd', confirm = password) {
  fireEvent.changeText(screen.getByPlaceholderText('Enter a password'), password);
  fireEvent.changeText(screen.getByPlaceholderText('Re-enter your password'), confirm);
}

async function pressContinue() {
  await act(async () => {
    fireEvent.press(screen.getByText('Continue'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  useRegistrationDraftStore.setState({ role: 'parent', email: 'Mona@Example.com', signUpUid: 'uid-1' });
  mockLink.mockResolvedValue(undefined);
  mockPost.mockImplementation(async (url: string) =>
    url === '/auth/email/verify'
      ? { data: { data: { verificationToken: 'tok-1' }, error: null } }
      : { data: { data: null, error: null } },
  );
});

it('labels itself step 3 of the mother’s 5', () => {
  renderScreen();
  expect(screen.getByText('STEP 3 OF 5 — SECURE YOUR ACCOUNT')).toBeTruthy();
});

it('sends the code on arrival, once', async () => {
  renderScreen();
  await act(async () => {});
  const sends = mockPost.mock.calls.filter(([url]) => url === '/auth/email/otp');
  expect(sends).toEqual([['/auth/email/otp', { email: EMAIL }]]);
});

it('hides the password until the code is verified, then keeps the proof in the draft', async () => {
  renderScreen();
  await act(async () => {});
  expect(screen.queryByPlaceholderText('Enter a password')).toBeNull();

  await enterCode();

  expect(await screen.findByText(`${EMAIL} is verified.`)).toBeTruthy();
  expect(screen.getByPlaceholderText('Enter a password')).toBeTruthy();
  expect(useRegistrationDraftStore.getState()).toMatchObject({
    emailVerificationToken: 'tok-1',
    verifiedEmail: EMAIL,
  });
});

it('shows a wrong code under the boxes and keeps the password hidden', async () => {
  mockPost.mockImplementation(async (url: string) => {
    if (url === '/auth/email/verify') throw new Error('That code is not right.');
    return { data: { data: null, error: null } };
  });
  renderScreen();
  await enterCode();

  expect(await screen.findByText('That code is not right.')).toBeTruthy();
  expect(screen.queryByPlaceholderText('Enter a password')).toBeNull();
});

it('keeps Continue off until the password meets every rule and matches', async () => {
  renderScreen();
  await enterCode();
  typePassword('short', 'short');
  await pressContinue();
  expect(mockLink).not.toHaveBeenCalled();

  typePassword('Passw0rd', 'Passw0rx');
  await pressContinue();
  expect(mockLink).not.toHaveBeenCalled();
});

it('links the email and password, then goes on to the location', async () => {
  renderScreen();
  await enterCode();
  typePassword();
  await pressContinue();

  expect(mockLink).toHaveBeenCalledWith({
    email: EMAIL,
    password: 'Passw0rd',
    emailVerificationToken: 'tok-1',
    signUpUid: 'uid-1',
  });
  expect(mockPush).toHaveBeenCalledWith('/(auth)/register-location');
});

it('sends a nanny on to her home location', async () => {
  useRegistrationDraftStore.setState({ role: 'nanny' });
  renderScreen();
  await enterCode();
  typePassword();
  await pressContinue();

  expect(mockPush).toHaveBeenCalledWith('/(auth)/register-nanny-location');
});

it('coming back keeps the proof and the password — no new code', async () => {
  useRegistrationDraftStore.setState({
    emailVerificationToken: 'tok-1',
    verifiedEmail: EMAIL,
    password: 'Passw0rd',
  });
  renderScreen();
  await act(async () => {});

  expect(mockPost).not.toHaveBeenCalled();
  expect(screen.getByPlaceholderText('Enter a password').props.value).toBe('Passw0rd');
  expect(screen.getByPlaceholderText('Re-enter your password').props.value).toBe('Passw0rd');
  await pressContinue();
  expect(mockLink).toHaveBeenCalledTimes(1);
});

it('a resumed account with a password on this email keeps it', async () => {
  useRegistrationDraftStore.setState({ passwordEmail: EMAIL });
  renderScreen();
  await enterCode();

  expect(await screen.findByText('Your password is already set.')).toBeTruthy();
  expect(screen.queryByPlaceholderText('Enter a password')).toBeNull();
  await pressContinue();
  expect(mockLink).toHaveBeenCalledWith(expect.objectContaining({ password: '' }));
});

it('asks for a password when the one on the account belongs to another email', async () => {
  useRegistrationDraftStore.setState({ passwordEmail: 'someone.else@example.com' });
  renderScreen();
  await enterCode();

  expect(await screen.findByPlaceholderText('Enter a password')).toBeTruthy();
});

it('a taken email is shown, and she stays', async () => {
  mockLink.mockRejectedValue({
    field: 'form',
    message: 'An account with this email already exists. Sign in instead.',
    code: 'auth/email-already-in-use',
  });
  renderScreen();
  await enterCode();
  typePassword();
  await pressContinue();

  expect(screen.getByText('An account with this email already exists. Sign in instead.')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.queryByText('Start again')).toBeNull();
});

it('a session that is no longer this sign-up’s offers Start again', async () => {
  mockLink.mockRejectedValue({
    field: 'form',
    message: 'Your session ended. Please start again.',
    code: 'session-mismatch',
  });
  renderScreen();
  await enterCode();
  typePassword();
  await pressContinue();

  fireEvent.press(screen.getByText('Start again'));
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});
