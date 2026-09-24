import { config } from './config';
import { errors } from './errors';

/** Where every production Firebase Storage download URL is served from. */
const DOWNLOAD_HOST = 'firebasestorage.googleapis.com';

/** The upload folders a profile or KYC URL may point into. */
export type StorageFolder = 'avatars' | 'nanny-ids';

export type OwnStorageUrlRules = {
  uid: string;
  folder: string;
  bucket: string;
  /**
   * Set only when a test stack is running a Storage emulator at this host
   * (e.g. "10.0.2.2:9199" from an Android emulator). Its download URLs come
   * from that host and name whatever bucket the app is built with, not our
   * real bucket, so the bucket check is skipped for a URL from either that
   * host or the real download host — the object path is still checked either
   * way. `undefined` in every real environment, where both host and bucket
   * must match exactly.
   */
  emulatorHost?: string;
};

/**
 * Whether `url` is a download URL for an object this user uploaded into
 * `folder` — `<folder>/<uid>/<file>` in our bucket, which is exactly where
 * `uploadImageToFirebase` puts it. Anything else would let a client pin its
 * profile or KYC record to someone else's upload, or to any image on the web.
 */
export function isOwnStorageUrl(url: string, rules: OwnStorageUrlRules): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const isLiveDownload = parsed.protocol === 'https:' && parsed.host === DOWNLOAD_HOST;
  const isEmulatorHost = rules.emulatorHost !== undefined && parsed.host === rules.emulatorHost;

  if (rules.emulatorHost !== undefined) {
    // A configured emulator host accepts either its own host (any protocol —
    // the emulator is plain http) or the real download host, since backend
    // and admin-e2e fixtures build live-shaped URLs even when a test stack
    // has an emulator host configured.
    if (!isEmulatorHost && !isLiveDownload) return false;
  } else if (!isLiveDownload) {
    return false;
  }

  // The object path stays percent-encoded in `pathname` (`avatars%2Fuid%2Ff.jpg`),
  // so it is one segment after `/o/`.
  const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(parsed.pathname);
  if (!match?.[1] || !match[2]) return false;
  // Bucket is checked only with no emulator host configured — an emulator URL
  // (either host) carries whatever bucket name the build uses, not ours.
  if (rules.emulatorHost === undefined && match[1] !== rules.bucket) return false;

  let objectPath: string;
  try {
    objectPath = decodeURIComponent(match[2]);
  } catch {
    return false;
  }
  const prefix = `${rules.folder}/${rules.uid}/`;
  return (
    objectPath.startsWith(prefix) &&
    objectPath.length > prefix.length &&
    !objectPath.split('/').includes('..')
  );
}

/** Refuses, with a message the app can show as-is, any upload URL that isn't this user's own. */
export function assertOwnStorageUrl(url: string, uid: string, folder: StorageFolder): void {
  const own = isOwnStorageUrl(url, {
    uid,
    folder,
    bucket: config.firebase.storageBucket,
    emulatorHost: config.firebase.storageEmulatorHost,
  });
  if (!own) throw errors.badRequest('Upload the photo again.');
}
