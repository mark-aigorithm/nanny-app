import { getApp } from 'firebase/app';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

import { auth } from '@mobile/lib/firebase';

const storage = getStorage(getApp());

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

function inferExtension(uri: string, mimeType: string): string {
  const fromMime = mimeType.startsWith('image/') ? mimeType.split('/')[1] : null;
  if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() ?? 'jpg';
}
