const mockLinkWithCredential = jest.fn();
const mockDelete = jest.fn();
const mockReauthenticate = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentUser: {
  uid: string;
  linkWithCredential: jest.Mock;
  delete: jest.Mock;
  reauthenticateWithCredential: jest.Mock;
  providerData: { providerId: string }[];
} | null = null;

jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
    signOut: mockSignOut,
  }),
}));

const mockGetSocialCredential = jest.fn();
const mockSignOutOfGoogle = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/socialAuth', () => ({
  getSocialCredential: (...args: unknown[]) => mockGetSocialCredential(...args),
  signOutOfGoogle: (...args: unknown[]) => mockSignOutOfGoogle(...args),
  SOCIAL_PROVIDER_LABEL: { google: 'Google', apple: 'Apple' },
}));

const mockApiDelete = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { delete: (...args: unknown[]) => mockApiDelete(...args) },
  apiStatusOf: (e: unknown) => (e as { response?: { status?: number } })?.response?.status ?? null,
}));

const mockNoticeDialog = jest.fn();
jest.mock('@mobile/store/confirmDialogStore', () => ({
  noticeDialog: (...args: unknown[]) => mockNoticeDialog(...args),
}));

import { abandonSocialSignUpForLink, linkPendingCredential } from '@mobile/lib/pendingLink';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const GOOGLE_CREDENTIAL = { providerId: 'google.com', token: 'google-id-token', secret: '' };
const FRESH_CREDENTIAL = { providerId: 'apple.com', token: 'fresh', secret: 'n' };

/** A signed-in Firebase user with these providers. */
function userWith(providerIds: string[], uid = 'uid-social') {
  return {
    uid,
    linkWithCredential: mockLinkWithCredential,
    delete: mockDelete,
    reauthenticateWithCredential: mockReauthenticate,
    providerData: providerIds.map((providerId) => ({ providerId })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockCurrentUser = userWith(['phone', 'password'], 'uid-registered');
  // The server-checked delete is tried first (M2); tests that exercise the
  // client-side fallback chain rely on it failing here, and override this
  // where they mean to hit the server path (204 / 409) instead.
  mockApiDelete.mockRejectedValue(new Error('network'));
  usePendingLinkStore.getState().clear();
  useRegistrationDraftStore.getState().reset();
});

describe('linkPendingCredential', () => {
  it('does nothing when no link is pending', async () => {
    await linkPendingCredential();
    expect(mockLinkWithCredential).not.toHaveBeenCalled();
  });

  it('links the pending credential onto the signed-in account and clears it', async () => {
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockResolvedValue(undefined);

    await linkPendingCredential();

    expect(mockLinkWithCredential).toHaveBeenCalledWith(GOOGLE_CREDENTIAL);
    expect(usePendingLinkStore.getState().pending).toBeNull();
    expect(mockNoticeDialog).not.toHaveBeenCalled();
  });

  it('asks the provider once more when the reused credential is refused', async () => {
    usePendingLinkStore.getState().set({ provider: 'apple', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential
      .mockRejectedValueOnce({ code: 'auth/invalid-credential' })
      .mockResolvedValueOnce(undefined);
    mockGetSocialCredential.mockResolvedValue({ provider: 'apple', credential: FRESH_CREDENTIAL, profile: {} });

    await linkPendingCredential();

    expect(mockGetSocialCredential).toHaveBeenCalledWith('apple');
    expect(mockLinkWithCredential).toHaveBeenLastCalledWith(FRESH_CREDENTIAL);
    expect(mockNoticeDialog).not.toHaveBeenCalled();
  });

  it('does not retry when the identity already belongs to another account, and says so', async () => {
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/credential-already-in-use' });

    await linkPendingCredential();

    expect(mockGetSocialCredential).not.toHaveBeenCalled();
    expect(mockNoticeDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't connect Google" }),
    );
    // Cleared eagerly — a failed link must never be retried on the next attempt.
    expect(usePendingLinkStore.getState().pending).toBeNull();
  });

  it('does not retry a failure unrelated to the credential itself', async () => {
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/too-many-requests' });

    await linkPendingCredential();

    expect(mockGetSocialCredential).not.toHaveBeenCalled();
    expect(mockNoticeDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't connect Google" }),
    );
  });

  it('treats an already-linked provider as a final failure, not success', async () => {
    // In both collision flows the parked identity cannot already be on this
    // user — signInWithCredential would have signed straight in instead — so
    // this code means the account already holds a *different* Google/Apple
    // identity, and the link failed.
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/provider-already-linked' });

    await linkPendingCredential();

    expect(mockGetSocialCredential).not.toHaveBeenCalled();
    expect(mockNoticeDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't connect Google" }),
    );
  });

  it('tells the user when the second attempt is cancelled', async () => {
    usePendingLinkStore.getState().set({ provider: 'google', credential: GOOGLE_CREDENTIAL as never, phoneHint: null });
    mockLinkWithCredential.mockRejectedValue({ code: 'auth/invalid-credential' });
    mockGetSocialCredential.mockResolvedValue(null);

    await linkPendingCredential();

    expect(mockNoticeDialog).toHaveBeenCalledTimes(1);
  });
});

describe('abandonSocialSignUpForLink', () => {
  /** What useSocialSignIn leaves after /auth/me said 404 for uid-social. */
  function seedSocialDraft(
    signUpUid: string | null = 'uid-social',
    socialCredential: unknown = GOOGLE_CREDENTIAL,
  ) {
    useRegistrationDraftStore.setState({
      authProvider: 'google',
      socialCredential: socialCredential as never,
      signUpUid,
      email: 'mona@gmail.com',
      firstName: 'Mona',
    });
  }

  function expectDraftReset() {
    expect(useRegistrationDraftStore.getState()).toMatchObject({
      authProvider: 'phone',
      socialCredential: null,
      signUpUid: null,
      email: '',
    });
  }

  const RECENT_LOGIN = { code: 'auth/requires-recent-login' };

  it('asks the server first and never touches Firebase directly when it deletes the account (204)', async () => {
    // M2: the server alone knows whether a row already points at this uid, so
    // it goes first — a direct `user.delete()` would otherwise bypass that
    // check whenever Firebase's own recent-login window hadn't expired yet.
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockApiDelete.mockResolvedValue({ status: 204 });

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toEqual({
      provider: 'google',
      credential: GOOGLE_CREDENTIAL,
      phoneHint: '+201234567891',
    });
    expectDraftReset();
  });

  it('parks nothing when the server says a row already points at this uid (409)', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockApiDelete.mockRejectedValue({ response: { status: 409 } });

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toBeNull();
    expectDraftReset();
  });

  it('falls back to deleting directly when the server call fails for any other reason (network error)', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    // beforeEach already rejects mockApiDelete with a network error.
    mockDelete.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending).toEqual({
      provider: 'google',
      credential: GOOGLE_CREDENTIAL,
      phoneHint: '+201234567891',
    });
    expectDraftReset();
  });

  it('deletes an account this sign-up owns even when it holds more than Google (a phone)', async () => {
    // signUpUid proves the account is this sign-up's own, and the server
    // re-checks it has no row — so a phone linked by an earlier attempt no
    // longer turns the delete into a sign-out.
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com', 'phone']);
    mockDelete.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending?.credential).toBe(GOOGLE_CREDENTIAL);
  });

  it('re-proves the sign-in with the social credential when the server delete fails, then deletes', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockRejectedValueOnce(RECENT_LOGIN).mockResolvedValueOnce(undefined);
    mockApiDelete.mockRejectedValue(new Error('offline'));
    mockReauthenticate.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockReauthenticate).toHaveBeenCalledWith(GOOGLE_CREDENTIAL);
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockApiDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockReauthenticate.mock.invocationCallOrder[0] as number,
    );
    expect(mockGetSocialCredential).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending?.credential).toBe(GOOGLE_CREDENTIAL);
    expectDraftReset();
  });

  it('asks the provider for a fresh credential when the parked one is refused, and parks the fresh one', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockRejectedValueOnce(RECENT_LOGIN).mockResolvedValueOnce(undefined);
    mockApiDelete.mockRejectedValue(new Error('offline'));
    mockReauthenticate
      .mockRejectedValueOnce({ code: 'auth/invalid-credential' })
      .mockResolvedValueOnce(undefined);
    mockGetSocialCredential.mockResolvedValue({ provider: 'google', credential: FRESH_CREDENTIAL, profile: {} });

    await abandonSocialSignUpForLink(null);

    expect(mockGetSocialCredential).toHaveBeenCalledWith('google');
    expect(mockReauthenticate).toHaveBeenLastCalledWith(FRESH_CREDENTIAL);
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending?.credential).toBe(FRESH_CREDENTIAL);
  });

  it('falls back to signing out, still parking the credential, when nothing deletes the account', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockRejectedValue(RECENT_LOGIN);
    mockApiDelete.mockRejectedValue(new Error('offline'));
    mockReauthenticate.mockRejectedValue({ code: 'auth/invalid-credential' });
    mockGetSocialCredential.mockResolvedValue(null);

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending?.credential).toBe(GOOGLE_CREDENTIAL);
    expectDraftReset();
  });

  it('does not re-authenticate when the direct delete fails for a reason other than a stale session', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['apple.com']);
    mockDelete.mockRejectedValue(new Error('network'));

    await abandonSocialSignUpForLink(null);

    // The server is still asked first (M2) — it just isn't the reason this
    // falls through, since it fails for its own (unrelated) reason too.
    expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending?.provider).toBe('google');
  });

  it('deletes a resumed sign-up with no credential, and parks nothing', async () => {
    // The root gate resumed a Google leftover: signUpUid is set, but the
    // credential that created it is long gone.
    seedSocialDraft('uid-social', null);
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toBeNull();
    expectDraftReset();
  });

  it('asks the provider for a credential to re-prove a resumed sign-up, and parks it', async () => {
    seedSocialDraft('uid-social', null);
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockRejectedValueOnce(RECENT_LOGIN).mockResolvedValueOnce(undefined);
    mockApiDelete.mockRejectedValue(new Error('offline'));
    mockReauthenticate.mockResolvedValue(undefined);
    mockGetSocialCredential.mockResolvedValue({ provider: 'google', credential: FRESH_CREDENTIAL, profile: {} });

    await abandonSocialSignUpForLink(null);

    expect(mockReauthenticate).toHaveBeenCalledTimes(1);
    expect(mockReauthenticate).toHaveBeenCalledWith(FRESH_CREDENTIAL);
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(usePendingLinkStore.getState().pending?.credential).toBe(FRESH_CREDENTIAL);
  });

  it('parks nothing for a resumed sign-up that could not be deleted and got no fresh credential', async () => {
    seedSocialDraft('uid-social', null);
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockRejectedValue(RECENT_LOGIN);
    mockApiDelete.mockRejectedValue(new Error('offline'));
    mockGetSocialCredential.mockResolvedValue(null);

    await abandonSocialSignUpForLink(null);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toBeNull();
    expectDraftReset();
  });

  it('signs out, rather than deletes, a Google-only account when the draft never saw a 404', async () => {
    // The draft is at its default ('phone', no signUpUid) — reset() in
    // beforeEach already leaves it there — so nothing here proves this
    // Google-only account is the one a social sign-up just created.
    mockCurrentUser = userWith(['google.com']);

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockApiDelete).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toBeNull();
  });

  it('never deletes, or parks a credential for, an account other than the one this sign-up created', async () => {
    // A stale social draft (another person's, on a shared device) while
    // someone else's Google-only account is signed in.
    seedSocialDraft('uid-social');
    mockCurrentUser = userWith(['google.com'], 'uid-someone-else');

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockApiDelete).not.toHaveBeenCalled();
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOutOfGoogle).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toBeNull();
    expectDraftReset();
  });

  it('parks nothing when nobody is signed in', async () => {
    // The social account is already gone, so the stale credential would link
    // onto whoever signs in next by SMS.
    seedSocialDraft();
    mockCurrentUser = null;

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending).toBeNull();
    expectDraftReset();
  });

  it('parks nothing when the draft never recorded which account it created', async () => {
    seedSocialDraft(null);
    mockCurrentUser = userWith(['google.com']);

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toBeNull();
    expectDraftReset();
  });
});
