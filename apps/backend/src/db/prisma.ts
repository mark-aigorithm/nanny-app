// Importing config first ensures dotenv has populated process.env.DATABASE_URL
// before the Prisma client constructor reads it.
import { config } from '@backend/lib/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Single shared Prisma client. Reused across hot-reloads in dev so we
// don't exhaust the database connection pool.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prisma 7 ships without a built-in engine — connect via the pg driver adapter.
const adapter = new PrismaPg({ connectionString: config.databaseUrl });

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    adapter,
    log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });

if (config.nodeEnv !== 'production') {
  globalThis.__prisma = prisma;
}
