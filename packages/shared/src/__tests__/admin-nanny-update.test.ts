import { describe, expect, it } from 'vitest';

import { UpdateAdminNannySchema } from '../admin';

describe('UpdateAdminNannySchema', () => {
  it('accepts the fields an admin can now correct: photo, date of birth and home pin', () => {
    const parsed = UpdateAdminNannySchema.safeParse({
      avatarUrl: 'https://cdn.example/nanny.jpg',
      dateOfBirth: '1995-06-15',
      latitude: 30.0444,
      longitude: 31.2357,
    });
    expect(parsed.success).toBe(true);
  });

  it('lets the photo be cleared with null', () => {
    expect(UpdateAdminNannySchema.safeParse({ avatarUrl: null }).success).toBe(true);
  });

  it('refuses a latitude without a longitude (and vice versa)', () => {
    const lat = UpdateAdminNannySchema.safeParse({ latitude: 30.0444 });
    expect(lat.success).toBe(false);
    if (!lat.success) {
      expect(lat.error.issues[0]?.message).toBe(
        'Latitude and longitude must be updated together.',
      );
    }
    expect(UpdateAdminNannySchema.safeParse({ longitude: 31.2357 }).success).toBe(false);
  });

  it('refuses a malformed date of birth', () => {
    expect(UpdateAdminNannySchema.safeParse({ dateOfBirth: '15/06/1995' }).success).toBe(false);
  });
});
