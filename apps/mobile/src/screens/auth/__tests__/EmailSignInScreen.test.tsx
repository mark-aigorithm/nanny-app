import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

const mockSignInWithEmailAndPassword = jest.fn();
// babel-plugin-jest-hoist only allows a jest.mock() factory to close over
// variables whose name starts with "mock" (see SignInScreen.test.tsx).
jest.mock('@mobile/lib/firebase', () => ({
  auth: Object.assign(
    () => ({
      signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
    }),
    { EmailAuthProvider: { credential: jest.fn() } },
  ),
}));

import EmailSignInScreen from '../EmailSignInScreen';

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
