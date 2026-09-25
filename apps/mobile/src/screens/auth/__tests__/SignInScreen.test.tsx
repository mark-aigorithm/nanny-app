import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, dismissTo: mockDismissTo }),
}));

const mockConfirm = jest.fn();
const mockDelete = jest.fn();
const mockSignInWithPhoneNumber = jest.fn();
const mockSignOut = jest.fn();
const mockLinkWithCredential = jest.fn();
// babel-plugin-jest-hoist only allows a jest.mock() factory to close over
// variables whose name starts with "mock" — hence `mockCurrentUser` rather
// than `currentUser`.
let mockCurrentUser: {
  delete: jest.Mock;
  email: string | null;
  providerData: { providerId: string }[];
  linkWithCredential: jest.Mock;
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
const mockPost = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) },
  unwrap: async (p: Promise<{ data: { data: unknown } }>) => (await p).data.data,
  getApiErrorMessage: () => 'Something went wrong. Please try again.',
  apiStatusOf: (e: unknown) => (e as { response?: { status?: number } })?.response?.status ?? null,
  isNotFound: (e: unknown) => (e as { response?: { status?: number } })?.response?.status === 404,
}));

import SignInScreen from '../SignInScreen';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useGuestStore } from '@mobile/store/guestStore';

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
  usePendingLinkStore.getState().clear();
  useGuestStore.setState({ isGuest: false });
  mockCurrentUser = {
    delete: mockDelete,
    email: 'mona@example.com',
    providerData: [{ providerId: 'phone' }],
    linkWithCredential: mockLinkWithCredential,
  };
  mockSignInWithPhoneNumber.mockResolvedValue({ confirm: mockConfirm });
  mockConfirm.mockResolvedValue(undefined);
  mockGet.mockResolvedValue({ data: { data: { id: 1 }, error: null } });
  // /auth/phone-account — the number has an account unless a test says not.
  mockPost.mockResolvedValue({ data: { data: { hasAccount: true }, error: null } });
  mockLinkWithCredential.mockResolvedValue(undefined);
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

it('resumes an unfinished sign-up that also holds a Google identity, deleting nothing', async () => {
  // A Google sign-up whose /auth/register failed after its phone was linked:
  // the SMS proved it is hers, so the root gate resumes it.
  mockCurrentUser = {
    delete: mockDelete,
    email: 'mona@gmail.com',
    providerData: [{ providerId: 'google.com' }, { providerId: 'phone' }],
    linkWithCredential: mockLinkWithCredential,
  };
  mockGet.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404, data: { error: 'User profile not found. Please complete registration.' } },
  });

  renderScreen();

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567894');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('signIn.code'), '444444');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockSignOut).not.toHaveBeenCalled();
});

it("says it couldn't connect when /auth/me fails for another reason", async () => {
  mockGet.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: {} } });
  mockSignOut.mockResolvedValue(undefined);

  renderScreen();

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567895');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('signIn.code'), '555555');
  fireEvent.press(screen.getByText('Sign in'));

  expect(await screen.findByText("Couldn't connect. Check your connection and try again.")).toBeTruthy();
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

const PENDING_GOOGLE = {
  provider: 'google' as const,
  credential: { providerId: 'google.com', token: 'google-id-token', secret: '' } as never,
  phoneHint: '+201234567891',
};

it('offers Google beside the phone door', () => {
  renderScreen();
  expect(screen.getByText('Continue with Google')).toBeTruthy();
});

it('explains a pending connection, prefills the number, and links after the SMS sign-in', async () => {
  usePendingLinkStore.getState().set(PENDING_GOOGLE);
  renderScreen();

  expect(
    screen.getByText('You already have an account. Sign in with your phone once to connect Google.'),
  ).toBeTruthy();
  expect(screen.getByTestId('signIn.phone').props.value).toBe('1234567891');

  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith('+201234567891', undefined));
  fireEvent.changeText(screen.getByTestId('signIn.code'), '111111');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockLinkWithCredential).toHaveBeenCalledWith(PENDING_GOOGLE.credential);
  expect(usePendingLinkStore.getState().pending).toBeNull();
});

it('drops the pending connection on "Not now"', () => {
  usePendingLinkStore.getState().set(PENDING_GOOGLE);
  renderScreen();

  fireEvent.press(screen.getByText('Not now'));

  expect(usePendingLinkStore.getState().pending).toBeNull();
  expect(
    screen.queryByText('You already have an account. Sign in with your phone once to connect Google.'),
  ).toBeNull();
});

describe('the front door', () => {
  it('welcomes by the app name', () => {
    renderScreen();
    expect(screen.getByText('Welcome to NannyNow')).toBeTruthy();
  });

  it('opens the email door from its button', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Sign in with email'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/sign-in-email');
  });

  it('opens password reset from "Forgot password?"', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('opens sign-up from "Sign up"', () => {
    renderScreen();
    expect(screen.getByText('New to NannyNow?')).toBeTruthy();
    fireEvent.press(screen.getByText('Sign up'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/role-selection');
  });

  it('lets a visitor browse as a guest', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Continue as guest'));
    expect(useGuestStore.getState().isGuest).toBe(true);
    expect(mockDismissTo).toHaveBeenCalledWith('/(parent)/home');
  });

  it('hides the guest link while a Google connection is waiting to be linked', () => {
    usePendingLinkStore.getState().set(PENDING_GOOGLE);
    renderScreen();
    expect(screen.queryByText('Continue as guest')).toBeNull();
  });

  it('shows only the code UI once a code is on its way', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567891');
    fireEvent.press(screen.getByText('Send code'));
    await waitFor(() => expect(screen.getByTestId('signIn.code')).toBeTruthy());
    expect(screen.queryByText('Sign in with email')).toBeNull();
    expect(screen.queryByText('Forgot password?')).toBeNull();
    expect(screen.queryByText('Sign up')).toBeNull();
    expect(screen.queryByText('Continue as guest')).toBeNull();
  });

  it('prefills the number when a connection is parked after the screen mounted', () => {
    renderScreen();
    act(() => {
      usePendingLinkStore.getState().set(PENDING_GOOGLE);
    });
    expect(screen.getByTestId('signIn.phone').props.value).toBe('1234567891');
  });

  it('lets her fix a mistyped number from the code phase', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567891');
    fireEvent.press(screen.getByText('Send code'));
    await waitFor(() => expect(screen.getByTestId('signIn.code')).toBeTruthy());

    fireEvent.press(screen.getByText('Use a different number'));

    expect(screen.getByTestId('signIn.phone').props.value).toBe('1234567891');
    expect(screen.getByText('Send code')).toBeTruthy();
    expect(screen.getByText('Continue as guest')).toBeTruthy();
    expect(screen.getByText('Sign up')).toBeTruthy();
  });
});

it('says a number has no account before any SMS is sent', async () => {
  mockPost.mockResolvedValue({ data: { data: { hasAccount: false }, error: null } });
  renderScreen();

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567893');
  fireEvent.press(screen.getByText('Send code'));

  expect(
    await screen.findByText("We couldn't find an account for that number. Sign up first."),
  ).toBeTruthy();
  expect(mockPost).toHaveBeenCalledWith('/auth/phone-account', { phone: '+201234567893' });
  expect(mockSignInWithPhoneNumber).not.toHaveBeenCalled();
});
