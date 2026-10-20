import { describe, expect, it } from 'vitest';

import {
  BROADCAST_STALE_MS,
  NOTIFICATION_IMAGE_HEIGHT,
  NOTIFICATION_IMAGE_WIDTH,
  NotificationAudienceSchema,
  NotificationBroadcastSchema,
  NotificationTemplateInputSchema,
} from '../notification-template';

const BASE = {
  name: ' Win-back 30d ',
  title: 'We miss you',
  body: 'Book this week and save.',
  channel: 'BOTH',
  audience: { type: 'GROUPS', groupIds: [3] },
} as const;

describe('NotificationTemplateInputSchema', () => {
  it('trims text and defaults the image and link to null', () => {
    expect(NotificationTemplateInputSchema.parse(BASE)).toEqual({
      name: 'Win-back 30d',
      title: 'We miss you',
      body: 'Book this week and save.',
      imageUrl: null,
      channel: 'BOTH',
      targetType: null,
      packageId: null,
      promoCodeId: null,
      audience: { type: 'GROUPS', groupIds: [3] },
    });
  });

  it('caps the title at 65 and the body at 240 characters', () => {
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, title: 'x'.repeat(65) }).success).toBe(true);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, title: 'x'.repeat(66) }).success).toBe(false);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, body: 'x'.repeat(240) }).success).toBe(true);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, body: 'x'.repeat(241) }).success).toBe(false);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, name: 'x'.repeat(81) }).success).toBe(false);
  });

  it('accepts only IN_APP, PUSH or BOTH', () => {
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, channel: 'PUSH' }).success).toBe(true);
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, channel: 'SMS' }).success).toBe(false);
  });

  it('needs exactly the id that matches the link type', () => {
    const issue = (input: object) => {
      const res = NotificationTemplateInputSchema.safeParse({ ...BASE, ...input });
      return res.success ? null : res.error.issues[0];
    };
    expect(issue({ targetType: 'PACKAGE', packageId: 4 })).toBeNull();
    expect(issue({ targetType: 'PROMO_CODE', promoCodeId: 9 })).toBeNull();
    expect(issue({ targetType: 'PACKAGE', promoCodeId: 9 })).toMatchObject({
      message: 'Pick exactly one package or promo code for this link.',
      path: ['targetType'],
    });
    expect(issue({ targetType: 'PROMO_CODE', packageId: 4, promoCodeId: 9 })).not.toBeNull();
    expect(issue({ packageId: 4 })).not.toBeNull();
  });

  it('refuses an image that is not a URL', () => {
    expect(NotificationTemplateInputSchema.safeParse({ ...BASE, imageUrl: 'not a url' }).success).toBe(false);
  });
});

describe('NotificationAudienceSchema', () => {
  it('dedupes ids', () => {
    expect(NotificationAudienceSchema.parse({ type: 'GROUPS', groupIds: [2, 2, 5] })).toEqual({ type: 'GROUPS', groupIds: [2, 5] });
    expect(NotificationAudienceSchema.parse({ type: 'MOTHERS', motherIds: [7, 7] })).toEqual({ type: 'MOTHERS', motherIds: [7] });
  });

  it('takes 1–20 groups and 1–5000 mothers', () => {
    expect(NotificationAudienceSchema.safeParse({ type: 'GROUPS', groupIds: [] }).success).toBe(false);
    expect(NotificationAudienceSchema.safeParse({ type: 'GROUPS', groupIds: Array.from({ length: 21 }, (_, i) => i + 1) }).success).toBe(false);
    expect(NotificationAudienceSchema.safeParse({ type: 'MOTHERS', motherIds: [] }).success).toBe(false);
    expect(NotificationAudienceSchema.safeParse({ type: 'MOTHERS', motherIds: Array.from({ length: 5000 }, (_, i) => i + 1) }).success).toBe(true);
    expect(NotificationAudienceSchema.safeParse({ type: 'MOTHERS', motherIds: Array.from({ length: 5001 }, (_, i) => i + 1) }).success).toBe(false);
  });

  it('refuses an unknown audience type', () => {
    expect(NotificationAudienceSchema.safeParse({ type: 'ALL' }).success).toBe(false);
  });
});

describe('constants and broadcast DTO', () => {
  it('fixes the image at 1024×512 and staleness at five minutes', () => {
    expect([NOTIFICATION_IMAGE_WIDTH, NOTIFICATION_IMAGE_HEIGHT]).toEqual([1024, 512]);
    expect(BROADCAST_STALE_MS).toBe(300_000);
  });

  it('parses a broadcast row', () => {
    const row = {
      id: 1, templateId: 2, status: 'PARTIAL', title: 't', channel: 'PUSH',
      targeted: 10, inAppCreated: 0, pushSent: 8, pushFailed: 1, noDevice: 1,
      skippedGroupIds: [4], error: null, publishedBy: { id: 3, name: 'Admin' },
      createdAt: '2026-10-20T10:00:00.000Z', completedAt: '2026-10-20T10:00:05.000Z',
    };
    expect(NotificationBroadcastSchema.parse(row)).toEqual(row);
  });
});
