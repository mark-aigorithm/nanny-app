import axios from 'axios';
import Constants from 'expo-constants';

import { auth } from '@mobile/lib/firebase';


const API_BASE_URL = "https://backend-beige-nine-55.vercel.app";
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

function isTechnicalErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('prisma') ||
    lower.includes('unknown argument') ||
    lower.includes('request failed with status code') ||
    lower.includes('internal server error') ||
    lower.includes('paymob intention') ||
    lower.includes('network error') ||
    message.length > 160
  );
}

type ApiErrorOptions = {
  fallback?: string;
};

/** Map API/axios failures to short, user-facing copy (never raw HTTP/Prisma text). */
export function getApiErrorMessage(
  err: unknown,
  options: string | ApiErrorOptions = {},
): string {
  const fallback =
    typeof options === 'string'
      ? options
      : (options.fallback ?? 'Something went wrong. Please try again.');

  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string | null } | undefined;
    const serverMsg = data?.error?.trim();
    const status = err.response?.status;

    if (status === 409) {
      return serverMsg && !isTechnicalErrorMessage(serverMsg)
        ? serverMsg
        : 'This time slot is no longer available. Please choose another.';
    }

    if (status === 400 || status === 403 || status === 404) {
      if (serverMsg && !isTechnicalErrorMessage(serverMsg)) {
        return serverMsg;
      }
    }

    if (status === 502 || status === 503 || (status && status >= 500)) {
      return fallback;
    }

    if (err.code === 'ECONNABORTED') {
      return 'The request timed out. Please check your connection and try again.';
    }

    if (!err.response) {
      console.log(API_BASE_URL)
      return 'Could not reach the server. Please check your connection and try again.';
    }

    if (serverMsg && !isTechnicalErrorMessage(serverMsg)) {
      return serverMsg;
    }

    return fallback;
  }

  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg && !isTechnicalErrorMessage(msg)) {
      return msg;
    }
  }

  return fallback;
}

/**
 * Unwraps the backend's `{ data, error }` envelope. On success, returns
 * `data`; on error, throws an `Error` with the server's message so React
 * Query / try-catch sees it as a normal failure.
 */
export async function unwrap<T>(promise: Promise<{ data: { data: T | null; error: string | null } }>): Promise<T> {
  try {
    const res = await promise;
    if (res.data.error || res.data.data === null) {
      const msg = res.data.error ?? 'Something went wrong. Please try again.';
      throw new Error(isTechnicalErrorMessage(msg) ? 'Something went wrong. Please try again.' : msg);
    }
    return res.data.data;
  } catch (err) {
    throw new Error(getApiErrorMessage(err));
  }
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
  try {
    const res = await promise;
    if ('error' in res.data && res.data.error) {
      throw new Error(res.data.error);
    }
    const body = res.data as PaginatedResponse<T, M>;
    return { items: body.data, meta: body.meta };
  } catch (err) {
    throw new Error(getApiErrorMessage(err));
  }
}
