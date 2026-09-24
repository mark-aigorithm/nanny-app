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

const mockGet = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  apiStatusOf: (e: unknown) => (e as { response?: { status?: number } })?.response?.status ?? null,
  isNotFound: (e: unknown) => (e as { response?: { status?: number } })?.response?.status === 404,
}));

const NOT_FOUND = { isAxiosError: true, response: { status: 404, data: {} } };

import ForgotPasswordScreen from '../ForgotPasswordScreen';
import { useConfirmDialogStore } from '@mobile/store/confirmDialogStore';

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
  mockGet.mockResolvedValue({ data: { data: { id: 1 }, error: null } });
  useConfirmDialogStore.setState({ dialog: null });
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

it('says a reset also creates a password for a Google or Apple account', () => {
  renderScreen();
  expect(
    screen.getByText('Signed up with Google or Apple? Choose "Text me a code instead": it adds a password and keeps your Google or Apple sign-in.'),
  ).toBeTruthy();
});

it('warns that the email link disconnects Google or Apple, on the email channel', () => {
  renderScreen();
  fireEvent.press(screen.getByText('Email me a reset link'));
  expect(
    screen.getByText('Signed up with Google or Apple? This link disconnects it. Use "Text me a code instead".'),
  ).toBeTruthy();
});

it('refuses to write a password onto an SMS-minted account with no email on file', async () => {
  // `confirm()` leaves a currentUser with no email — the "orphan" case: the
  // number has no account, so Firebase just minted a fresh phone-only user.
  mockCurrentUser = { email: null, updatePassword: mockUpdatePassword, delete: mockDelete, providerData: [{ providerId: 'phone' }] };
  mockDelete.mockResolvedValue(undefined);
  mockGet.mockRejectedValue(NOT_FOUND);

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
  mockGet.mockRejectedValue(NOT_FOUND);

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

async function resetBySms(phone: string, code: string) {
  fireEvent.press(screen.getByText('Text me a code instead'));
  fireEvent.changeText(screen.getByTestId('forgotPassword.phone'), phone);
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('forgotPassword.code'), code);
  fireEvent.changeText(screen.getByPlaceholderText('Enter a new password'), 'Password1');
  fireEvent.changeText(screen.getByPlaceholderText('Re-enter your password'), 'Password1');
  fireEvent.press(screen.getByText('Reset password'));
}

it('updates the password and goes through the root gate for an account with a row', async () => {
  renderScreen();
  await resetBySms('1234567893', '333333');

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockUpdatePassword).toHaveBeenCalledWith('Password1');
  expect(useConfirmDialogStore.getState().dialog).toBeNull();
});

it('sends an unfinished sign-up to finish setting up, leaving its password alone', async () => {
  mockCurrentUser = {
    email: 'mona@example.com',
    updatePassword: mockUpdatePassword,
    delete: mockDelete,
    providerData: [{ providerId: 'phone' }, { providerId: 'password' }],
  };
  mockGet.mockRejectedValue(NOT_FOUND);

  renderScreen();
  await resetBySms('1234567894', '444444');

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockUpdatePassword).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
  expect(useConfirmDialogStore.getState().dialog).toMatchObject({
    title: 'Finish setting up your account first.',
    message: "Your sign-up isn't finished yet. Pick up where you left off.",
  });
});

it('drops an SMS-channel error when backing out to the channel choice', async () => {
  mockSignInWithPhoneNumber.mockRejectedValueOnce({ code: 'auth/too-many-requests' });
  renderScreen();

  fireEvent.press(screen.getByText('Text me a code instead'));
  fireEvent.changeText(screen.getByTestId('forgotPassword.phone'), '1234567895');
  fireEvent.press(screen.getByText('Send code'));
  expect(await screen.findByText('Too many attempts. Try again in a few minutes.')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Back'));
  expect(screen.getByText('Email me a reset link')).toBeTruthy();
  expect(screen.queryByText('Too many attempts. Try again in a few minutes.')).toBeNull();
});

it('falls back to the sign-in landing when there is nothing to go back to', () => {
  mockCanGoBack.mockReturnValue(false);
  renderScreen();

  fireEvent.press(screen.getByLabelText('Back'));
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
});
