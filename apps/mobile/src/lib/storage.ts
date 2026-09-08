import storage from '@react-native-firebase/storage';
import Constants from 'expo-constants';

import { auth } from '@mobile/lib/firebase';

// Storage is the NATIVE module, and that is the whole point.
//
// Uploads used to go through the Firebase JS SDK while auth ran on
// @react-native-firebase/auth. Two Firebase runtimes cannot share a session, so
// the JS SDK's app had no signed-in user and every upload left the device
// unauthenticated — which the bucket's rules reject with `storage/unauthorized`.
// The uid in the object path came from native auth and looked perfectly valid,
// which is what made it read like a rules bug rather than a client bug. Only the
// wide-open emulator rules used by E2E let it through unnoticed.
//
// Using the same SDK for both means the upload carries the session's ID token
// automatically. Keep it that way: never reintroduce `firebase/storage` here.

// End-to-end tests point Storage at the local emulator so uploads (nanny ID,
// avatar, marketplace photos) don't need a live bucket. Populated from
// FIREBASE_STORAGE_EMULATOR_HOST by app.config.ts (10.0.2.2:9199 from an Android
// emulator); empty in every real build, where this is a no-op. Wrapped because
// Fast Refresh re-running this module would otherwise re-connect and throw.
const storageEmulatorHost = Constants.expoConfig?.extra?.['firebaseStorageEmulatorHost'] as
  | string
  | undefined;
if (storageEmulatorHost) {
  const [host, port] = storageEmulatorHost.split(':');
  try {
    storage().useEmulator(host ?? '127.0.0.1', Number(port ?? 9199));
  } catch {
    // Already connected on a previous run (Fast Refresh) — safe to ignore.
  }
}

/**
 * Upload a local file URI (e.g. one returned by expo-image-picker) to
 * Firebase Storage and return its public download URL.
 *
 * The file is placed under `<folder>/<uid>/<timestamp>-<random>.<ext>` so
 * each user's uploads stay isolated and filenames don't collide.
 */
export async function uploadImageToFirebase(
  localUri: string,
  folder: string,
): Promise<string> {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');

  const ext = inferExtension(localUri);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const objectRef = storage().ref(`${folder}/${uid}/${filename}`);

  // putFile streams the file natively from its local path. The JS SDK needed a
  // fetch() into a Blob first, which read the entire image into JS memory.
  await objectRef.putFile(localUri, { contentType: contentTypeFor(ext) });
  return objectRef.getDownloadURL();
}

/** True when the URI points at a device-local file rather than a remote URL. */
export function isLocalImageUri(uri: string): boolean {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph://');
}

function inferExtension(uri: string): string {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = match?.[1]?.toLowerCase() ?? 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
}

function contentTypeFor(ext: string): string {
  return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
}
