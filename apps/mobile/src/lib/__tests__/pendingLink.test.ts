const mockLinkWithCredential = jest.fn();
const mockDelete = jest.fn();
const mockSignOut = jest.fn();
let mockCurrentUser: {
  linkWithCredential: jest.Mock;
  delete: jest.Mock;
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

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockCurrentUser = {
    linkWithCredential: mockLinkWithCredential,
    delete: mockDelete,
    providerData: [{ providerId: 'phone' }, { providerId: 'password' }],
  };
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
  function seedSocialDraft() {
    useRegistrationDraftStore.setState({
      authProvider: 'google',
      socialCredential: GOOGLE_CREDENTIAL as never,
      email: 'mona@gmail.com',
      firstName: 'Mona',
    });
  }

  it('deletes the Google-only account, parks the credential, and resets the draft', async () => {
    seedSocialDraft();
    mockCurrentUser = { linkWithCredential: mockLinkWithCredential, delete: mockDelete, providerData: [{ providerId: 'google.com' }] };
    mockDelete.mockResolvedValue(undefined);

    await abandonSocialSignUpForLink('+201234567891');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toEqual({
      provider: 'google',
      credential: GOOGLE_CREDENTIAL,
      phoneHint: '+201234567891',
    });
    expect(useRegistrationDraftStore.getState().authProvider).toBe('phone');
    expect(useRegistrationDraftStore.getState().email).toBe('');
  });

  it('only signs out when the account holds anything besides Google/Apple', async () => {
    seedSocialDraft();
    mockCurrentUser = {
      linkWithCredential: mockLinkWithCredential,
      delete: mockDelete,
      providerData: [{ providerId: 'google.com' }, { providerId: 'phone' }],
    };

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the delete itself fails', async () => {
    seedSocialDraft();
    mockCurrentUser = { linkWithCredential: mockLinkWithCredential, delete: mockDelete, providerData: [{ providerId: 'apple.com' }] };
    mockDelete.mockRejectedValue(new Error('network'));

    await abandonSocialSignUpForLink(null);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending?.provider).toBe('google');
  });

  it('signs out, rather than deletes, a Google-only account when the draft never saw a 404', async () => {
    // The draft is at its default ('phone', no socialCredential) — reset() in
    // beforeEach already leaves it there — so nothing here proves this
    // Google-only account is the throwaway a social sign-up just created.
    mockCurrentUser = {
      linkWithCredential: mockLinkWithCredential,
      delete: mockDelete,
      providerData: [{ providerId: 'google.com' }],
    };

    await abandonSocialSignUpForLink(null);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingLinkStore.getState().pending).toBeNull();
  });
});
