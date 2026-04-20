import axios from 'axios';
import Constants from 'expo-constants';

import { auth } from '@mobile/lib/firebase';

const API_BASE_URL =
  'http://192.168.100.6:3000';
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Firebase JWT to every request automatically. The token refreshes
// itself transparently — `getIdToken()` returns a fresh one if expired.
api.interceptors.request.use(async (config) => {
  const currentUser = auth().currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Unwraps the backend's `{ data, error }` envelope. On success, returns
 * `data`; on error, throws an `Error` with the server's message so React
 * Query / try-catch sees it as a normal failure.
 */
export async function unwrap<T>(promise: Promise<{ data: { data: T | null; error: string | null } }>): Promise<T> {
  const res = await promise;
  if (res.data.error || res.data.data === null) {
    throw new Error(res.data.error ?? 'Unknown server error');
  }
  return res.data.data;
}
