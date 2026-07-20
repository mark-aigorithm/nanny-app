import { config } from './config';
import { firebaseStorage } from './firebase';

/**
 * Extract the storage object path from a Firebase Storage download URL.
 *
 * Download URLs look like:
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded-path>?alt=media&token=…
 * The object path lives in the `/o/<path>` segment and is URL-encoded (e.g.
 * `nanny-ids%2F<uid>%2F<file>.jpg`), so it must be decoded back to
 * `nanny-ids/<uid>/<file>.jpg` before it can be addressed in the bucket.
 *
 * Returns null for anything that isn't a recognisable Firebase download URL.
 */
export function objectPathFromDownloadUrl(url: string): string | null {
  const match = /\/o\/([^?]+)/.exec(url);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Best-effort delete of a Firebase Storage object given its download URL.
 * Used when an admin rejects an ID so the sensitive images don't linger.
 *
 * Deliberately non-throwing: a storage failure (already deleted, network) must
 * not abort the surrounding DB write that clears the URL and updates the KYC
 * status. `ignoreNotFound` keeps repeated rejects idempotent.
 */
export async function deleteStorageObjectByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const path = objectPathFromDownloadUrl(url);
  if (!path) return;
  try {
    await firebaseStorage
      .bucket(config.firebase.storageBucket)
      .file(path)
      .delete({ ignoreNotFound: true });
  } catch (err) {
    console.warn('[storage] failed to delete object', { path, err });
  }
}
