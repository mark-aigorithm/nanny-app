import type { StorageFolder } from '@backend/lib/storage-url';

/**
 * A Firebase Storage download URL for an object this user uploaded, in the
 * shape `uploadImageToFirebase` produces (`<folder>/<uid>/<file>`, URL-encoded
 * after `/o/`). The backend accepts no other shape for a photo or ID image, so
 * every fixture that registers, patches an avatar or submits an ID uses this.
 */
export function storageUrl(folder: StorageFolder, uid: string, file = 'photo.jpg'): string {
  const objectPath = encodeURIComponent(`${folder}/${uid}/${file}`);
  return `https://firebasestorage.googleapis.com/v0/b/demo-nannyapp.appspot.com/o/${objectPath}?alt=media&token=test`;
}
