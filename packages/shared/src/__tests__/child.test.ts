import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BookingChildSchema,
  ChildInputSchema,
  bookingChildLabels,
  formatChildNames,
  childAgeOn,
  formatAllergySummary,
  formatChildAge,
  hasAllergyWarning,
  toBookingChild,
  type Child,
} from '../child';
import { CreateBookingSchema } from '../booking';
import { CreateCareLogSchema } from '../care-log';

describe('childAgeOn', () => {
  it('counts whole years, with months while under two', () => {
    expect(childAgeOn('2024-11', '2026-07')).toEqual({ ageYears: 1, ageMonths: 20 });
    expect(childAgeOn('2026-07', '2026-07')).toEqual({ ageYears: 0, ageMonths: 0 });
    expect(childAgeOn('2021-03', '2026-07')).toEqual({ ageYears: 5, ageMonths: null });
  });

  it('turns a year older in the birth month, not before', () => {
    expect(childAgeOn('2020-08', '2026-07').ageYears).toBe(5);
    expect(childAgeOn('2020-08', '2026-08').ageYears).toBe(6);
  });

  it('never goes negative or past the ceiling', () => {
    expect(childAgeOn('2027-01', '2026-07')).toEqual({ ageYears: 0, ageMonths: 0 });
    expect(childAgeOn('2000-01', '2026-07').ageYears).toBe(17);
  });
});

describe('formatChildAge', () => {
  it('shows months for babies when known, years otherwise', () => {
    expect(formatChildAge(0, 0)).toBe('<1 mo');
    expect(formatChildAge(0, 1)).toBe('1 mo');
    expect(formatChildAge(1, 20)).toBe('20 mos');
    expect(formatChildAge(5, null)).toBe('5 yrs');
    expect(formatChildAge(0)).toBe('<1 yr');
    expect(formatChildAge(1)).toBe('1 yr');
  });
});

describe('ChildInputSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const valid = { name: 'Lina', birthMonth: '2023-04' };

  it('requires a name and a birth month', () => {
    expect(ChildInputSchema.safeParse(valid).success).toBe(true);
    expect(ChildInputSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false);
    expect(ChildInputSchema.safeParse({ name: 'Lina' }).success).toBe(false);
    expect(ChildInputSchema.safeParse({ ...valid, birthMonth: '2023-13' }).success).toBe(false);
  });

  it('rejects a birth month in the future or over 17 years back', () => {
    expect(ChildInputSchema.safeParse({ ...valid, birthMonth: '2026-08' }).success).toBe(false);
    expect(ChildInputSchema.safeParse({ ...valid, birthMonth: '2026-07' }).success).toBe(true);
    expect(ChildInputSchema.safeParse({ ...valid, birthMonth: '2008-08' }).success).toBe(true);
    expect(ChildInputSchema.safeParse({ ...valid, birthMonth: '2008-07' }).success).toBe(false);
  });

  it('defaults the lists and dedupes chips case-insensitively', () => {
    const parsed = ChildInputSchema.parse({
      ...valid,
      allergies: ['Dairy', ' dairy ', 'Cats make her wheeze'],
    });
    expect(parsed.allergies).toEqual(['Dairy', 'Cats make her wheeze']);
    expect(parsed.interests).toEqual([]);
    expect(parsed.notes).toBeNull();
  });
});

describe('toBookingChild', () => {
  const saved: Child = {
    id: 1,
    name: 'Lina',
    birthMonth: '2024-11',
    ageYears: 1,
    ageMonths: 20,
    allergies: ['Peanuts', 'Sesame'],
    conditions: ['Asthma'],
    healthNotes: 'Inhaler in the blue bag',
    diet: ['No sugar'],
    interests: ['Drawing'],
    languages: ['Arabic'],
    notes: null,
    createdAt: '2026-07-01T00:00:00.000Z',
  };

  it('ages the child on the booking month and joins allergies for older builds', () => {
    const snap = toBookingChild(saved, '2026-12');
    expect(snap.ageYears).toBe(2);
    expect(snap.ageMonths).toBeNull();
    expect(snap.allergies).toBe('Peanuts, Sesame');
    expect(snap.conditions).toEqual(['Asthma']);
  });

  it('falls back to the stored age on a child with no birth month', () => {
    const snap = toBookingChild({ ...saved, birthMonth: null, ageYears: 4 }, '2026-12');
    expect(snap.ageYears).toBe(4);
  });
});

describe('BookingChildSchema', () => {
  it('still parses a snapshot from before the chip lists', () => {
    expect(BookingChildSchema.parse({ name: null, ageYears: 3, allergies: null })).toEqual({
      name: null,
      ageYears: 3,
      ageMonths: null,
      allergies: null,
      conditions: [],
      healthNotes: null,
      diet: [],
      interests: [],
      languages: [],
      notes: null,
    });
  });
});

describe('health warnings', () => {
  it('warn on conditions and health notes, not only allergies', () => {
    const asthma = BookingChildSchema.parse({ name: 'Omar', ageYears: 4, conditions: ['Asthma'] });
    const calm = BookingChildSchema.parse({ name: 'Mai', ageYears: 6, interests: ['Lego'] });
    expect(hasAllergyWarning([calm])).toBe(false);
    expect(hasAllergyWarning([calm, asthma])).toBe(true);
    expect(formatAllergySummary([asthma])).toBe('Omar: Asthma');
  });
});

describe('CreateBookingSchema children', () => {
  const window = { startTime: '2026-10-01T09:00:00', endTime: '2026-10-01T13:00:00' };

  it('takes saved child ids, or typed children from older builds', () => {
    expect(CreateBookingSchema.safeParse({ ...window, childIds: [3, 4] }).success).toBe(true);
    expect(CreateBookingSchema.safeParse({ ...window, children: [{ ageYears: 3 }] }).success).toBe(
      true,
    );
  });

  it('needs one or the other, and no child twice', () => {
    expect(CreateBookingSchema.safeParse(window).success).toBe(false);
    expect(CreateBookingSchema.safeParse({ ...window, childIds: [] }).success).toBe(false);
    expect(CreateBookingSchema.safeParse({ ...window, childIds: [3, 3] }).success).toBe(false);
  });
});

describe('care log child labels', () => {
  it('uses the name, or a numbered label with the age for an unnamed child', () => {
    const named = BookingChildSchema.parse({ name: ' Lina ', ageYears: 3 });
    const unnamed = BookingChildSchema.parse({ name: null, ageYears: 1, ageMonths: 8 });
    expect(bookingChildLabels([named, unnamed])).toEqual(['Lina', 'Child 2 (8 mos)']);
  });

  it('joins names the way a sentence would', () => {
    expect(formatChildNames([])).toBe('');
    expect(formatChildNames(['Lina'])).toBe('Lina');
    expect(formatChildNames(['Lina', 'Omar'])).toBe('Lina & Omar');
    expect(formatChildNames(['Lina', 'Omar', 'Sami'])).toBe('Lina, Omar & Sami');
  });

  it('accepts an entry without childNames, as older builds send it', () => {
    expect(CreateCareLogSchema.parse({ type: 'MEAL' }).childNames).toEqual([]);
    expect(CreateCareLogSchema.parse({ type: 'NAP', childNames: [' Lina '] }).childNames).toEqual([
      'Lina',
    ]);
  });
});
