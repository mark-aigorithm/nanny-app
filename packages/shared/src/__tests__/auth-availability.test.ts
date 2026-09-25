import { describe, expect, it } from 'vitest';

import {
  AvailabilityResponseSchema,
  CheckAvailabilitySchema,
  PhoneAccountCheckSchema,
  PhoneE164Schema,
} from '../auth';

describe('CheckAvailabilitySchema', () => {
  it('normalises the email the same way every other auth body does', () => {
    const parsed = CheckAvailabilitySchema.parse({
      email: '  Sarah@Example.COM ',
      phone: ' +201001234567 ',
    });
    expect(parsed).toEqual({ email: 'sarah@example.com', phone: '+201001234567' });
  });

  it('refuses a phone that is not E.164', () => {
    const result = CheckAvailabilitySchema.safeParse({
      email: 'sarah@example.com',
      phone: '01001234567',
    });
    expect(result.success).toBe(false);
  });

  it('uses the one E.164 rule the register body uses too', () => {
    // The availability check answers "what will /auth/register do with this
    // value?", so both bodies must run the same phone schema instance.
    expect(CheckAvailabilitySchema.shape.phone).toBe(PhoneE164Schema);
    expect(PhoneE164Schema.safeParse('+201001234567').success).toBe(true);
    expect(PhoneE164Schema.safeParse('0100').success).toBe(false);
  });
});

describe('AvailabilityResponseSchema', () => {
  it('is two booleans', () => {
    expect(AvailabilityResponseSchema.parse({ emailTaken: true, phoneTaken: false })).toEqual({
      emailTaken: true,
      phoneTaken: false,
    });
    expect(AvailabilityResponseSchema.safeParse({ emailTaken: 'yes' }).success).toBe(false);
  });
});

describe('PhoneAccountCheckSchema', () => {
  it('takes a trimmed E.164 phone', () => {
    expect(PhoneAccountCheckSchema.parse({ phone: ' +201001234567 ' })).toEqual({ phone: '+201001234567' });
  });

  it('refuses a phone that is not E.164', () => {
    expect(PhoneAccountCheckSchema.safeParse({ phone: '01001234567' }).success).toBe(false);
  });
});
