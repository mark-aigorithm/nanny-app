import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

let mockOutcome: string | { error: { field: string; message: string } } = 'signed-in';
const mockMutate = jest.fn(
  (
    _vars: unknown,
    opts: { onSuccess?: (o: string) => void; onError?: (e: { message: string }) => void },
  ) => {
    if (typeof mockOutcome === 'string') opts.onSuccess?.(mockOutcome);
    else opts.onError?.(mockOutcome.error);
  },
);
jest.mock('@mobile/hooks/useSocialSignIn', () => ({
  useSocialSignIn: () => ({ mutate: mockMutate, isPending: false }),
}));

const mockAppleAvailable = jest.fn();
jest.mock('@mobile/lib/socialAuth', () => ({
  isAppleSignInAvailable: () => mockAppleAvailable(),
}));

import SocialAuthButtons from '@mobile/components/SocialAuthButtons';

beforeEach(() => {
  jest.clearAllMocks();
  mockAppleAvailable.mockResolvedValue(false);
});

it('sends an existing account to the root router', async () => {
  mockOutcome = 'signed-in';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockMutate).toHaveBeenCalledWith({ provider: 'google', role: undefined }, expect.anything());
  expect(mockReplace).toHaveBeenCalledWith('/');
  // Settle the Apple-availability check kicked off on mount before the test ends.
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('takes a new user with a role straight to step 1', async () => {
  mockOutcome = 'new-user';
  render(<SocialAuthButtons context="sign-up" role="nanny" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-1', params: { role: 'nanny' } });
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('asks a new user from sign-in to pick a role first', async () => {
  mockOutcome = 'new-user';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockPush).toHaveBeenCalledWith('/(auth)/role-selection');
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('sends a collision on sign-up to the sign-in screen', async () => {
  mockOutcome = 'needs-link';
  render(<SocialAuthButtons context="sign-up" role="parent" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockPush).toHaveBeenCalledWith('/(auth)/sign-in');
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('stays put on a collision from the sign-in screen, where the banner appears', async () => {
  mockOutcome = 'needs-link';
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('shows the error under the buttons', async () => {
  mockOutcome = { error: { field: 'form', message: 'Google sign-in failed. Please try again.' } };
  render(<SocialAuthButtons context="sign-in" />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(screen.getByText('Google sign-in failed. Please try again.')).toBeTruthy();
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('does not start while disabled', async () => {
  render(<SocialAuthButtons context="sign-up" disabled />);
  fireEvent.press(screen.getByText('Continue with Google'));
  expect(mockMutate).not.toHaveBeenCalled();
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});

it('asks whether Apple is available', async () => {
  render(<SocialAuthButtons context="sign-in" />);
  await waitFor(() => expect(mockAppleAvailable).toHaveBeenCalled());
});
