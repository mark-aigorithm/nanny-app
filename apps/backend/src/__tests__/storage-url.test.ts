jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));

import { assertOwnStorageUrl, isOwnStorageUrl } from '@backend/lib/storage-url';

const LIVE = { uid: 'uid-1', folder: 'avatars', bucket: 'nanny-now-d8518.firebasestorage.app', emulator: false };
const EMULATOR = { ...LIVE, emulator: true };

function liveUrl(objectPath: string, bucket = LIVE.bucket, host = 'firebasestorage.googleapis.com'): string {
  return `https://${host}/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=t`;
}

describe('isOwnStorageUrl — a real build', () => {
  it('accepts an object in this user’s own folder of our bucket', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/1720-abc.jpg'), LIVE)).toBe(true);
  });

  it('refuses another user’s folder', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-2/1720-abc.jpg'), LIVE)).toBe(false);
  });

  it('refuses the wrong folder', () => {
    expect(isOwnStorageUrl(liveUrl('nanny-ids/uid-1/1720-abc.jpg'), LIVE)).toBe(false);
  });

  it('refuses another bucket, another host, and plain http', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/a.jpg', 'someone-else.appspot.com'), LIVE)).toBe(false);
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/a.jpg', LIVE.bucket, 'evil.example'), LIVE)).toBe(false);
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/a.jpg').replace('https:', 'http:'), LIVE)).toBe(false);
  });

  it('refuses a path that climbs out of the folder, the folder itself, and non-URLs', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/../uid-2/a.jpg'), LIVE)).toBe(false);
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/'), LIVE)).toBe(false);
    expect(isOwnStorageUrl('not a url', LIVE)).toBe(false);
    expect(isOwnStorageUrl('https://firebasestorage.googleapis.com/somewhere-else', LIVE)).toBe(false);
  });
});

describe('isOwnStorageUrl — the emulator', () => {
  it('accepts the emulator’s own host and the app’s bucket name, still checking the path', () => {
    const url = `http://10.0.2.2:9199/v0/b/nanny-now-d8518.firebasestorage.app/o/${encodeURIComponent('avatars/uid-1/a.jpg')}?alt=media`;
    expect(isOwnStorageUrl(url, EMULATOR)).toBe(true);
    expect(isOwnStorageUrl(url.replace('uid-1', 'uid-2'), EMULATOR)).toBe(false);
  });
});

describe('assertOwnStorageUrl', () => {
  it('passes an own upload and refuses anything else with a 400 that says what to do', () => {
    const own = `https://firebasestorage.googleapis.com/v0/b/demo-nannyapp.appspot.com/o/${encodeURIComponent('nanny-ids/uid-1/f.jpg')}?alt=media`;
    expect(() => assertOwnStorageUrl(own, 'uid-1', 'nanny-ids')).not.toThrow();
    expect(() => assertOwnStorageUrl('https://storage.example.test/f.jpg', 'uid-1', 'nanny-ids')).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Upload the photo again.' }),
    );
  });
});
