/**
 * Loads `.env.test` and refuses to let a suite run against anything that is
 * not the throwaway test database.
 *
 * This module must be evaluated before any module that reads `config`, because
 * lib/config.ts validates and freezes the environment at import time. Jest
 * `setupFiles` guarantees that ordering — entries run before the test file (and
 * therefore its imports) are evaluated. `globalSetup` imports it directly, as
 * that runs in its own process with its own `process.env`.
 */
import path from 'node:path';

import dotenv from 'dotenv';

/**
 * `override: true` is deliberate. dotenv's default is to leave already-set
 * variables alone, which would mean a `DATABASE_URL` exported in the
 * developer's shell silently wins — and the suite would truncate the dev
 * database instead of the test one. The test env file is the authority here.
 */
dotenv.config({
  path: path.join(__dirname, '..', '.env.test'),
  override: true,
});

/**
 * Last line of defence before `TRUNCATE`. Everything above is convention;
 * this is the check that makes destroying the wrong database impossible.
 * Kept as a hard failure rather than a warning — the whole point is that it
 * cannot be ignored.
 */
export function assertTestDatabase(): void {
  const url = process.env['DATABASE_URL'];

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Did apps/backend/.env.test fail to load?',
    );
  }

  // Match on the database name at the end of the URL, ignoring any query
  // string, so a host that merely contains the word "test" cannot vouch for
  // an otherwise production-looking connection.
  const databaseName = new URL(url).pathname.replace(/^\//, '');

  if (databaseName !== 'nannyapp_test') {
    throw new Error(
      `Refusing to run tests against database "${databaseName}". ` +
        'The suite truncates every table between tests and will only ever ' +
        'target "nannyapp_test". Check apps/backend/.env.test.',
    );
  }
}

assertTestDatabase();
