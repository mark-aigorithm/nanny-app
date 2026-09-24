/**
 * Rules every sign-up is held to, whichever role and whichever door. The app
 * mirrors each one on screen; these pin the server-side half.
 */
import { describe, expect, it } from 'vitest';

import {
  CURRENT_TERMS_VERSION,
  MIN_REGISTRATION_AGE,
  RegisterRequestSchema,
  UpdateProfileRequestSchema,
  ageOn,
  dateOfBirthError,
  latestAllowedDob,
} from '../auth';
import { AGE_RANGES, AgeRangeSchema } from '../nanny';

// 24 September 2026, local time — the helpers take "today" so the tests don't
// age with the calendar.
const TODAY = new Date(2026, 8, 24);

const UNDERAGE = 'You must be at least 18 to use NannyNow.';
const INVALID = 'Please enter a valid date of birth.';

/** An ISO date `years` before now — for the schema, which always uses the real today. */
function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const MOTHER = {
  firstName: 'Mona',
  lastName: 'Adel',
  email: 'mona@example.com',
  emailVerificationToken: 'tok',
  phone: '+201000000001',
  dateOfBirth: '1990-05-10',
  role: 'MOTHER',
  termsAcceptedVersion: CURRENT_TERMS_VERSION,
  address: '1 Test Street, Cairo',
  latitude: 30.0444,
  longitude: 31.2357,
  avatarUrl: 'https://s/o/avatar.jpg',
};

function firstMessage(body: Record<string, unknown>): string | null {
  const parsed = RegisterRequestSchema.safeParse(body);
  return parsed.success ? null : parsed.error.issues[0]?.message ?? 'unknown';
}

describe('ageOn', () => {
  it('counts whole years, turning over on the birthday itself', () => {
    expect(ageOn('2008-09-24', TODAY)).toBe(18);
    expect(ageOn('2008-09-25', TODAY)).toBe(17);
  });

  it('refuses anything that is not a real calendar date', () => {
    expect(ageOn('2001-02-30', TODAY)).toBeNull();
    expect(ageOn('24/09/2001', TODAY)).toBeNull();
    expect(ageOn('', TODAY)).toBeNull();
  });
});

describe('latestAllowedDob', () => {
  it('is exactly MIN_REGISTRATION_AGE years before today', () => {
    const d = latestAllowedDob(TODAY);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026 - MIN_REGISTRATION_AGE, 8, 24]);
  });

  it('falls back to 28 February when today is a leap day', () => {
    const leapDay = new Date(2024, 1, 29);
    const d = latestAllowedDob(leapDay);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2006, 1, 28]);
    expect(ageOn('2006-02-28', leapDay)).toBe(18);
  });
});

describe('dateOfBirthError', () => {
  it('accepts 18 through 100', () => {
    expect(dateOfBirthError('2008-09-24', TODAY)).toBeNull();
    expect(dateOfBirthError('1926-09-24', TODAY)).toBeNull();
  });

  it('refuses someone under 18 with the age message', () => {
    expect(dateOfBirthError('2008-09-25', TODAY)).toBe(UNDERAGE);
  });

  it('refuses a future date, over 100, or a date that does not exist as invalid', () => {
    expect(dateOfBirthError('2027-01-01', TODAY)).toBe(INVALID);
    expect(dateOfBirthError('1925-09-23', TODAY)).toBe(INVALID);
    expect(dateOfBirthError('2001-02-30', TODAY)).toBe(INVALID);
  });
});

describe('RegisterRequestSchema — every account', () => {
  it('accepts a complete mother', () => {
    expect(firstMessage(MOTHER)).toBeNull();
  });

  it('needs a photo from a mother too', () => {
    expect(firstMessage({ ...MOTHER, avatarUrl: undefined })).toBe('Please add a profile photo.');
  });

  it('needs a street address from a mother too', () => {
    expect(firstMessage({ ...MOTHER, address: '' })).toBe('Please enter your street address.');
    expect(firstMessage({ ...MOTHER, address: '   ' })).toBe('Please enter your street address.');
    expect(firstMessage({ ...MOTHER, address: undefined })).toBe('Please enter your street address.');
  });

  it('holds the date of birth to 18 and over, on a real date', () => {
    expect(firstMessage({ ...MOTHER, dateOfBirth: isoYearsAgo(17) })).toBe(UNDERAGE);
    expect(firstMessage({ ...MOTHER, dateOfBirth: '2001-02-30' })).toBe(INVALID);
  });

  it('accepts only the terms version the app shows today', () => {
    expect(CURRENT_TERMS_VERSION).toBe('v1.0');
    expect(firstMessage({ ...MOTHER, termsAcceptedVersion: '1.0' })).toBe(
      'Please accept the latest terms to continue.',
    );
  });
});

describe('AgeRangeSchema', () => {
  it('is exactly the four bands the wizard and the console offer', () => {
    expect(AGE_RANGES).toEqual(['0-1', '1-3', '3-5', '5+']);
    expect(AgeRangeSchema.safeParse('2-5').success).toBe(false);
  });
});

describe('UpdateProfileRequestSchema', () => {
  it('drops a phone number instead of saving it — a number is changed only by verifying it', () => {
    expect(UpdateProfileRequestSchema.parse({ firstName: 'Mona', phone: '+201000000001' })).toEqual({
      firstName: 'Mona',
    });
  });
});
