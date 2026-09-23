import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

const mockSendReset = jest.fn();
const mockSignInWithPhoneNumber = jest.fn();
const mockConfirm = jest.fn();
const mockUpdatePassword = jest.fn();
const mockDelete = jest.fn();
const mockSignOut = jest.fn();
// babel-plugin-jest-hoist only allows a jest.mock() factory to close over
// variables whose name starts with "mock" (see SignInScreen.test.tsx), hence
// `mockCurrentUser` rather than `currentUser`.
let mockCurrentUser: {
  email: string | null;
  updatePassword: jest.Mock;
  delete: jest.Mock;
  providerData?: { providerId: string }[];
} | null = null;

jest.mock('@mobile/lib/firebase', () => ({
  auth: Object.assign(
    () => ({
      sendPasswordResetEmail: mockSendReset,
      signInWithPhoneNumber: mockSignInWithPhoneNumber,
      signOut: mockSignOut,
      get currentUser() {
        return mockCurrentUser;
      },
    }),
    { EmailAuthProvider: { credential: jest.fn() } },
  ),
}));

import ForgotPasswordScreen from '../ForgotPasswordScreen';

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ForgotPasswordScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  mockSendReset.mockResolvedValue(undefined);
  mockCurrentUser = {
    email: 'mona@example.com',
    updatePassword: mockUpdatePassword,
    delete: mockDelete,
  };
  mockSignInWithPhoneNumber.mockResolvedValue({ confirm: mockConfirm });
  mockConfirm.mockResolvedValue(undefined);
  mockUpdatePassword.mockResolvedValue(undefined);
});

it('mails a reset link and never claims the address exists', async () => {
  renderScreen();

  fireEvent.press(screen.getByText('Email me a reset link'));
  fireEvent.changeText(screen.getByTestId('forgotPassword.email'), 'mona@example.com');
  fireEvent.press(screen.getByText('Send link'));

  await waitFor(() => expect(mockSendReset).toHaveBeenCalledWith('mona@example.com'));
  expect(
    screen.getByText('If an account exists for that address, the link is on its way.'),
  ).toBeTruthy();
});

it('refuses to write a password onto an SMS-minted account with no email on file', async () => {
  // `confirm()` leaves a currentUser with no email — the "orphan" case: the
  // number has no account, so Firebase just minted a fresh phone-only user.
  mockCurrentUser = { email: null, updatePassword: mockUpdatePassword, delete: mockDelete, providerData: [{ providerId: 'phone' }] };
  mockDelete.mockResolvedValue(undefined);

  renderScreen();

  fireEvent.press(screen.getByText('Text me a code instead'));
  fireEvent.changeText(screen.getByTestId('forgotPassword.phone'), '1234567891');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('forgotPassword.code'), '111111');
  fireEvent.changeText(screen.getByPlaceholderText('Enter a new password'), 'Password1');
  fireEvent.changeText(screen.getByPlaceholderText('Re-enter your password'), 'Password1');
  fireEvent.press(screen.getByText('Reset password'));

  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
  expect(mockUpdatePassword).not.toHaveBeenCalled();
  expect(
    screen.getByText("We couldn't find an account for that number. Sign up first."),
  ).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('signs out if the orphan-account delete itself fails', async () => {
  mockCurrentUser = { email: null, updatePassword: mockUpdatePassword, delete: mockDelete, providerData: [{ providerId: 'phone' }] };
  mockDelete.mockRejectedValueOnce(new Error('Network error'));
  mockSignOut.mockResolvedValueOnce(undefined);

  renderScreen();

  fireEvent.press(screen.getByText('Text me a code instead'));
  fireEvent.changeText(screen.getByTestId('forgotPassword.phone'), '1234567892');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('forgotPassword.code'), '222222');
  fireEvent.changeText(screen.getByPlaceholderText('Enter a new password'), 'Password1');
  fireEvent.changeText(screen.getByPlaceholderText('Re-enter your password'), 'Password1');
  fireEvent.press(screen.getByText('Reset password'));

  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(mockUpdatePassword).not.toHaveBeenCalled();
  expect(
    screen.getByText("We couldn't find an account for that number. Sign up first."),
  ).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});
