import { NotificationType } from '@prisma/client';
import { NotificationTypeSchema } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({ prisma: {} }));
jest.mock('@backend/lib/firebase', () => ({ firebaseMessaging: {} }));

import { toApiNotificationType } from '@backend/services/notification.service';

describe('toApiNotificationType', () => {
  it('maps SURVEY to survey', () => {
    expect(toApiNotificationType(NotificationType.SURVEY)).toBe('survey');
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
