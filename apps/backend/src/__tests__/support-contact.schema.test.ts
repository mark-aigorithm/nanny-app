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
