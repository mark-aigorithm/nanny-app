/**
 * Guards the client-identity half of image upload.
 *
 * Uploads once ran on the Firebase JS SDK while auth ran on the native module.
 * The two hold separate sessions, so every upload left the device with no ID
 * token and the bucket rejected it with `storage/unauthorized` — while the
 * object path still carried a real uid, which is what disguised it as a rules
 * problem. These tests pin the upload to `@react-native-firebase/storage`, the
 * same runtime that owns the session.
 *
 * The `mock` prefixes are required: babel-plugin-jest-hoist lifts `jest.mock`
 * factories above the imports, and only `mock*` bindings may be referenced.
 */

const mockPutFile = jest.fn<Promise<void>, [string, { contentType: string }?]>();
const mockGetDownloadURL = jest.fn<Promise<string>, []>();
const mockRef = jest.fn<
  { putFile: typeof mockPutFile; getDownloadURL: typeof mockGetDownloadURL },
  [string]
>();
const mockUseEmulator = jest.fn<void, [string, number]>();
let mockCurrentUser: { uid: string } | null = { uid: 'uid-123' };

jest.mock('@react-native-firebase/storage', () => ({
  __esModule: true,
  default: () => ({ ref: mockRef, useEmulator: mockUseEmulator }),
}));

jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { firebaseStorageEmulatorHost: '' } } },
}));

import { isLocalImageUri, uploadImageToFirebase } from '@mobile/lib/storage';

beforeEach(() => {
  mockCurrentUser = { uid: 'uid-123' };
  mockPutFile.mockReset().mockResolvedValue(undefined);
  mockGetDownloadURL.mockReset().mockResolvedValue('https://storage.test/o/object.jpg');
  mockRef.mockReset().mockReturnValue({
    putFile: mockPutFile,
    getDownloadURL: mockGetDownloadURL,
  });
});

describe('uploadImageToFirebase', () => {
  it('uploads through the native storage module, which carries the session token', async () => {
    await uploadImageToFirebase('file:///tmp/id-front.jpg', 'nanny-ids');

    // The assertion that matters: the upload went through the module that
    // shares the native auth session, not a second, signed-out Firebase app.
    expect(mockPutFile).toHaveBeenCalledTimes(1);
    expect(mockPutFile).toHaveBeenCalledWith('file:///tmp/id-front.jpg', {
      contentType: 'image/jpeg',
    });
  });

  it('scopes the object path to the signed-in uid', async () => {
    await uploadImageToFirebase('file:///tmp/id-front.jpg', 'nanny-ids');

    expect(mockRef).toHaveBeenCalledTimes(1);
    expect(mockRef.mock.calls[0]?.[0]).toMatch(/^nanny-ids\/uid-123\/\d+-[a-z0-9]+\.jpg$/);
  });

  it('returns the download URL for the uploaded object', async () => {
    mockGetDownloadURL.mockResolvedValue('https://storage.test/o/nanny-ids%2Fuid-123%2Fx.jpg');

    await expect(uploadImageToFirebase('file:///tmp/x.jpg', 'nanny-ids')).resolves.toBe(
      'https://storage.test/o/nanny-ids%2Fuid-123%2Fx.jpg',
    );
  });

  it('refuses to upload when nobody is signed in', async () => {
    mockCurrentUser = null;

    await expect(uploadImageToFirebase('file:///tmp/x.jpg', 'avatars')).rejects.toThrow(
      'Not signed in.',
    );
    expect(mockPutFile).not.toHaveBeenCalled();
  });

  it('derives the extension and content type from the file name', async () => {
    await uploadImageToFirebase('file:///tmp/photo.PNG', 'avatars');

    expect(mockRef.mock.calls[0]?.[0]).toMatch(/\.png$/);
    expect(mockPutFile).toHaveBeenCalledWith('file:///tmp/photo.PNG', {
      contentType: 'image/png',
    });
  });

  it('normalises .jpeg to .jpg and falls back to jpg for an extensionless URI', async () => {
    await uploadImageToFirebase('file:///tmp/a.jpeg', 'avatars');
    expect(mockRef.mock.calls[0]?.[0]).toMatch(/\.jpg$/);

    mockRef.mockClear();
    await uploadImageToFirebase('content://media/external/images/42', 'avatars');
    expect(mockRef.mock.calls[0]?.[0]).toMatch(/\.jpg$/);
  });
});

describe('isLocalImageUri', () => {
  it.each(['file:///tmp/a.jpg', 'content://media/1', 'ph://ABC-123'])(
    'treats %s as device-local',
    (uri) => {
      expect(isLocalImageUri(uri)).toBe(true);
    },
  );

  it('treats an already-uploaded https URL as remote', () => {
    expect(isLocalImageUri('https://storage.test/o/x.jpg')).toBe(false);
  });
});
