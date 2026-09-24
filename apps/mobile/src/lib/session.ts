import { unregisterPushToken } from '@mobile/hooks/usePushNotifications';
import { auth } from '@mobile/lib/firebase';
import { queryClient } from '@mobile/lib/queryClient';
import { signOutOfGoogle } from '@mobile/lib/socialAuth';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/**
 * Everything a sign-out must leave behind, in one place, so every exit (sign
 * out, discard an unfinished sign-up, "Start again", delete account) clears
 * the same things.
 *
 * The push token goes first — its DELETE is signed with the JWT that
 * `signOut()` ends; it never throws. A parked Google/Apple credential must
 * never link onto whoever signs in next, and an unfinished sign-up must never
 * follow them in, so both are cleared before the sign-out call and go even if
 * it throws. The Google session (so the next tap shows the account picker),
 * the cached profile and the query cache go in `finally` for the same reason.
 * A failed `signOut()` is rethrown after all of that.
 */
export async function clearLocalSession(): Promise<void> {
  await unregisterPushToken();
  usePendingLinkStore.getState().clear();
  useRegistrationDraftStore.getState().reset();
  try {
    await auth().signOut();
  } finally {
    // signOutOfGoogle is best-effort and never throws.
    await signOutOfGoogle();
    useUserProfileStore.getState().clear();
    queryClient.clear();
  }
}
