/**
 * The Prisma client integration tests use.
 *
 * This is deliberately the application's own singleton from
 * `@backend/db/prisma`, not a second client. By the time this module is
 * evaluated, test/env.ts has already rewritten `DATABASE_URL` to point at
 * nannyapp_test, and lib/config.ts reads it at import time — so the app client
 * is already bound to the test database.
 *
 * A second client would add a second connection pool per Jest worker (a real
 * constraint once the integration project runs in parallel) and would risk
 * drifting from the app's own adapter configuration, for no benefit: Prisma
 * has no client-side cache, so a separate connection sees exactly the same
 * rows. Assertions made through this handle are still independent of the code
 * under test in the sense that matters — they re-read from the database rather
 * than trusting whatever the service returned.
 */
export { prisma } from '@backend/db/prisma';
