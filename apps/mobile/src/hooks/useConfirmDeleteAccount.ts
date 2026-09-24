import { useRouter } from 'expo-router';

import { useDeleteAccount } from '@mobile/hooks/useAuth';
import { confirmDialog, noticeDialog } from '@mobile/store/confirmDialogStore';

/**
 * "Delete account", shared by every screen that offers it: a destructive
 * confirm, then `useDeleteAccount`. Once deleted it leaves for the root — the
 * gate sends a signed-out user to sign-in — and says the account is gone. A
 * cancelled Apple prompt does nothing; a refusal (an active booking, say) is
 * shown as the server worded it.
 */
export function useConfirmDeleteAccount() {
  const router = useRouter();
  const deleteAccount = useDeleteAccount();

  const confirmDeleteAccount = () =>
    confirmDialog({
      title: 'Delete your account?',
      message: "This deletes your profile and signs you out. It can't be undone.",
      confirmLabel: 'Delete account',
      destructive: true,
      onConfirm: () =>
        deleteAccount.mutate(undefined, {
          onSuccess: (result) => {
            if (result !== 'deleted') return;
            router.replace('/');
            noticeDialog({ title: 'Account deleted', message: 'Your account has been deleted.' });
          },
          onError: (error) => {
            noticeDialog({ title: "Couldn't delete your account", message: error.message });
          },
        }),
    });

  return { confirmDeleteAccount, isDeleting: deleteAccount.isPending };
}
