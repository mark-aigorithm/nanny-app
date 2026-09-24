import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

const mockSignInWithEmailAndPassword = jest.fn();
const mockLinkWithCredential = jest.fn();
// babel-plugin-jest-hoist only allows a jest.mock() factory to close over
// variables whose name starts with "mock" (see SignInScreen.test.tsx).
jest.mock('@mobile/lib/firebase', () => ({
  auth: Object.assign(
    () => ({
      signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
      get currentUser() {
        return { linkWithCredential: mockLinkWithCredential };
      },
    }),
    { EmailAuthProvider: { credential: jest.fn() } },
  ),
}));

import EmailSignInScreen from '../EmailSignInScreen';
import { api } from '@mobile/lib/api';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmailSignInScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  usePendingLinkStore.getState().clear();
});

it('signs in with the lower-cased email and password, then leaves for the root router', async () => {
  mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  renderScreen();

  fireEvent.changeText(screen.getByTestId('emailSignIn.email'), 'Mona@Example.com');
  fireEvent.changeText(screen.getByTestId('emailSignIn.password'), 'Password1');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() =>
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith('mona@example.com', 'Password1'),
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
});

it('shows the mapped error under the password field and does not navigate', async () => {
  mockSignInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });
  renderScreen();

  fireEvent.changeText(screen.getByTestId('emailSignIn.email'), 'mona@example.com');
  fireEvent.changeText(screen.getByTestId('emailSignIn.password'), 'wrongpass1A');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(screen.getByText('Incorrect email or password.')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
});

it('reaches Firebase with a password that is valid there but fails the app-side strength rules', async () => {
  // Firebase's hosted reset page (Authentication → Settings → Password
  // policy, default: 6+ characters) only enforces Firebase's own rule, not
  // this app's 8-char/uppercase/digit checklist — so someone who resets to
  // e.g. "sunshine22" must still be able to sign in with it. Only a
  // non-empty check belongs at this door; strength rules stay in the wizard
  // and the SMS reset, where the password is actually being created.
  mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  renderScreen();

  fireEvent.changeText(screen.getByTestId('emailSignIn.email'), 'mona@example.com');
  fireEvent.changeText(screen.getByTestId('emailSignIn.password'), 'sunshine22');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() =>
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith('mona@example.com', 'sunshine22'),
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
});

it('refuses an empty password locally, with no Firebase call', async () => {
  renderScreen();

  fireEvent.changeText(screen.getByTestId('emailSignIn.email'), 'mona@example.com');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(screen.getByText('Please enter your password.')).toBeTruthy());
  expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('connects a pending Google identity once signed in', async () => {
  const credential = { providerId: 'google.com', token: 't', secret: '' };
  usePendingLinkStore.getState().set({ provider: 'google', credential: credential as never, phoneHint: null });
  mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  mockLinkWithCredential.mockResolvedValue(undefined);
  renderScreen();

  fireEvent.changeText(screen.getByTestId('emailSignIn.email'), 'mona@example.com');
  fireEvent.changeText(screen.getByTestId('emailSignIn.password'), 'Password1');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockLinkWithCredential).toHaveBeenCalledWith(credential);
  expect(usePendingLinkStore.getState().pending).toBeNull();
});

it('does not connect a pending identity to a password account that has no row', async () => {
  const credential = { providerId: 'google.com', token: 't', secret: '' };
  usePendingLinkStore.getState().set({ provider: 'google', credential: credential as never, phoneHint: null });
  mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' } });
  (api.get as jest.Mock).mockRejectedValueOnce({ isAxiosError: true, response: { status: 404, data: {} } });
  renderScreen();

  fireEvent.changeText(screen.getByTestId('emailSignIn.email'), 'mona@example.com');
  fireEvent.changeText(screen.getByTestId('emailSignIn.password'), 'Password1');
  fireEvent.press(screen.getByText('Sign in'));

  // The root router signs a row-less account out, as it always has.
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockLinkWithCredential).not.toHaveBeenCalled();
  expect(usePendingLinkStore.getState().pending).toBeNull();
});
