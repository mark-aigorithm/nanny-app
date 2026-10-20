import { NotificationType } from '@prisma/client';
import { NotificationTypeSchema } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({ prisma: {} }));
jest.mock('@backend/lib/firebase', () => ({ firebaseMessaging: {} }));

import { toApiNotificationType, toNotificationLink } from '@backend/services/notification.service';

describe('toApiNotificationType', () => {
  it('maps SURVEY to survey', () => {
    expect(toApiNotificationType(NotificationType.SURVEY)).toBe('survey');
  });

  it('maps ANNOUNCEMENT to announcement', () => {
    expect(toApiNotificationType(NotificationType.ANNOUNCEMENT)).toBe('announcement');
  });

  // The switch falls back to marketplace_message, so a new enum value without a
  // case would silently show as a marketplace message. Every value must map to
  // its own lower-cased name.
  //
  // These three predate this test and have no case and no shared schema entry
  // (they fall back to marketplace_message today); out of scope for surveys.
  const KNOWN_UNMAPPED: string[] = ['BOOKING_EDITED', 'BOOKING_REFUNDED', 'BOOKING_BALANCE_DUE'];
  it.each(Object.values(NotificationType).filter((t) => !KNOWN_UNMAPPED.includes(t)))(
    'maps %s to its own API name',
    (type) => {
      const api = toApiNotificationType(type);
      expect(NotificationTypeSchema.options).toContain(api);
      expect(api).toBe(type.toLowerCase());
    },
  );
});

describe('toNotificationLink', () => {
  const none = { imageUrl: null, targetType: null, packageId: null, promoCodeText: null };

  it('links a package broadcast to its package', () => {
    expect(toNotificationLink({ ...none, targetType: 'PACKAGE', packageId: 4 })).toEqual({
      type: 'package',
      packageId: 4,
    });
  });

  it('links a promo-code broadcast by the code text it snapshotted', () => {
    expect(toNotificationLink({ ...none, targetType: 'PROMO_CODE', promoCodeText: 'SAVE20' })).toEqual({
      type: 'promo_code',
      code: 'SAVE20',
    });
  });

  it('has no link without a broadcast, without a target, or with a half-filled one', () => {
    expect(toNotificationLink(null)).toBeNull();
    expect(toNotificationLink(undefined)).toBeNull();
    expect(toNotificationLink(none)).toBeNull();
    expect(toNotificationLink({ ...none, targetType: 'PACKAGE' })).toBeNull();
    expect(toNotificationLink({ ...none, targetType: 'PROMO_CODE' })).toBeNull();
  });
});
