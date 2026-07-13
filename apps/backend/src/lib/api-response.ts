import type { ApiResponse, PaginationMeta } from '@nanny-app/shared';

export function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

/** Success response carrying a page of data plus its pagination metadata. */
export function okPaged<T>(
  data: T,
  meta: PaginationMeta,
): ApiResponse<T> & { meta: PaginationMeta } {
  return { data, error: null, meta };
}

export function fail(message: string): ApiResponse<never> {
  return { data: null, error: message };
}
