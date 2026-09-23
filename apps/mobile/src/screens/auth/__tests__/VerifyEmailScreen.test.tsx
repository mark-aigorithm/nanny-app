import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRequestCode = jest.fn();
const mockConfirmCode = jest.fn();
const mockSetError = jest.fn();
let mockError: string | null = null;

jest.mock('@mobile/hooks/useVerifiedEmailSubmit', () => ({
  useVerifiedEmailSubmit: () => ({
    requestCode: mockRequestCode,
    confirmCode: mockConfirmCode,
    isSending: false,
    isConfirming: false,
    error: mockError,
    setError: mockSetError,
  }),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

const mockSignOut = jest.fn();
const mockSignOutMutateAsync = jest.fn();
jest.mock('@mobile/hooks/useAuth', () => ({
  useSignOut: () => ({ mutate: mockSignOut, mutateAsync: mockSignOutMutateAsync, isPending: false }),
}));

// Overrides jest.setup.js's global stub — this screen is the one place that
// needs signInWithCustomToken, to re-establish a session after the backend's
// email swap revokes the one the screen walked in with.
const mockSignInWithCustomToken = jest.fn();
const mockFirebaseSignOut = jest.fn();
jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    signInWithCustomToken: mockSignInWithCustomToken,
    signOut: mockFirebaseSignOut,
    currentUser: null,
  }),
}));

import VerifyEmailScreen from '@mobile/screens/auth/VerifyEmailScreen';

const EMAIL = 'sarah@example.com';
const CUSTOM_TOKEN = 'custom-token-abc';

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VerifyEmailScreen />
    </QueryClientProvider>,
  );
}

/** Fill in the first pane and tap Send code. */
async function reachCodePane(screen: ReturnType<typeof renderScreen>) {
  fireEvent.changeText(screen.getByTestId('verifyEmail.email'), EMAIL);
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => screen.getByText('Check your email'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockError = null;
  mockRequestCode.mockResolvedValue(true);
  // Success now resolves with the fresh Firebase custom token the backend
  // mints after the email swap, not a bare boolean.
  mockConfirmCode.mockResolvedValue(CUSTOM_TOKEN);
  mockSignInWithCustomToken.mockResolvedValue(undefined);
  mockSignOutMutateAsync.mockResolvedValue(undefined);
});

describe('VerifyEmailScreen', () => {
  it('says the phone number stays the way in, and asks for no password', () => {
    const { getByText, queryByTestId } = renderScreen();
    expect(getByText(/keep signing in with your phone number/i)).toBeTruthy();
    expect(queryByTestId('verifyEmail.password')).toBeNull();
  });

  it('walks address → code → confirmed, then leaves for the role router', async () => {
    const screen = renderScreen();

    await reachCodePane(screen);
    expect(mockRequestCode).toHaveBeenCalledWith(EMAIL);
    expect(screen.getByText(`We sent a 6-digit code to ${EMAIL}.`)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('verifyEmail.code'), '123456');
    fireEvent.press(screen.getByText('Confirm'));

    await waitFor(() => expect(mockConfirmCode).toHaveBeenCalledWith(EMAIL, '123456'));
    // The gate's swap revoked the session the screen walked in with — the
    // returned custom token re-establishes one for the same account before
    // handing off to the role router.
    await waitFor(() => expect(mockSignInWithCustomToken).toHaveBeenCalledWith(CUSTOM_TOKEN));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('signs out and sends her to sign in again when the fresh session cannot be established', async () => {
    mockSignInWithCustomToken.mockRejectedValue(new Error('network blip'));
    const screen = renderScreen();

    await reachCodePane(screen);
    fireEvent.changeText(screen.getByTestId('verifyEmail.code'), '123456');
    fireEvent.press(screen.getByText('Confirm'));

    await waitFor(() => expect(mockSignInWithCustomToken).toHaveBeenCalledWith(CUSTOM_TOKEN));
    // The gate already succeeded server-side (the row and the Firebase
    // address are both updated) — only the re-sign-in failed, so the old
    // session must be dropped explicitly rather than left half-dead.
    await waitFor(() => expect(mockSignOutMutateAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByText('Your email is verified. Please sign in again.'),
      ).toBeTruthy(),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('refuses to send to an address that is not one', async () => {
    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('verifyEmail.email'), 'not-an-address');
    fireEvent.press(getByText('Send code'));

    await waitFor(() => expect(mockSetError).toHaveBeenCalled());
    expect(mockRequestCode).not.toHaveBeenCalled();
  });

  it('stays on the first pane when the send fails', async () => {
    mockRequestCode.mockResolvedValue(false);
    const { getByTestId, getByText, queryByText } = renderScreen();

    fireEvent.changeText(getByTestId('verifyEmail.email'), EMAIL);
    fireEvent.press(getByText('Send code'));

    await waitFor(() => expect(mockRequestCode).toHaveBeenCalled());
    expect(queryByText('Check your email')).toBeNull();
  });

  it('keeps her on the screen when the code is wrong', async () => {
    mockConfirmCode.mockResolvedValue(null);
    const screen = renderScreen();

    await reachCodePane(screen);
    fireEvent.changeText(screen.getByTestId('verifyEmail.code'), '000000');
    fireEvent.press(screen.getByText('Confirm'));

    await waitFor(() => expect(mockConfirmCode).toHaveBeenCalled());
    expect(mockSignInWithCustomToken).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('surfaces the error the submit hook reported', () => {
    mockError = 'That code is not right. Please try again.';
    const { getByText } = renderScreen();
    expect(getByText('That code is not right. Please try again.')).toBeTruthy();
  });

  it('is not dismissable — the only way past it is signing out', () => {
    const { getByText, queryByText } = renderScreen();
    expect(queryByText('Maybe later')).toBeNull();

    fireEvent.press(getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
