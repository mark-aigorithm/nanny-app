import {
  NANNY_VISIBILITY_REQUIRED_FIELDS,
  getMissingNannyProfileFields,
  isNannyProfileComplete,
} from '@nanny-app/shared';

type ProfileInput = Parameters<typeof getMissingNannyProfileFields>[0];

const complete: ProfileInput = {
  bio: 'Loving, experienced carer.',
  location: 'Cairo',
  yearsOfExperience: 5,
  hourlyRate: 120,
};

describe('getMissingNannyProfileFields', () => {
  it('returns no missing fields when all four are present', () => {
    expect(getMissingNannyProfileFields(complete)).toEqual([]);
    expect(isNannyProfileComplete(complete)).toBe(true);
  });

  it('surfaces bio with the correct label when missing (null)', () => {
    const missing = getMissingNannyProfileFields({ ...complete, bio: null });
    expect(missing).toEqual([{ key: 'bio', label: 'Bio' }]);
    expect(isNannyProfileComplete({ ...complete, bio: null })).toBe(false);
  });

  it('surfaces location with the correct label when missing (null)', () => {
    const missing = getMissingNannyProfileFields({ ...complete, location: null });
    expect(missing).toEqual([{ key: 'location', label: 'Location' }]);
  });

  it('surfaces yearsOfExperience with the correct label when missing (null)', () => {
    const missing = getMissingNannyProfileFields({ ...complete, yearsOfExperience: null });
    expect(missing).toEqual([{ key: 'yearsOfExperience', label: 'Years of experience' }]);
  });

  it('surfaces hourlyRate with the correct label when missing (null)', () => {
    const missing = getMissingNannyProfileFields({ ...complete, hourlyRate: null });
    expect(missing).toEqual([{ key: 'hourlyRate', label: 'Hourly rate' }]);
  });

  it('treats an empty-string bio as missing', () => {
    const missing = getMissingNannyProfileFields({ ...complete, bio: '' });
    expect(missing).toEqual([{ key: 'bio', label: 'Bio' }]);
  });

  it('treats an empty-string location as missing', () => {
    const missing = getMissingNannyProfileFields({ ...complete, location: '' });
    expect(missing).toEqual([{ key: 'location', label: 'Location' }]);
  });

  it('treats yearsOfExperience of 0 as PRESENT (not missing)', () => {
    const missing = getMissingNannyProfileFields({ ...complete, yearsOfExperience: 0 });
    expect(missing).toEqual([]);
    expect(isNannyProfileComplete({ ...complete, yearsOfExperience: 0 })).toBe(true);
  });

  it('treats hourlyRate of 0 as PRESENT (not missing)', () => {
    const missing = getMissingNannyProfileFields({ ...complete, hourlyRate: 0 });
    expect(missing).toEqual([]);
    expect(isNannyProfileComplete({ ...complete, hourlyRate: 0 })).toBe(true);
  });

  it('returns every field, in constant order, when nothing is set', () => {
    const missing = getMissingNannyProfileFields({
      bio: null,
      location: null,
      yearsOfExperience: null,
      hourlyRate: null,
    });
    expect(missing).toEqual([...NANNY_VISIBILITY_REQUIRED_FIELDS]);
    expect(missing.map((f) => f.key)).toEqual([
      'bio',
      'location',
      'yearsOfExperience',
      'hourlyRate',
    ]);
  });

  it('preserves constant order when a middle field is present', () => {
    const missing = getMissingNannyProfileFields({
      bio: null,
      location: 'Cairo',
      yearsOfExperience: null,
      hourlyRate: null,
    });
    expect(missing.map((f) => f.key)).toEqual(['bio', 'yearsOfExperience', 'hourlyRate']);
  });
});
