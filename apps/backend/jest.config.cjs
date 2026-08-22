/**
 * Two projects, deliberately kept apart.
 *
 *   unit        — the existing suites under src/__tests__. Prisma, Firebase and
 *                 storage are mocked; no services required; milliseconds to run.
 *                 This is the inner-loop suite.
 *   integration — suites under src/__integration__. Real PostGIS database, real
 *                 Firebase Auth emulator, real HTTP through supertest. Requires
 *                 `pnpm test:env` to be running.
 *
 * They are separate because they have different prerequisites, not merely
 * different speeds: a developer with no Docker running should still be able to
 * run the unit suite, and CI should be able to report which tier broke.
 *
 * Run them with `--selectProjects` (see the package.json scripts) rather than
 * together in one invocation — the integration project must not be parallelised
 * across workers, since they would truncate one another's data mid-test, and
 * `maxWorkers` is a run-level option that cannot be set per project.
 */

/** ts-jest, pointed at the tsconfig that also covers the test/ tree. */
const transform = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
};

const moduleNameMapper = {
  '^@backend/(.*)$': '<rootDir>/src/$1',
  '^@nanny-app/shared$': '<rootDir>/../../packages/shared/src/index.ts',
};

/** @type {import('jest').Config} */
module.exports = {
  // Jest defaults to one worker per CPU core. On a 20-core machine that is 19
  // ts-jest workers, each carrying its own TypeScript program — around 9 GB,
  // enough to freeze a 16 GB laptop before the suite finishes. Four is well
  // under the memory ceiling and still saturates the run.
  //
  // This is the run-level default; `test:integration` overrides it to 1 on the
  // command line (see the note above about parallelising that project).
  maxWorkers: 4,
  // ts-jest workers grow across files as the program cache fills. Recycling a
  // worker that crosses this line costs one cold compile and bounds the run's
  // total footprint; without it a long suite creeps upward until it OOMs.
  workerIdleMemoryLimit: '512MB',
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform,
      moduleNameMapper,
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.test.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform,
      moduleNameMapper,
      roots: ['<rootDir>/src', '<rootDir>/test'],
      testMatch: ['**/__integration__/**/*.test.ts'],
      // Migrates and seeds the test database once for the whole run.
      globalSetup: '<rootDir>/test/db/global-setup.ts',
      // Must load before anything reads `config`, which validates and freezes
      // the environment at import time.
      setupFiles: ['<rootDir>/test/env.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup-integration.ts'],
      // Real database round-trips plus an emulator sign-in per factory user;
      // Jest's 5s default is not enough for a test that builds a few entities.
      testTimeout: 30_000,
    },
  ],
};
