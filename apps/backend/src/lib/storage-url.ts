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
   * The Storage emulator serves uploads from its own host (10.0.2.2:9199 from
   * an Android emulator) under whatever bucket name the app is built with, so
   * only the object path can be checked there.
   */
  emulator: boolean;
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
  if (!rules.emulator && (parsed.protocol !== 'https:' || parsed.host !== DOWNLOAD_HOST)) return false;

  // The object path stays percent-encoded in `pathname` (`avatars%2Fuid%2Ff.jpg`),
  // so it is one segment after `/o/`.
  const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(parsed.pathname);
  if (!match?.[1] || !match[2]) return false;
  if (!rules.emulator && match[1] !== rules.bucket) return false;

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
    // A `demo-` project id is emulator-only by Firebase's own rule, so this
    // can never loosen the check against the live bucket.
    emulator: config.firebase.projectId.startsWith('demo-'),
  });
  if (!own) throw errors.badRequest('Upload the photo again.');
}
