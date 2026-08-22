import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Deliberately re-declares the aliases from vite.config.ts rather than
 * importing it: that config also carries the dev-server proxy, which has no
 * meaning here and would be silently inert. The two alias blocks must stay in
 * step — if a new alias is added there, add it here too.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@admin': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Playwright specs live in e2e/ and are driven by its own runner; without
    // this, Vitest would try to collect them and fail on the `@playwright/test`
    // imports.
    exclude: ['node_modules', 'dist', 'e2e/**'],
    // Vitest forks one worker per CPU core by default, and each fork here pays
    // for a jsdom environment plus the React plugin's transform. Turborepo runs
    // this suite alongside the backend and mobile suites, so an uncapped fan-out
    // multiplies across packages and can exhaust system memory.
    maxWorkers: 4,
  },
});
