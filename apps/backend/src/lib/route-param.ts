import { errors } from '@backend/lib/errors';

export function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

/**
 * Parse a route path parameter that is a sequential integer primary key
 * (e.g. `/bookings/:id`). Rejects anything that isn't a positive integer with
 * a 404 — a malformed id can never match an existing row, so "not found" is
 * the honest response and it keeps garbage out of Prisma's integer filters.
 */
export function routeIdParam(value: string | string[]): number {
  const raw = routeParam(value);
  if (!/^\d+$/.test(raw)) throw errors.notFound('Not found');
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw errors.notFound('Not found');
  return id;
}
