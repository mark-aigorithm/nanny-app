import { Prisma } from '@prisma/client';

/**
 * The column name(s) behind a unique-constraint violation, or `null` when
 * `err` isn't one. Prisma 7's driver adapters (`@prisma/adapter-pg`, which
 * this backend runs — see `src/db/prisma.ts`) moved the offending column off
 * `meta.target` and onto `meta.driverAdapterError.cause.constraint`, observed
 * at runtime as:
 *
 * ```
 * meta: {
 *   modelName: 'User',
 *   driverAdapterError: DriverAdapterError {
 *     cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint: { fields: ['email'] } },
 *   },
 * }
 * ```
 *
 * A constraint with no columns in its definition (rare — e.g. an expression
 * index) reports `{ index: '<name>' }` instead of `fields`. The legacy
 * `meta.target` shape (a plain query-engine binary, or an older Prisma
 * version) is still checked as a fallback so this keeps working if the
 * adapter's error shape changes again.
 */
export function uniqueClashFields(err: unknown): string[] | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return null;
  }

  const meta = err.meta;
  if (!meta || typeof meta !== 'object') return [];

  const driverAdapterError = (meta as Record<string, unknown>)['driverAdapterError'];
  const cause =
    driverAdapterError instanceof Error
      ? ((driverAdapterError as { cause?: unknown }).cause ?? null)
      : null;
  const constraint =
    cause !== null && typeof cause === 'object'
      ? (cause as Record<string, unknown>)['constraint']
      : undefined;

  if (constraint !== null && typeof constraint === 'object') {
    const fields = (constraint as Record<string, unknown>)['fields'];
    if (Array.isArray(fields) && fields.every((f): f is string => typeof f === 'string')) {
      return fields;
    }
    const index = (constraint as Record<string, unknown>)['index'];
    if (typeof index === 'string') return [index];
  }

  const target = (meta as Record<string, unknown>)['target'];
  if (typeof target === 'string') return [target];
  if (Array.isArray(target) && target.every((t): t is string => typeof t === 'string')) {
    return target;
  }

  return [];
}
