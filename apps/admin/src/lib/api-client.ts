import axios from 'axios';

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

apiClient.interceptors.request.use((request) => {
  const token = getAdminToken();
  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  }
  return request;
});
