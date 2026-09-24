import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { MappedAuthError } from '@mobile/lib/authErrors';

interface MutateOptions {
  onSuccess?: (result: 'deleted' | 'cancelled') => void;
  onError?: (error: MappedAuthError) => void;
}

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockMutate = jest.fn<void, [undefined, MutateOptions]>();
let mockIsPending = false;
jest.mock('@mobile/hooks/useAuth', () => ({
  ...jest.requireActual('@mobile/hooks/useAuth'),
  useDeleteAccount: () => ({ mutate: mockMutate, isPending: mockIsPending }),
}));

import Screen from '@mobile/screens/auth/PendingReviewScreen';
import { useConfirmDialogStore } from '@mobile/store/confirmDialogStore';

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <Screen />
    </QueryClientProvider>,
  );
  await act(async () => {});
  return rendered;
}

function confirmOpenDialog() {
  const dialog = useConfirmDialogStore.getState().dialog;
  act(() => {
    useConfirmDialogStore.getState().dismiss();
    dialog?.onConfirm?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPending = false;
  useConfirmDialogStore.setState({ dialog: null });
});

describe('PendingReviewScreen — delete account', () => {
  it('asks in the destructive style before deleting', async () => {
    const { getByText } = await renderScreen();
    fireEvent.press(getByText('Delete account'));

    expect(useConfirmDialogStore.getState().dialog).toMatchObject({
      title: 'Delete your account?',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('deletes on confirm, leaves for the root and says so', async () => {
    mockMutate.mockImplementation((_v, opts) => opts.onSuccess?.('deleted'));
    const { getByText } = await renderScreen();
    fireEvent.press(getByText('Delete account'));
    confirmOpenDialog();

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(useConfirmDialogStore.getState().dialog).toMatchObject({ title: 'Account deleted' });
  });

  it("shows the server's refusal", async () => {
    mockMutate.mockImplementation((_v, opts) =>
      opts.onError?.({
        field: 'form',
        message: 'Finish or cancel your upcoming bookings before deleting your account.',
      }),
    );
    const { getByText } = await renderScreen();
    fireEvent.press(getByText('Delete account'));
    confirmOpenDialog();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(useConfirmDialogStore.getState().dialog).toMatchObject({
      title: "Couldn't delete your account",
      message: 'Finish or cancel your upcoming bookings before deleting your account.',
    });
  });

  it('does nothing when cancelled', async () => {
    mockMutate.mockImplementation((_v, opts) => opts.onSuccess?.('cancelled'));
    const { getByText } = await renderScreen();
    fireEvent.press(getByText('Delete account'));
    confirmOpenDialog();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(useConfirmDialogStore.getState().dialog).toBeNull();
  });

  it('reads "Deleting…" and locks Sign out while it runs', async () => {
    mockIsPending = true;
    const { getByText } = await renderScreen();

    expect(getByText('Deleting…')).toBeTruthy();
    fireEvent.press(getByText('Deleting…'));
    fireEvent.press(getByText('Sign out'));
    await act(async () => {});
    expect(useConfirmDialogStore.getState().dialog).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
