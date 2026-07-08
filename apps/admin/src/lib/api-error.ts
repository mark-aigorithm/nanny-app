import { isAxiosError } from 'axios';

/** Extracts the backend's `{ error }` message when present. */
export function apiErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const apiError = (err.response?.data as { error?: string } | undefined)?.error;
    if (apiError) return apiError;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
