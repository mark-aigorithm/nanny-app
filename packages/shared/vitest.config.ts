import { defineConfig } from 'vitest/config';

/**
 * These are pure Zod schemas with no DOM, no network and no framework — a plain
 * node environment is all they need, and it keeps the suite fast enough to run
 * on every save.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
