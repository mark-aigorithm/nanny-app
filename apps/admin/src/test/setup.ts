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

// jsdom has no ResizeObserver, and recharts' ResponsiveContainer constructs one
// on mount — without this stub any page with a chart throws before it renders.
// Charts are never measured in these tests, so an observer that does nothing
// is the right stand-in.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

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
