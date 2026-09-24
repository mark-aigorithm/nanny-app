jest.mock('@backend/lib/config', () => ({
  config: {
    firebase: {
      projectId: 'nanny-now-d8518',
      storageBucket: 'nanny-now-d8518.firebasestorage.app',
      storageEmulatorHost: '10.0.2.2:9199',
    },
  },
}));

import { assertOwnStorageUrl, isOwnStorageUrl } from '@backend/lib/storage-url';

const LIVE = { uid: 'uid-1', folder: 'avatars', bucket: 'nanny-now-d8518.firebasestorage.app' };
const EMULATOR = { ...LIVE, emulatorHost: '10.0.2.2:9199' };

function liveUrl(objectPath: string, bucket = LIVE.bucket, host = 'firebasestorage.googleapis.com'): string {
  return `https://${host}/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=t`;
}

function emulatorUrl(objectPath: string, host = '10.0.2.2:9199', bucket = LIVE.bucket): string {
  return `http://${host}/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

describe('isOwnStorageUrl — a real build (no emulator host configured)', () => {
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

  it('refuses an emulator-shaped URL when no emulator host is configured', () => {
    expect(isOwnStorageUrl(emulatorUrl('avatars/uid-1/a.jpg'), LIVE)).toBe(false);
  });
});

describe('isOwnStorageUrl — an emulator host configured', () => {
  it('accepts the emulator’s own host under the real project’s bucket name, still checking the path', () => {
    const url = emulatorUrl('avatars/uid-1/a.jpg', '10.0.2.2:9199', 'nanny-now-d8518.firebasestorage.app');
    expect(isOwnStorageUrl(url, EMULATOR)).toBe(true);
    expect(isOwnStorageUrl(url.replace('uid-1', 'uid-2'), EMULATOR)).toBe(false);
  });

  it('still accepts the live download host, any bucket — backend and admin-e2e fixtures build these', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/a.jpg', 'some-other-bucket.appspot.com'), EMULATOR)).toBe(true);
  });

  it('refuses a URL from some other http host', () => {
    const url = emulatorUrl('avatars/uid-1/a.jpg', 'evil.example:9199');
    expect(isOwnStorageUrl(url, EMULATOR)).toBe(false);
  });
});

describe('assertOwnStorageUrl', () => {
  it('accepts an own upload from the live download host', () => {
    const own = liveUrl('nanny-ids/uid-1/f.jpg', 'nanny-now-d8518.firebasestorage.app');
    expect(() => assertOwnStorageUrl(own, 'uid-1', 'nanny-ids')).not.toThrow();
  });

  it('accepts an own upload from the configured Storage emulator host', () => {
    const own = emulatorUrl('avatars/uid-1/a.jpg', '10.0.2.2:9199', 'nanny-now-d8518.firebasestorage.app');
    expect(() => assertOwnStorageUrl(own, 'uid-1', 'avatars')).not.toThrow();
  });

  it('refuses anything else with a 400 that says what to do', () => {
    expect(() => assertOwnStorageUrl('https://storage.example.test/f.jpg', 'uid-1', 'nanny-ids')).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Upload the photo again.' }),
    );
  });
});
