import axios from 'axios';
import Constants from 'expo-constants';

import { auth } from '@mobile/lib/firebase';

const BACKEND_PORT = 3000;

/** In dev, reuse the same LAN IP Metro advertises (exp://192.168.x.x:8081). */
function resolveApiBaseUrl(): string {
  const configured = Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined;

  if (__DEV__) {
    const host =
      Constants.expoConfig?.hostUri?.split(':')[0] ??
      Constants.expoGoConfig?.debuggerHost?.split(':')[0];

    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${BACKEND_PORT}`;
    }
  }

  return configured ?? `http://localhost:${BACKEND_PORT}`;
}

const API_BASE_URL = resolveApiBaseUrl();
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

export type PaginatedResponse<T, M = Record<string, unknown>> = {
  data: T;
  error: null;
  meta: M;
};

/**
 * Unwraps paginated `{ data, error, meta }` responses from list endpoints.
 */
export async function unwrapPaginated<T, M>(
  promise: Promise<{ data: PaginatedResponse<T, M> | { data: null; error: string } }>,
): Promise<{ items: T; meta: M }> {
  const res = await promise;
  if ('error' in res.data && res.data.error) {
    throw new Error(res.data.error);
  }
  const body = res.data as PaginatedResponse<T, M>;
  return { items: body.data, meta: body.meta };
}
