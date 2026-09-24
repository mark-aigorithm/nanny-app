import { describe, expect, it } from 'vitest';

import { DeleteMeRequestSchema } from '../auth';

describe('DeleteMeRequestSchema', () => {
  it('parses an empty or missing body to {}', () => {
    expect(DeleteMeRequestSchema.parse({})).toEqual({});
    expect(DeleteMeRequestSchema.parse(undefined)).toEqual({});
  });

  it('accepts the explicit confirm literal and the Apple flag', () => {
    expect(DeleteMeRequestSchema.parse({ confirm: 'delete-my-account', appleRevoked: true })).toEqual({
      confirm: 'delete-my-account',
      appleRevoked: true,
    });
  });

  it('refuses any other confirm value', () => {
    expect(DeleteMeRequestSchema.safeParse({ confirm: 'yes' }).success).toBe(false);
  });
});
