import { dobToIso, fromE164, toE164, validateDob } from '@mobile/lib/validation';

describe('fromE164', () => {
  it('reverses toE164', () => {
    expect(fromE164('+20', toE164('+20', '1234567891'))).toBe('1234567891');
  });
  it('is empty for another country code or nothing', () => {
    expect(fromE164('+20', '+441234567890')).toBe('');
    expect(fromE164('+20', null)).toBe('');
  });
});

describe('dobToIso', () => {
  it('turns the picker’s mm/dd/yyyy into YYYY-MM-DD', () => {
    expect(dobToIso('05/10/1990')).toBe('1990-05-10');
  });

  it('returns an empty string for anything else', () => {
    expect(dobToIso('1990-05-10')).toBe('');
    expect(dobToIso('')).toBe('');
  });
});

describe('validateDob', () => {
  const today = new Date(2026, 8, 24);

  it('asks for a date when none was picked', () => {
    expect(validateDob('', today)).toBe('Please select your date of birth.');
  });

  it('accepts someone who turns 18 today', () => {
    expect(validateDob('09/24/2008', today)).toBeNull();
  });

  it('refuses someone who turns 18 tomorrow, in the API’s own words', () => {
    expect(validateDob('09/25/2008', today)).toBe('You must be at least 18 to use NannyNow.');
  });
});
