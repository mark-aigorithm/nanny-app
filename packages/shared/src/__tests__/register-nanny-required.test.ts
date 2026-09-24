/**
 * Registration is the only time a nanny enters her profile, so the wizard
 * must not let her finish with a hole an admin would have to fill. These pin
 * the server-side half of that rule; the app enforces the same three on its
 * own screens.
 */
import { describe, expect, it } from 'vitest';

import { RegisterRequestSchema } from '../auth';

const NANNY = {
  firstName: 'Amira',
  lastName: 'Hassan',
  email: 'amira@example.com',
  emailVerificationToken: 'tok',
  phone: '+201000000000',
  dateOfBirth: '1995-06-15',
  role: 'NANNY',
  termsAcceptedVersion: 'v1.0',
  address: '2 Test Street, Cairo',
  latitude: 30.0444,
  longitude: 31.2357,
  idDocumentType: 'PASSPORT',
  idDocumentFrontUrl: 'https://s/o/front.jpg',
  avatarUrl: 'https://s/o/avatar.jpg',
  bio: 'Loves kids',
  yearsOfExperience: 5,
  ageRanges: ['0-1'],
  availabilityType: 'FULL_TIME',
  schedule: { '1': { available: true, startTime: '08:00', endTime: '18:00' } },
};

function firstMessage(body: Record<string, unknown>): string | null {
  const parsed = RegisterRequestSchema.safeParse(body);
  return parsed.success ? null : parsed.error.issues[0]?.message ?? 'unknown';
}

describe('RegisterRequestSchema — what a nanny must provide', () => {
  it('accepts a complete nanny', () => {
    expect(firstMessage(NANNY)).toBeNull();
  });

  it('needs a street address', () => {
    expect(firstMessage({ ...NANNY, address: '' })).toBe('Please enter your street address.');
    expect(firstMessage({ ...NANNY, address: undefined })).toBe('Please enter your street address.');
  });

  it('needs at least one age range', () => {
    expect(firstMessage({ ...NANNY, ageRanges: [] })).toBe(
      'Please pick at least one age range you care for.',
    );
  });

  it('needs at least one working day', () => {
    expect(firstMessage({ ...NANNY, schedule: undefined })).toBe(
      'Please mark at least one day you can work.',
    );
    expect(
      firstMessage({
        ...NANNY,
        schedule: { '1': { available: false, startTime: '08:00', endTime: '18:00' } },
      }),
    ).toBe('Please mark at least one day you can work.');
  });

  it('asks none of the nanny profile of a mother', () => {
    const { idDocumentType, idDocumentFrontUrl, bio, yearsOfExperience, ageRanges, availabilityType, schedule, ...mother } = NANNY;
    expect(firstMessage({ ...mother, role: 'MOTHER' })).toBeNull();
  });
});
