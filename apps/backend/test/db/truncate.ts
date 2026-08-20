/**
 * Per-test database reset.
 *
 * Truncation rather than transaction-rollback isolation: service code opens its
 * own `prisma.$transaction([...])` blocks for multi-step writes, and wrapping a
 * test in an outer transaction that is rolled back turns those into nested
 * transactions — which Postgres does not have. Savepoints would paper over it
 * until the first piece of code that expects a real commit. TRUNCATE is
 * unconditionally correct and, on a small test dataset, fast.
 */
import { prisma } from '@backend/db/prisma';

/**
 * Tables that must survive a reset.
 *
 * - `_prisma_migrations` is the migration ledger; truncating it would make
 *   Prisma believe the schema is unmigrated on the next run.
 * - `spatial_ref_sys` is PostGIS's coordinate-system reference data, created in
 *   `public` by the extension. `ST_DistanceSphere` in nanny.service.ts needs it,
 *   and nothing repopulates it.
 */
const PRESERVED_TABLES = new Set(['_prisma_migrations', 'spatial_ref_sys']);

let cachedTableList: string[] | null = null;

/** Every truncatable table in `public`, read once per worker process. */
async function resolveTables(): Promise<string[]> {
  if (cachedTableList) return cachedTableList;

  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;

  cachedTableList = rows
    .map((row) => row.tablename)
    .filter((name) => !PRESERVED_TABLES.has(name));

  return cachedTableList;
}

/**
 * Empties every table and resets identity sequences, so ids are predictable
 * from one test to the next.
 *
 * `CASCADE` is required — the schema is heavily foreign-keyed and Postgres
 * refuses a partial truncate. Truncating all tables in a single statement also
 * means no intermediate state ever violates a constraint.
 */
export async function truncateAll(): Promise<void> {
  const tables = await resolveTables();
  if (tables.length === 0) return;

  const list = tables.map((name) => `"public"."${name}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
