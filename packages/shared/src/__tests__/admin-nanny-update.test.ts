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

  it('does not carry the pin or the address line — those go through PUT /nannies/:id/address', () => {
    // Unknown keys are stripped, so a body of only pin fields is an empty
    // update, which the "at least one field" rule refuses.
    expect(UpdateAdminNannySchema.safeParse({ latitude: 30.0444, longitude: 31.2357 }).success).toBe(false);
    expect(UpdateAdminNannySchema.safeParse({ location: 'Maadi' }).success).toBe(false);
    const parsed = UpdateAdminNannySchema.safeParse({ bio: 'x', latitude: 30.0444, longitude: 31.2357 });
    expect(parsed.success && 'latitude' in parsed.data).toBe(false);
  });

  it('refuses a malformed date of birth', () => {
    expect(UpdateAdminNannySchema.safeParse({ dateOfBirth: '15/06/1995' }).success).toBe(false);
  });
});
