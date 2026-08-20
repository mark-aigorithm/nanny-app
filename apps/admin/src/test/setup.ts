/**
 * Global setup for the admin Vitest suite.
 *
 * The MSW server is started here rather than per-file so every test gets the
 * same guarantee: any request the app makes that no handler covers fails the
 * test loudly, instead of hanging or silently resolving undefined.
 */
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './server';

beforeAll(() => {
  // `error`, not `warn`: an unhandled request means the test is exercising a
  // code path nobody described, and the result would be meaningless.
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  // Handlers overridden inside a test (server.use(...)) must not leak into the
  // next one, and the DOM must not accumulate between renders.
  server.resetHandlers();
  cleanup();
});

afterAll(() => {
  server.close();
});
