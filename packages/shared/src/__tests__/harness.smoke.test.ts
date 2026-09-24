/**
 * Proves the Vitest harness for this package: TypeScript compiles, the schemas
 * import, and both the accept and reject paths of a schema are observable.
 *
 * The real per-schema suites are a separate piece of work; this file only has
 * to fail when the runner itself is misconfigured.
 */
import { describe, expect, it } from 'vitest';

import { UpdateProfileRequestSchema } from '../auth';

describe('shared schema harness', () => {
  it('parses a valid payload', () => {
    const result = UpdateProfileRequestSchema.safeParse({
      firstName: 'Nadia',
      avatarUrl: 'https://example.test/nadia.jpg',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid field and reports its path', () => {
    const result = UpdateProfileRequestSchema.safeParse({ avatarUrl: 'not-a-url' });

    expect(result.success).toBe(false);
    // The issue path is what the backend's validate middleware surfaces to the
    // client, so it is part of the contract, not an implementation detail.
    expect(result.error?.issues[0]?.path).toEqual(['avatarUrl']);
  });
});
