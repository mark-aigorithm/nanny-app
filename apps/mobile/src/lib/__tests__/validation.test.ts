import { fromE164, toE164 } from '@mobile/lib/validation';

describe('fromE164', () => {
  it('reverses toE164', () => {
    expect(fromE164('+20', toE164('+20', '1234567891'))).toBe('1234567891');
  });
  it('is empty for another country code or nothing', () => {
    expect(fromE164('+20', '+441234567890')).toBe('');
    expect(fromE164('+20', null)).toBe('');
  });
});
