import { auth } from '@mobile/lib/firebase';
import type { AuthCredential } from '@mobile/lib/firebase';
import { getSocialCredential, SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

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
      const code = (error as { code?: unknown })?.code;
      return typeof code === 'string' ? code : 'unknown';
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

/**
 * Collision B: a social sign-up ran into an account that already exists (its
 * phone or email is taken). Delete the Google/Apple-only account this sign-up
 * created — which frees the identity to be linked onto the real account —
 * park the credential, and reset the draft. The caller then sends the user to
 * sign in, where `phoneHint` prefills the number they typed.
 *
 * Only ever called from inside the social wizard, which starts only after
 * `/auth/me` returned 404 — so the signed-in account has no row. Both halves
 * of that guard are checked here before deleting anything: the draft's own
 * `authProvider`/`socialCredential` prove a 404 actually happened during
 * *this* social sign-in (useSocialSignIn is the only place that sets them),
 * and the account's `providerData` proves it is still social-only. Either
 * one failing means this is not the throwaway account this flow created, so
 * it is signed out, never deleted.
 */
export async function abandonSocialSignUpForLink(phoneHint: string | null): Promise<void> {
  const draft = useRegistrationDraftStore.getState();
  const { authProvider, socialCredential } = draft;
  const user = auth().currentUser;
  const draftProvesSocialSignUp = authProvider !== 'phone' && socialCredential !== null;

  if (user) {
    const socialOnly =
      draftProvesSocialSignUp &&
      user.providerData.length > 0 &&
      user.providerData.every((p) => p.providerId === 'google.com' || p.providerId === 'apple.com');
    let deleted = false;
    if (socialOnly) {
      try {
        await user.delete();
        deleted = true;
      } catch {
        // Fall through to signing out.
      }
    }
    if (!deleted) await auth().signOut().catch(() => undefined);
  }

  if (authProvider !== 'phone' && socialCredential) {
    usePendingLinkStore.getState().set({ provider: authProvider, credential: socialCredential, phoneHint });
  }
  draft.reset();
}
