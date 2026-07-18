// The firebase-admin storage handle is initialised at module load; mock it so
// importing lib/storage doesn't require real credentials. Only the pure
// path-parsing function is under test here.
jest.mock('@backend/lib/firebase', () => ({
  firebaseStorage: { bucket: jest.fn() },
}));
jest.mock('@backend/lib/config', () => ({
  config: { firebase: { storageBucket: 'test-bucket.appspot.com' } },
}));

import { objectPathFromDownloadUrl } from '@backend/lib/storage';

describe('objectPathFromDownloadUrl', () => {
  it('extracts and URL-decodes a nested nanny-ids object path', () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket.appspot.com/o/' +
      'nanny-ids%2Fuid-123%2F1720000000-abc.jpg?alt=media&token=xyz';
    expect(objectPathFromDownloadUrl(url)).toBe('nanny-ids/uid-123/1720000000-abc.jpg');
  });

  it('handles a path with no query string', () => {
    const url = 'https://x/o/avatars%2Fuid%2Ffile.png';
    expect(objectPathFromDownloadUrl(url)).toBe('avatars/uid/file.png');
  });

  it('returns null for a URL without an /o/ segment', () => {
    expect(objectPathFromDownloadUrl('https://example.com/not-a-storage-url')).toBeNull();
  });

  it('returns null for junk input', () => {
    expect(objectPathFromDownloadUrl('')).toBeNull();
    expect(objectPathFromDownloadUrl('nonsense')).toBeNull();
  });
});
