import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

const mockConfirm = jest.fn();
const mockDelete = jest.fn();
const mockSignInWithPhoneNumber = jest.fn();
const mockSignOut = jest.fn();
// babel-plugin-jest-hoist only allows a jest.mock() factory to close over
// variables whose name starts with "mock" — hence `mockCurrentUser` rather
// than `currentUser`, which the brief's literal test code used and which
// fails at collection time with "module factory ... not allowed to
// reference any out-of-scope variables".
let mockCurrentUser: {
  delete: jest.Mock;
  email: string | null;
  providerData: { providerId: string }[];
} | null = null;

jest.mock('@mobile/lib/firebase', () => ({
  auth: Object.assign(
    () => ({
      signInWithPhoneNumber: mockSignInWithPhoneNumber,
      signOut: mockSignOut,
      get currentUser() {
        return mockCurrentUser;
      },
    }),
    { EmailAuthProvider: { credential: jest.fn() } },
  ),
}));

const mockGet = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  unwrap: async (p: Promise<{ data: { data: unknown } }>) => (await p).data.data,
  getApiErrorMessage: () => 'Something went wrong. Please try again.',
}));

import SignInScreen from '../SignInScreen';

// No shared render helper exists yet (see VerifyEmailScreen.test.tsx) — wrap
// the screen in a QueryClientProvider the same way that test does.
function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SignInScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { delete: mockDelete, email: 'mona@example.com', providerData: [{ providerId: 'phone' }] };
  mockSignInWithPhoneNumber.mockResolvedValue({ confirm: mockConfirm });
  mockConfirm.mockResolvedValue(undefined);
  mockGet.mockResolvedValue({ data: { data: { id: 1 }, error: null } });
});

it('texts a code and signs in when the number has an account', async () => {
  renderScreen();

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567891');
  fireEvent.press(screen.getByText('Send code'));

  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith('+201234567891', undefined));

  fireEvent.changeText(screen.getByTestId('signIn.code'), '111111');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockDelete).not.toHaveBeenCalled();
});

it('deletes the account Firebase just minted when the number has no profile', async () => {
  mockGet.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404, data: { error: 'User profile not found. Please complete registration.' } },
  });

  renderScreen();

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567892');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('signIn.code'), '222222');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
  expect(
    screen.getByText("We couldn't find an account for that number. Sign up first."),
  ).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('signs out if delete fails when no profile exists', async () => {
  mockGet.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404, data: { error: 'User profile not found. Please complete registration.' } },
  });
  mockDelete.mockRejectedValueOnce(new Error('Network error'));
  mockSignOut.mockResolvedValueOnce(undefined);

  renderScreen();

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567893');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('signIn.code'), '333333');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(
    screen.getByText("We couldn't find an account for that number. Sign up first."),
  ).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('signs out rather than deleting when the stray account also holds a Google identity', async () => {
  // A Google sign-up whose /auth/register failed after its phone was linked:
  // deleting would take the Google identity with it.
  mockCurrentUser = {
    delete: mockDelete,
    email: 'mona@gmail.com',
    providerData: [{ providerId: 'google.com' }, { providerId: 'phone' }],
  };
  mockGet.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404, data: { error: 'User profile not found. Please complete registration.' } },
  });
  mockSignOut.mockResolvedValueOnce(undefined);

  renderScreen();

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567894');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('signIn.code'), '444444');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(mockDelete).not.toHaveBeenCalled();
  expect(
    screen.getByText("We couldn't find an account for that number. Sign up first."),
  ).toBeTruthy();
});
