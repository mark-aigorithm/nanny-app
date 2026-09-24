import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserResponse } from '@nanny-app/shared';

import type { MappedAuthError } from '@mobile/lib/authErrors';

interface DeleteMutateOptions {
  onSuccess?: (result: 'deleted' | 'cancelled') => void;
  onError?: (error: MappedAuthError) => void;
}

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn().mockResolvedValue({ data: { data: { unreadCount: 2 }, error: null } }) },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockSignOutMutate = jest.fn();
const mockDeleteMutate = jest.fn<void, [undefined, DeleteMutateOptions]>();
let mockIsDeleting = false;
jest.mock('@mobile/hooks/useAuth', () => ({
  useSignOut: () => ({ mutate: mockSignOutMutate, isPending: false }),
  useDeleteAccount: () => ({ mutate: mockDeleteMutate, isPending: mockIsDeleting }),
}));

// No SafeAreaProvider in jest — stub the insets hook the floating bar uses.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import MotherProfileWalletScreen from '@mobile/screens/parent/MotherProfileWalletScreen';
import { useConfirmDialogStore } from '@mobile/store/confirmDialogStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const PROFILE = {
  id: 1,
  firebaseUid: 'uid',
  email: 'mina@example.com',
  phone: null,
  firstName: 'Mina',
  lastName: 'Roger',
  dateOfBirth: null,
  avatarUrl: null,
  role: 'MOTHER',
  isEmailVerified: true,
  isPhoneVerified: false,
  approvalStatus: 'APPROVED',
  idDocumentType: null,
  rejectionReason: null,
  address: null,
  latitude: null,
  longitude: null,
  createdAt: '2026-01-15T00:00:00.000Z',
} as UserResponse;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MotherProfileWalletScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsDeleting = false;
  useUserProfileStore.setState({ profile: PROFILE });
  useConfirmDialogStore.setState({ dialog: null });
});

/** Presses the dialog's confirm action the way ConfirmDialogHost does. */
function confirmOpenDialog() {
  const dialog = useConfirmDialogStore.getState().dialog;
  act(() => {
    useConfirmDialogStore.getState().dismiss();
    dialog?.onConfirm?.();
  });
}

describe('Account screen', () => {
  it('shows the big name header and verified pill', () => {
    const { getByText } = renderScreen();
    getByText('Mina Roger');
    getByText('Verified');
  });

  it('shows Member since year when not verified', () => {
    useUserProfileStore.setState({
      profile: { ...PROFILE, approvalStatus: 'PENDING_ID' },
    });
    const { getByText } = renderScreen();
    getByText('Member since 2026');
  });

  it('routes the quick tiles', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Account details'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/account-details',
      params: { returnTo: 'mother-profile' },
    });

    fireEvent.press(getByText('Help'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/customer-support',
      params: { returnTo: 'mother-profile' },
    });

    fireEvent.press(getByText('Inbox'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/messages');

    fireEvent.press(getByText('Notifications'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/notifications');
  });

  it('routes the promo cards with returnTo mother-profile', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Care Points'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/rewards',
      params: { returnTo: 'mother-profile' },
    });

    fireEvent.press(getByText('Packages'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/packages');

    fireEvent.press(getByText('Refer a friend'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/refer-a-friend',
      params: { returnTo: 'mother-profile' },
    });
  });

  it('signs out from the list section', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Sign out'));
    expect(mockSignOutMutate).toHaveBeenCalled();
  });
});

describe('Account screen — delete account', () => {
  it('asks in the destructive style before deleting', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Delete account'));

    expect(useConfirmDialogStore.getState().dialog).toMatchObject({
      title: 'Delete your account?',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('deletes on confirm, leaves for the root and says so', () => {
    mockDeleteMutate.mockImplementation((_v, opts) => opts.onSuccess?.('deleted'));
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Delete account'));
    confirmOpenDialog();

    expect(mockDeleteMutate).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(useConfirmDialogStore.getState().dialog).toMatchObject({ title: 'Account deleted' });
  });

  it("shows the server's refusal", () => {
    mockDeleteMutate.mockImplementation((_v, opts) =>
      opts.onError?.({
        field: 'form',
        message: 'Finish or cancel your upcoming bookings before deleting your account.',
      }),
    );
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Delete account'));
    confirmOpenDialog();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(useConfirmDialogStore.getState().dialog).toMatchObject({
      title: "Couldn't delete your account",
      message: 'Finish or cancel your upcoming bookings before deleting your account.',
    });
  });

  it('does nothing when cancelled', () => {
    mockDeleteMutate.mockImplementation((_v, opts) => opts.onSuccess?.('cancelled'));
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Delete account'));
    confirmOpenDialog();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(useConfirmDialogStore.getState().dialog).toBeNull();
  });

  it('reads "Deleting…" and locks Sign out while it runs', () => {
    mockIsDeleting = true;
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Deleting…'));
    fireEvent.press(getByText('Sign out'));
    expect(useConfirmDialogStore.getState().dialog).toBeNull();
    expect(mockSignOutMutate).not.toHaveBeenCalled();
  });
});
