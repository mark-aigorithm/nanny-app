import { describe, expect, it } from 'vitest';

import { ReclaimEmailRequestSchema } from '../auth';

describe('ReclaimEmailRequestSchema', () => {
  it('normalises the email the same way every other auth body does', () => {
    const parsed = ReclaimEmailRequestSchema.parse({
      email: '  Sarah@Example.COM ',
      emailVerificationToken: 'tok',
    });
    expect(parsed).toEqual({ email: 'sarah@example.com', emailVerificationToken: 'tok' });
  });

  it('refuses an invalid email', () => {
    const result = ReclaimEmailRequestSchema.safeParse({ email: 'not-an-email', emailVerificationToken: 'tok' });
    expect(result.success).toBe(false);
  });

  it('refuses a missing or empty token', () => {
    expect(ReclaimEmailRequestSchema.safeParse({ email: 'sarah@example.com' }).success).toBe(false);
    expect(
      ReclaimEmailRequestSchema.safeParse({ email: 'sarah@example.com', emailVerificationToken: '' }).success,
    ).toBe(false);
  });
});
