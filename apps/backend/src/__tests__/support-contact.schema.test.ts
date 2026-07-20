import {
  SupportContactSchema,
  UpdateSupportContactSchema,
  normalizePhone,
  whatsappLink,
} from '@nanny-app/shared';

describe('normalizePhone', () => {
  it('strips spaces and dashes but keeps a leading +', () => {
    expect(normalizePhone('+20 100 123-4567')).toBe('+201001234567');
  });

  it('leaves an already-normalized number alone', () => {
    expect(normalizePhone('+201001234567')).toBe('+201001234567');
  });

  it('trims surrounding whitespace and returns empty for a blank value', () => {
    expect(normalizePhone('   ')).toBe('');
  });

  it('normalizes a leading 00 international-access prefix to +', () => {
    expect(normalizePhone('0020 100 123-4567')).toBe('+201001234567');
  });
});

describe('whatsappLink', () => {
  it('builds a wa.me URL from digits only, dropping the + and separators', () => {
    expect(whatsappLink('+20 100 123-4567')).toBe('https://wa.me/201001234567');
  });
});

describe('SupportContactSchema', () => {
  it('accepts a fully configured contact', () => {
    const parsed = SupportContactSchema.safeParse({
      whatsappNumber: '+201001234567',
      phoneNumber: '+20 100 123-4567',
      email: 'support@nannynow.com',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts empty strings so an admin can retire a channel', () => {
    const parsed = SupportContactSchema.safeParse({
      whatsappNumber: '',
      phoneNumber: '',
      email: '',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a number with too few digits', () => {
    expect(SupportContactSchema.safeParse({
      whatsappNumber: '12345',
      phoneNumber: '',
      email: '',
    }).success).toBe(false);
  });

  it('rejects a number with letters in it', () => {
    expect(SupportContactSchema.safeParse({
      whatsappNumber: '+2010012345ab',
      phoneNumber: '',
      email: '',
    }).success).toBe(false);
  });

  it('rejects a local-format number missing the country code', () => {
    expect(SupportContactSchema.safeParse({
      whatsappNumber: '0100 123 4567',
      phoneNumber: '',
      email: '',
    }).success).toBe(false);
  });

  it('accepts a number with a 00 international-access prefix, normalized to +', () => {
    const parsed = SupportContactSchema.safeParse({
      whatsappNumber: '0020 100 123-4567',
      phoneNumber: '',
      email: '',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(normalizePhone(parsed.data.whatsappNumber)).toBe('+201001234567');
    }
  });

  it('accepts a number already in canonical + form', () => {
    expect(SupportContactSchema.safeParse({
      whatsappNumber: '+201001234567',
      phoneNumber: '',
      email: '',
    }).success).toBe(true);
  });

  it('rejects a malformed email', () => {
    expect(SupportContactSchema.safeParse({
      whatsappNumber: '',
      phoneNumber: '',
      email: 'not-an-email',
    }).success).toBe(false);
  });
});

describe('UpdateSupportContactSchema', () => {
  it('accepts a partial payload touching one channel', () => {
    const parsed = UpdateSupportContactSchema.safeParse({ phoneNumber: '+201001234567' });
    expect(parsed.success).toBe(true);
  });

  it('still validates the fields that are present', () => {
    expect(UpdateSupportContactSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});
