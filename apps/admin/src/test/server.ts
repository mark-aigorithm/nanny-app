import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/**
 * The mock backend for component tests.
 *
 * Intercepting at the network layer — rather than mocking the api.ts functions
 * — means `apiClient` runs for real: its Firebase token interceptor, its 401
 * refresh-and-replay, and the `{ data, error }` envelope unwrapping are all
 * exercised. Those interceptors are where the subtle bugs live, and a mocked
 * api.ts would skip them entirely.
 */
export const server = setupServer(...handlers);
