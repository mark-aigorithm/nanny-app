import { auth } from '@mobile/lib/firebase';
import type { AuthCredential } from '@mobile/lib/firebase';
import { getSocialCredential, SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

/** Link failures a fresh credential cannot fix — no point asking again. */
const FINAL_LINK_ERRORS = new Set([
  'auth/credential-already-in-use',
  'auth/email-already-in-use',
  'auth/network-request-failed',
]);

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
 * fresh one from the provider's sheet.
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
      // Already linked means there is nothing left to do.
      if (code === 'auth/provider-already-linked') return null;
      return typeof code === 'string' ? code : 'unknown';
    }
  };

  let failure = await attempt(pending.credential);
  if (failure && !FINAL_LINK_ERRORS.has(failure)) {
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
 * `/auth/me` returned 404 — so the signed-in account has no row. The provider
 * check below is the other half of that guard: anything besides Google/Apple
 * on the account means it is not the throwaway, so it is signed out, never
 * deleted.
 */
export async function abandonSocialSignUpForLink(phoneHint: string | null): Promise<void> {
  const draft = useRegistrationDraftStore.getState();
  const { authProvider, socialCredential } = draft;
  const user = auth().currentUser;

  if (user) {
    const socialOnly =
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

  if (socialCredential && authProvider !== 'phone') {
    usePendingLinkStore.getState().set({ provider: authProvider, credential: socialCredential, phoneHint });
  }
  draft.reset();
}
