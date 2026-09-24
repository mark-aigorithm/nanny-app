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
jest.mock('@mobile/lib/socialAuth', () => ({
  getSocialCredential: (...args: unknown[]) => mockGetSocialCredential(...args),
  SOCIAL_PROVIDER_LABEL: { google: 'Google', apple: 'Apple' },
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
  function seedSocialDraft(socialUid: string | null = 'uid-social') {
    useRegistrationDraftStore.setState({
      authProvider: 'google',
      socialCredential: GOOGLE_CREDENTIAL as never,
      socialUid,
      email: 'mona@gmail.com',
      firstName: 'Mona',
    });
  }

  function expectDraftReset() {
    expect(useRegistrationDraftStore.getState()).toMatchObject({
      authProvider: 'phone',
      socialCredential: null,
      socialUid: null,
      email: '',
    });
  }

  it('deletes the Google-only account, parks the credential, and resets the draft', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending).toEqual({
      provider: 'google',
      credential: GOOGLE_CREDENTIAL,
      phoneHint: '+201234567891',
    });
    expectDraftReset();
  });

  it('re-proves the sign-in with the social credential when Firebase wants a recent login, then deletes', async () => {
    // A step-3 collision comes after the whole wizard, well past Firebase's
    // few-minute window for delete().
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockRejectedValueOnce({ code: 'auth/requires-recent-login' }).mockResolvedValueOnce(undefined);
    mockReauthenticate.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockReauthenticate).toHaveBeenCalledWith(GOOGLE_CREDENTIAL);
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockReauthenticate.mock.invocationCallOrder[0]).toBeLessThan(
      mockDelete.mock.invocationCallOrder[1] as number,
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(usePendingLinkStore.getState().pending).toEqual({
      provider: 'google',
      credential: GOOGLE_CREDENTIAL,
      phoneHint: '+201234567891',
    });
    expectDraftReset();
  });

  it('falls back to signing out when the re-authentication is refused', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockRejectedValue({ code: 'auth/requires-recent-login' });
    mockReauthenticate.mockRejectedValue({ code: 'auth/invalid-credential' });

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending?.provider).toBe('google');
  });

  it('retries the delete only once after re-authenticating', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com']);
    mockDelete.mockRejectedValue({ code: 'auth/requires-recent-login' });
    mockReauthenticate.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink(null);

    expect(mockReauthenticate).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('does not re-authenticate for a delete that failed for any other reason', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['apple.com']);
    mockDelete.mockRejectedValue(new Error('network'));

    await abandonSocialSignUpForLink(null);

    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending?.provider).toBe('google');
  });

  it('only signs out when the account holds anything besides Google/Apple', async () => {
    seedSocialDraft();
    mockCurrentUser = userWith(['google.com', 'phone']);

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('signs out, rather than deletes, a Google-only account when the draft never saw a 404', async () => {
    // The draft is at its default ('phone', no socialCredential) — reset() in
    // beforeEach already leaves it there — so nothing here proves this
    // Google-only account is the throwaway a social sign-up just created.
    mockCurrentUser = userWith(['google.com']);

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toBeNull();
  });

  it('never deletes, or parks a credential for, an account other than the one this sign-up created', async () => {
    // A stale social draft (another person's, on a shared device) while
    // someone else's Google-only account is signed in.
    seedSocialDraft('uid-social');
    mockCurrentUser = userWith(['google.com'], 'uid-someone-else');

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
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
