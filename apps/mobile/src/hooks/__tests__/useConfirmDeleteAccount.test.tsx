import { act, renderHook } from '@testing-library/react-native';

import type { MappedAuthError } from '@mobile/lib/authErrors';

type DeleteResult = 'deleted' | 'cancelled';
interface MutateOptions {
  onSuccess?: (result: DeleteResult) => void;
  onError?: (error: MappedAuthError) => void;
}

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));

const mockMutate = jest.fn<void, [undefined, MutateOptions]>();
let mockIsPending = false;
jest.mock('@mobile/hooks/useAuth', () => ({
  ...jest.requireActual('@mobile/hooks/useAuth'),
  useDeleteAccount: () => ({ mutate: mockMutate, isPending: mockIsPending }),
}));

import { useConfirmDeleteAccount } from '@mobile/hooks/useConfirmDeleteAccount';
import { useConfirmDialogStore } from '@mobile/store/confirmDialogStore';

function openDialog() {
  const { result } = renderHook(() => useConfirmDeleteAccount());
  act(() => result.current.confirmDeleteAccount());
  return result;
}

function confirmOpenDialog() {
  const dialog = useConfirmDialogStore.getState().dialog;
  act(() => {
    useConfirmDialogStore.getState().dismiss();
    dialog?.onConfirm?.();
  });
}

function settleWith(settle: (opts: MutateOptions) => void) {
  mockMutate.mockImplementation((_v, opts) => settle(opts));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPending = false;
  useConfirmDialogStore.setState({ dialog: null });
});

it('asks first, in the destructive style, and deletes nothing until confirmed', () => {
  openDialog();
  expect(useConfirmDialogStore.getState().dialog).toMatchObject({
    title: 'Delete your account?',
    message: "This deletes your profile and signs you out. It can't be undone.",
    confirmLabel: 'Delete account',
    destructive: true,
  });
  expect(mockMutate).not.toHaveBeenCalled();
});

it('deletes on confirm, leaves for the root and says the account is gone', () => {
  settleWith((opts) => opts.onSuccess?.('deleted'));
  openDialog();
  confirmOpenDialog();

  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/');
  expect(useConfirmDialogStore.getState().dialog).toMatchObject({
    title: 'Account deleted',
    message: 'Your account has been deleted.',
    hideCancel: true,
  });
});

it('does nothing when the Apple prompt is cancelled', () => {
  settleWith((opts) => opts.onSuccess?.('cancelled'));
  openDialog();
  confirmOpenDialog();

  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(useConfirmDialogStore.getState().dialog).toBeNull();
});

it("shows the server's refusal and stays put", () => {
  settleWith((opts) =>
    opts.onError?.({
      field: 'form',
      message: 'Finish or cancel your upcoming bookings before deleting your account.',
    }),
  );
  openDialog();
  confirmOpenDialog();

  expect(mockReplace).not.toHaveBeenCalled();
  expect(useConfirmDialogStore.getState().dialog).toMatchObject({
    title: "Couldn't delete your account",
    message: 'Finish or cancel your upcoming bookings before deleting your account.',
  });
});

it('reports the pending deletion', () => {
  mockIsPending = true;
  const { result } = renderHook(() => useConfirmDeleteAccount());
  expect(result.current.isDeleting).toBe(true);
});
