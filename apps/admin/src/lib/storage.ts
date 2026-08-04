import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { firebaseAuth, firebaseStorage } from './firebase';

/**
 * Upload a File selected in the admin browser to Firebase Storage and return
 * its public download URL. Mirrors the mobile app's uploadImageToFirebase.
 * Files land under `<folder>/<uid>/<timestamp>-<random>.<ext>`.
 */
export async function uploadImageToFirebase(file: File, folder: string): Promise<string> {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');

  const ext = inferExtension(file.name, file.type);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const objectRef = ref(firebaseStorage, `${folder}/${uid}/${filename}`);

  await uploadBytes(objectRef, file, { contentType: file.type || `image/${ext}` });
  return getDownloadURL(objectRef);
}

function inferExtension(name: string, mimeType: string): string {
  const fromMime = mimeType.startsWith('image/') ? mimeType.split('/')[1] : null;
  if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  const match = name.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() ?? 'jpg';
}
