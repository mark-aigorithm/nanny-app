import type { ApiResponse } from '@nanny-app/shared';

export function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function fail(message: string): ApiResponse<never> {
  return { data: null, error: message };
}
