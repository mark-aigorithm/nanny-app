import { describe, expect, it } from 'vitest';

import { CreateOfficialPostSchema, UpdateOfficialPostSchema } from '../admin';

describe('CreateOfficialPostSchema', () => {
  it('accepts an event with wall-clock time and no photos, defaulting tags', () => {
    const parsed = CreateOfficialPostSchema.parse({
      type: 'event',
      title: 'Mommy & me picnic',
      eventStartsAt: '2026-10-10T11:00:00',
      location: 'Merryland Park',
    });
    expect(parsed).toEqual({
      type: 'event',
      title: 'Mommy & me picnic',
      eventStartsAt: '2026-10-10T11:00:00',
      location: 'Merryland Park',
      imageUrls: [],
      tags: [],
    });
  });

  it('refuses an event time carrying an offset', () => {
    const result = CreateOfficialPostSchema.safeParse({
      type: 'event',
      title: 'Picnic',
      eventStartsAt: '2026-10-10T11:00:00Z',
      location: 'Park',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a Q&A with only a body', () => {
    const parsed = CreateOfficialPostSchema.parse({ type: 'qa', body: 'Summer hours start Sunday.' });
    expect(parsed).toMatchObject({ type: 'qa', body: 'Summer hours start Sunday.', imageUrls: [] });
  });

  it('refuses a Q&A with an empty body', () => {
    expect(CreateOfficialPostSchema.safeParse({ type: 'qa', body: '   ' }).success).toBe(false);
  });

  it('keeps the listing rules: a photo and a contact phone are required', () => {
    const base = { type: 'marketplace', title: 'Car seat', price: 3500, contactPhone: '+201001234567' };
    expect(CreateOfficialPostSchema.safeParse({ ...base, imageUrls: [] }).success).toBe(false);
    expect(
      CreateOfficialPostSchema.safeParse({ ...base, imageUrls: ['https://cdn.example.com/a.jpg'] })
        .success,
    ).toBe(true);
  });
});

describe('UpdateOfficialPostSchema', () => {
  it('lets an event clear its price and attendee cap', () => {
    expect(UpdateOfficialPostSchema.parse({ price: null, maxAttendees: null })).toEqual({
      price: null,
      maxAttendees: null,
    });
  });

  it('checks the event time is wall-clock', () => {
    expect(UpdateOfficialPostSchema.safeParse({ eventStartsAt: '2026-10-10T11:00' }).success).toBe(
      false,
    );
  });
});
