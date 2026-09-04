import Constants from 'expo-constants';
import {
  connectStorageEmulator,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from 'firebase/storage';

import { auth, firebaseApp } from '@mobile/lib/firebase';

const storage = getStorage(firebaseApp);

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
    connectStorageEmulator(storage, host ?? '127.0.0.1', Number(port ?? 9199));
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

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error(`Failed to read local image: ${response.status}`);
  }
  const blob = await response.blob();

  const ext = inferExtension(localUri, blob.type);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const objectRef = ref(storage, `${folder}/${uid}/${filename}`);

  await uploadBytes(objectRef, blob, {
    contentType: blob.type || `image/${ext}`,
  });
  return getDownloadURL(objectRef);
}

/** True when the URI points at a device-local file rather than a remote URL. */
export function isLocalImageUri(uri: string): boolean {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph://');
}

function inferExtension(uri: string, mimeType: string): string {
  const fromMime = mimeType.startsWith('image/') ? mimeType.split('/')[1] : null;
  if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() ?? 'jpg';
}
