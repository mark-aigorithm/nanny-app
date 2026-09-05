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
jest.mock('@mobile/hooks/useAuth', () => ({
  useSignOut: () => ({ mutate: mockSignOut, isPending: false }),
}));

import VerifyEmailScreen from '@mobile/screens/auth/VerifyEmailScreen';

const EMAIL = 'sarah@example.com';

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
  mockConfirmCode.mockResolvedValue(true);
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
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
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
    mockConfirmCode.mockResolvedValue(false);
    const screen = renderScreen();

    await reachCodePane(screen);
    fireEvent.changeText(screen.getByTestId('verifyEmail.code'), '000000');
    fireEvent.press(screen.getByText('Confirm'));

    await waitFor(() => expect(mockConfirmCode).toHaveBeenCalled());
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
