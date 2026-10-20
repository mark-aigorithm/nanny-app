import { describe, expect, it } from 'vitest';

import { NotificationLinkSchema, NotificationResponseSchema, NotificationTypeSchema } from '../notifications';

const ROW = {
  id: 1,
  type: 'booking_confirmed',
  title: 'Booking confirmed',
  body: 'See you soon',
  isRead: false,
  referenceId: 42,
  referenceType: 'booking',
  createdAt: '2026-10-20T10:00:00.000Z',
};

describe('announcement notifications', () => {
  it('is a notification type', () => {
    expect(NotificationTypeSchema.parse('announcement')).toBe('announcement');
  });

  it('links to a package or a promo code, nothing else', () => {
    expect(NotificationLinkSchema.parse({ type: 'package', packageId: 4 })).toEqual({ type: 'package', packageId: 4 });
    expect(NotificationLinkSchema.parse({ type: 'promo_code', code: 'SAVE20' })).toEqual({ type: 'promo_code', code: 'SAVE20' });
    expect(NotificationLinkSchema.safeParse({ type: 'promo_code', code: '' }).success).toBe(false);
    expect(NotificationLinkSchema.safeParse({ type: 'url', href: 'https://x' }).success).toBe(false);
  });

  it('defaults imageUrl and link to null for rows that carry neither', () => {
    expect(NotificationResponseSchema.parse(ROW)).toMatchObject({ imageUrl: null, link: null });
  });

  it('keeps an announcement image and link', () => {
    const parsed = NotificationResponseSchema.parse({
      ...ROW,
      type: 'announcement',
      referenceId: null,
      referenceType: null,
      imageUrl: 'https://cdn.example.com/a.jpg',
      link: { type: 'promo_code', code: 'SAVE20' },
    });
    expect(parsed.link).toEqual({ type: 'promo_code', code: 'SAVE20' });
    expect(parsed.imageUrl).toBe('https://cdn.example.com/a.jpg');
  });
});
