import { api, apiStatusOf } from '@mobile/lib/api';
import { authErrorCode } from '@mobile/lib/authErrors';
import { auth } from '@mobile/lib/firebase';
import type { AuthCredential, FirebaseUser } from '@mobile/lib/firebase';
import { getSocialCredential, signOutOfGoogle, SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import type { SocialProvider } from '@mobile/types';

/**
 * Link failures caused by the reused credential itself being refused — a
 * stale/expired token, or (Apple) a nonce that no longer matches this app
 * session. Only these are worth a second try with a fresh credential from
 * the provider's own sheet. Every other failure — including
 * `auth/provider-already-linked`, which in both collision flows can only
 * mean the account already holds a *different* Google/Apple identity, since
 * `signInWithCredential` would otherwise have signed the user straight in —
 * means retrying would not help, so it is a final failure instead.
 */
const RETRYABLE_LINK_ERRORS = new Set(['auth/invalid-credential', 'auth/missing-or-invalid-nonce']);

/**
 * Links the parked Google/Apple credential onto the account the user just
 * signed in to (by SMS or password), completing either collision flow.
 *
 * Signing in proved they own this account; the credential proves they own the
 * Google/Apple identity; so linking is safe. It never blocks sign-in: on any
 * failure the user stays signed in and is told the connection didn't happen.
 *
 * Collision B reuses a credential that already signed in once (the throwaway
 * social account it then deleted). Apple's token is nonce-bound and may be
 * refused a second time, so a refused credential gets one more try with a
 * fresh one from the provider's sheet — but only when Firebase blamed the
 * credential itself; any other refusal (e.g. it belongs to a different
 * account) is final.
 */
export async function linkPendingCredential(): Promise<void> {
  const pending = usePendingLinkStore.getState().pending;
  usePendingLinkStore.getState().clear();
  const user = auth().currentUser;
  if (!pending || !user) return;

  const attempt = async (credential: AuthCredential): Promise<string | null> => {
    try {
      await user.linkWithCredential(credential);
      return null;
    } catch (error) {
      return authErrorCode(error) ?? 'unknown';
    }
  };

  let failure = await attempt(pending.credential);
  if (failure && RETRYABLE_LINK_ERRORS.has(failure)) {
    try {
      const fresh = await getSocialCredential(pending.provider);
      if (fresh) failure = await attempt(fresh.credential);
    } catch {
      // Keep the original failure.
    }
  }

  if (failure) {
    const label = SOCIAL_PROVIDER_LABEL[pending.provider];
    noticeDialog({
      title: `Couldn't connect ${label}`,
      message: `You're signed in, but we couldn't connect ${label} to your account. Try Continue with ${label} next time.`,
    });
  }
}

/** Re-proves the sign-in with `credential` and deletes once more. Never throws. */
async function reauthenticateAndDelete(user: FirebaseUser, credential: AuthCredential): Promise<boolean> {
  try {
    await user.reauthenticateWithCredential(credential);
    await user.delete();
    return true;
  } catch {
    return false;
  }
}

/**
 * Signs out locally without touching a parked credential — every exit in this
 * module needs this exact pair, so Google's own session doesn't outlive the
 * app's local sign-out and quietly resurface on the next "Continue with
 * Google" (showing her already-picked account instead of the chooser).
 */
async function signOutKeepingParkedCredential(): Promise<void> {
  await auth().signOut().catch(() => undefined);
  await signOutOfGoogle();
}

/**
 * Deletes the account this sign-up created and says which Google/Apple
 * credential to park for the link at sign-in (`null`: none to park).
 *
 * The server is asked first — it alone knows whether a `users` row already
 * points at this uid, which `user.delete()` cannot check on its own:
 *
 * 1. `DELETE /auth/me` — 204 means the server deleted the Firebase account
 *    itself: sign out locally and park the credential. 409 means a row
 *    already points at this uid, so there is nothing here to free up: sign
 *    out locally and park nothing.
 *
 * Any other failure (offline, 5xx — never a 409, which is a definitive
 * answer) falls back to deleting directly, exactly as before this reordering.
 * `delete()` needs a recent sign-in (about five minutes), and a collision
 * found at Finish (a 409 from register) comes after the whole wizard, so a
 * `requires-recent-login` refusal is answered, in order, by:
 *
 * 2. `user.delete()` itself.
 * 3. Re-proving the sign-in with the sign-up's own credential and deleting.
 * 4. Re-proving it with a fresh credential from the provider's sheet — the
 *    only way for a resumed sign-up, which has no credential — and deleting.
 *    The fresh one is parked only when it re-proved this very account; one
 *    for a different identity (another Google account picked in the sheet)
 *    proves nothing here.
 *
 * Any other `delete()` failure, or all of the above failing, leaves the
 * account in place: it is signed out, and the credential is parked anyway —
 * the link at sign-in then fails harmlessly (the identity is still in use) and
 * says so.
 */
async function deleteSignUpAccount(
  user: FirebaseUser,
  provider: SocialProvider,
  credential: AuthCredential | null,
): Promise<AuthCredential | null> {
  try {
    await api.delete('/auth/me');
    await signOutKeepingParkedCredential();
    return credential;
  } catch (error) {
    if (apiStatusOf(error) === 409) {
      await signOutKeepingParkedCredential();
      return null;
    }
    // Any other failure — fall back to deleting directly.
  }

  try {
    await user.delete();
    return credential;
  } catch (error) {
    if (authErrorCode(error) !== 'auth/requires-recent-login') {
      await signOutKeepingParkedCredential();
      return credential;
    }
  }

  if (credential && (await reauthenticateAndDelete(user, credential))) return credential;

  try {
    const fresh = await getSocialCredential(provider);
    if (fresh && (await reauthenticateAndDelete(user, fresh.credential))) return fresh.credential;
  } catch {
    // Cancelled or failed — fall through to signing out.
  }

  await signOutKeepingParkedCredential();
  return credential;
}

/**
 * Collision B: a social sign-up ran into an account that already exists (its
 * phone or email is taken). Delete the account this sign-up created — which
 * frees the Google/Apple identity to be linked onto the real account — park
 * the credential, and reset the draft. The caller then sends the user to sign
 * in, where `phoneHint` prefills the number they typed.
 *
 * The account is deleted only when it is this sign-up's own: the signed-in uid
 * must be the draft's `signUpUid`, which seedDraftFromAccount records only
 * after `/auth/me` returned 404 for that account (a fresh Google/Apple sign-up
 * or a resumed leftover), and the server re-checks that no row points at it
 * before its own delete. What the account holds besides Google/Apple — say, a
 * phone an earlier attempt linked — doesn't matter. Anything else — nobody
 * signed in, or someone other than the account this sign-up created — means
 * the draft is stale (possibly another person's, on a shared device), so the
 * account is signed out, nothing is parked, and the draft is dropped.
 *
 * A resumed sign-up has no `socialCredential`; a credential is parked only if
 * one exists by the end (see deleteSignUpAccount), so with none the user just
 * signs in and can connect Google/Apple later.
 */
export async function abandonSocialSignUpForLink(phoneHint: string | null): Promise<void> {
  const draft = useRegistrationDraftStore.getState();
  const { authProvider, socialCredential, signUpUid } = draft;
  const user = auth().currentUser;

  if (!user || authProvider === 'phone' || !signUpUid || user.uid !== signUpUid) {
    usePendingLinkStore.getState().clear();
    if (user) await signOutKeepingParkedCredential();
    draft.reset();
    return;
  }

  const credential = await deleteSignUpAccount(user, authProvider, socialCredential);
  if (credential) usePendingLinkStore.getState().set({ provider: authProvider, credential, phoneHint });
  else usePendingLinkStore.getState().clear();
  draft.reset();
}
