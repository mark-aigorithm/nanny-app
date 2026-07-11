import axios, { type InternalAxiosRequestConfig } from 'axios';

import { firebaseAuth } from './firebase';

const TOKEN_STORAGE_KEY = 'nanny-admin-token';

export function getAdminToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// In dev, /api is proxied to the local backend by vite.config.ts.
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
});

// Attach a Firebase ID token to every request. Pulling it from the current
// user (instead of a stale localStorage snapshot) lets the SDK refresh the
// token transparently once it expires — otherwise a tab left open past the
// ~1h token lifetime starts sending an expired token → "Invalid or expired
// token". The cached copy in localStorage is kept in sync as a fallback for
// requests that fire before Firebase finishes restoring the session.
apiClient.interceptors.request.use(async (request) => {
  const user = firebaseAuth.currentUser;
  let token = getAdminToken();
  if (user) {
    token = await user.getIdToken(); // refreshes automatically when near expiry
    setAdminToken(token);
  }
  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  }
  return request;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// Safety net: if the server still rejects the token (401), force a one-time
// refresh and replay the request once.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    const original = error.config as RetriableConfig | undefined;
    const user = firebaseAuth.currentUser;
    if (error.response?.status === 401 && user && original && !original._retry) {
      original._retry = true;
      const fresh = await user.getIdToken(true); // force refresh
      setAdminToken(fresh);
      original.headers.Authorization = `Bearer ${fresh}`;
      return apiClient(original);
    }
    return Promise.reject(error);
  },
);
