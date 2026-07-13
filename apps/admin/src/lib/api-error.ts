import { isAxiosError } from 'axios';

/** Friendly fallback copy per HTTP status, in the interface's own voice. */
function statusMessage(status: number): string {
  if (status === 400 || status === 422) {
    return 'Some of the details weren’t valid. Check the form and try again.';
  }
  if (status === 401) return 'Your session expired. Sign in again to continue.';
  if (status === 403) return 'You don’t have permission to do that.';
  if (status === 404) return 'We couldn’t find what you were looking for.';
  if (status === 409) return 'That change conflicts with the current state. Refresh and try again.';
  if (status === 429) return 'Too many requests in a row. Wait a moment and try again.';
  if (status >= 500) return 'The server ran into a problem. Please try again shortly.';
  return 'Something went wrong. Please try again.';
}

/**
 * Turns any thrown value into a descriptive, user-facing message. Prefers the
 * backend's `{ error }` text, then a friendly per-status fallback, then the
 * raw Error message — never a bare "Something went wrong" when we can do better.
 */
export function apiErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const apiError = (err.response?.data as { error?: string } | undefined)?.error;
    if (apiError) return apiError;

    if (err.response) return statusMessage(err.response.status);

    // No response at all → network / server unreachable.
    if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') {
      return 'Couldn’t reach the server. Check your connection and try again.';
    }
  }
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}
