import * as SecureStore from 'expo-secure-store';

// expo-secure-store caps each value at ~2 KB. Firebase Auth serialises the
// full user object (id-token + refresh-token + profile) which often exceeds
// that limit. We chunk large values and reassemble on read so the adapter is
// a transparent drop-in for the AsyncStorage interface that
// getReactNativePersistence expects.

const CHUNK_SIZE = 1800; // bytes, safely under the 2 048-byte limit
const CHUNK_COUNT_SUFFIX = '__numChunks';

function sanitizeKey(key: string): string {
  // SecureStore keys must be [a-zA-Z0-9._-] — replace everything else.
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function setItem(rawKey: string, value: string): Promise<void> {
  const key = sanitizeKey(rawKey);
  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`, '1');
    await SecureStore.setItemAsync(`${key}_0`, value);
    return;
  }
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  await SecureStore.setItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`, String(chunks.length));
  await Promise.all(chunks.map((chunk, idx) => SecureStore.setItemAsync(`${key}_${idx}`, chunk)));
}

async function getItem(rawKey: string): Promise<string | null> {
  const key = sanitizeKey(rawKey);
  const countStr = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
  if (!countStr) return null;
  const count = parseInt(countStr, 10);
  const chunks = await Promise.all(
    Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}_${i}`)),
  );
  if (chunks.some((c) => c === null)) return null;
  return chunks.join('');
}

async function removeItem(rawKey: string): Promise<void> {
  const key = sanitizeKey(rawKey);
  const countStr = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
  if (!countStr) return;
  const count = parseInt(countStr, 10);
  await Promise.all([
    SecureStore.deleteItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`),
    ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}_${i}`)),
  ]);
}

/** AsyncStorage-compatible adapter backed by expo-secure-store (Keychain / Keystore). */
export const secureStorageAdapter = { getItem, setItem, removeItem };
