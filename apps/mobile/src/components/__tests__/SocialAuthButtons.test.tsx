import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, dismissTo: mockDismissTo }),
}));

let mockOutcome: string | { error: { field: string; message: string } } = 'signed-in';
const mockMutateAsync = jest.fn(
  (_vars: unknown): Promise<string> =>
    typeof mockOutcome === 'string'
      ? Promise.resolve(mockOutcome)
      : Promise.reject(mockOutcome.error),
);
jest.mock('@mobile/hooks/useSocialSignIn', () => ({
  useSocialSignIn: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const mockAppleAvailable = jest.fn();
jest.mock('@mobile/lib/socialAuth', () => ({
  isAppleSignInAvailable: () => mockAppleAvailable(),
}));

// Apple's own button, as something a test can find and press. The global
// stub renders nothing.
jest.mock('expo-apple-authentication', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) =>
      createElement(Text, { onPress }, 'Apple button'),
  };
});

const APPLE_HINT = 'Choose mother or nanny first to continue with Apple.';

import SocialAuthButtons from '@mobile/components/SocialAuthButtons';

beforeEach(() => {
  jest.clearAllMocks();
  mockAppleAvailable.mockResolvedValue(false);
});

it('sends an existing account to the root router', async () => {
  mockOutcome = 'signed-in';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockMutateAsync).toHaveBeenCalledWith({ provider: 'google', role: undefined });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  // Settle the Apple-availability check kicked off on mount before the test ends.
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('takes a new user with a role straight to step 1', async () => {
  mockOutcome = 'new-user';
  render(<SocialAuthButtons context="sign-up" role="nanny" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/register-step-1',
      params: { role: 'nanny' },
    }),
  );
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

// "Create your account" hides these buttons as soon as the social draft is
// seeded, which happens inside the sign-in, before its outcome is back. React
// Query drops mutate()'s own callbacks for an unmounted caller, so navigating
// from them left her on the role screen, signed in with nowhere to go.
it('still takes her to step 1 when the buttons unmount mid-sign-in', async () => {
  let settle: (outcome: string) => void = () => {};
  mockMutateAsync.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        settle = resolve;
      }),
  );
  const { unmount } = render(<SocialAuthButtons context="sign-up" role="parent" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
  unmount();
  settle('new-user');
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/register-step-1',
      params: { role: 'parent' },
    }),
  );
});

it('asks a new user from sign-in to pick a role first', async () => {
  mockOutcome = 'new-user';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(auth)/role-selection'));
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('sends a collision on sign-up to the sign-in screen', async () => {
  mockOutcome = 'needs-link';
  render(<SocialAuthButtons context="sign-up" role="parent" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('stays put on a collision from the sign-in screen, where the banner appears', async () => {
  mockOutcome = 'needs-link';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockDismissTo).not.toHaveBeenCalled();
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('shows the error under the buttons', async () => {
  mockOutcome = { error: { field: 'form', message: 'Google sign-in failed. Please try again.' } };
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(await screen.findByText('Google sign-in failed. Please try again.')).toBeTruthy();
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('does not start while disabled', async () => {
  render(<SocialAuthButtons context="sign-up" disabled />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockMutateAsync).not.toHaveBeenCalled();
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('asks whether Apple is available', async () => {
  render(<SocialAuthButtons context="sign-in" />);
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it("offers Apple's button when Apple is available", async () => {
  mockAppleAvailable.mockResolvedValue(true);
  mockOutcome = 'signed-in';
  render(<SocialAuthButtons context="sign-in" />);

  fireEvent.press(await screen.findByText('Apple button'));

  expect(mockMutateAsync).toHaveBeenCalledWith({ provider: 'apple', role: undefined });
  expect(screen.queryByText(APPLE_HINT)).toBeNull();
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
});

// Apple's official button has no disabled look, so on "Create your account"
// before a role is picked it looked tappable and did nothing.
it('swaps the Apple button for a hint while disabled', async () => {
  mockAppleAvailable.mockResolvedValue(true);
  render(<SocialAuthButtons context="sign-up" disabled />);

  expect(await screen.findByText(APPLE_HINT)).toBeTruthy();
  expect(screen.queryByText('Apple button')).toBeNull();
  // Google's button has a disabled look of its own, so it stays.
  expect(screen.getByText('Continue with Google')).toBeTruthy();
});

it('shows no Apple hint where Apple is unavailable', async () => {
  render(<SocialAuthButtons context="sign-up" disabled />);
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
  expect(screen.queryByText(APPLE_HINT)).toBeNull();
});
