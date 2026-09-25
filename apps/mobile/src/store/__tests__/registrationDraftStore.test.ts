import { uploadFor, useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

beforeEach(() => {
  useRegistrationDraftStore.getState().reset();
});

it('starts with no preference chosen for her', () => {
  expect(useRegistrationDraftStore.getState().preferences).toEqual([]);
});

it('forgets uploads, proofs and the password on reset', () => {
  useRegistrationDraftStore.getState().patch({
    password: 'Passw0rd',
    emailVerificationToken: 'tok',
    verifiedEmail: 'mona@example.com',
    phoneOnAccountAtStart: true,
    avatarUpload: { uri: 'file:///a.jpg', url: 'https://storage.test/a.jpg' },
    idFrontUpload: { uri: 'file:///f.jpg', url: 'https://storage.test/f.jpg' },
    idBackUpload: { uri: 'file:///b.jpg', url: 'https://storage.test/b.jpg' },
  });

  useRegistrationDraftStore.getState().reset();

  expect(useRegistrationDraftStore.getState()).toMatchObject({
    password: '',
    emailVerificationToken: null,
    verifiedEmail: null,
    phoneOnAccountAtStart: false,
    avatarUpload: null,
    idFrontUpload: null,
    idBackUpload: null,
  });
});

describe('uploadFor', () => {
  const upload = { uri: 'file:///a.jpg', url: 'https://storage.test/a.jpg' };

  it('is the URL when that very image was uploaded', () => {
    expect(uploadFor(upload, 'file:///a.jpg')).toBe('https://storage.test/a.jpg');
  });

  it('is null for a different image, no image, or no upload', () => {
    expect(uploadFor(upload, 'file:///b.jpg')).toBeNull();
    expect(uploadFor(upload, null)).toBeNull();
    expect(uploadFor(null, 'file:///a.jpg')).toBeNull();
  });
});
