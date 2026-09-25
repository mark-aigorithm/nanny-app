import { describe, expect, it } from 'vitest';

import {
  LegalDocumentKeySchema,
  LegalDocumentSchema,
  UpdateLegalDocumentSchema,
} from '../legal';

describe('LegalDocumentKeySchema', () => {
  it('knows the terms and the privacy policy, and nothing else', () => {
    expect(LegalDocumentKeySchema.options).toEqual(['terms', 'privacy']);
    expect(LegalDocumentKeySchema.safeParse('cookies').success).toBe(false);
  });
});

describe('UpdateLegalDocumentSchema', () => {
  it('trims the title and the body', () => {
    expect(UpdateLegalDocumentSchema.parse({ title: ' Terms ', body: ' Be kind. ' })).toEqual({
      title: 'Terms',
      body: 'Be kind.',
    });
  });

  it('refuses an empty title or body, even one of only spaces', () => {
    expect(UpdateLegalDocumentSchema.safeParse({ title: '  ', body: 'x' }).success).toBe(false);
    expect(UpdateLegalDocumentSchema.safeParse({ title: 'Terms', body: '   ' }).success).toBe(false);
  });

  it('caps the lengths', () => {
    expect(UpdateLegalDocumentSchema.safeParse({ title: 'x'.repeat(121), body: 'x' }).success).toBe(false);
    expect(UpdateLegalDocumentSchema.safeParse({ title: 'x', body: 'x'.repeat(50_001) }).success).toBe(false);
    expect(UpdateLegalDocumentSchema.safeParse({ title: 'x', body: 'x'.repeat(50_000) }).success).toBe(true);
  });
});

describe('LegalDocumentSchema', () => {
  it('allows a null updatedAt — the placeholder, never saved', () => {
    expect(
      LegalDocumentSchema.safeParse({ key: 'terms', title: 'Terms', body: 'Soon.', updatedAt: null }).success,
    ).toBe(true);
  });
});
