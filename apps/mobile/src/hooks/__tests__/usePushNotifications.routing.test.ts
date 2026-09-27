jest.mock('@mobile/lib/firebase', () => ({ auth: () => ({ currentUser: null }) }));

import {
  isAccountStatusPush,
  isBookingCompletedPush,
  isExtensionDeclinedPush,
} from '@mobile/hooks/usePushNotifications';

describe('isBookingCompletedPush', () => {
  it('matches the backend push type string', () => {
    expect(isBookingCompletedPush({ type: 'booking_completed' })).toBe(true);
  });

  it('matches the enum-cased type defensively', () => {
    expect(isBookingCompletedPush({ type: 'BOOKING_COMPLETED' })).toBe(true);
  });

  it('is false for other types', () => {
    expect(isBookingCompletedPush({ type: 'nanny_checkin' })).toBe(false);
  });

  it('is false for missing data', () => {
    expect(isBookingCompletedPush(undefined)).toBe(false);
  });
});

describe('isExtensionDeclinedPush', () => {
  it('matches the backend push type string', () => {
    expect(isExtensionDeclinedPush({ type: 'booking_extension_declined' })).toBe(true);
  });

  it('matches the enum-cased type defensively', () => {
    expect(isExtensionDeclinedPush({ type: 'BOOKING_EXTENSION_DECLINED' })).toBe(true);
  });

  it('is false for the accepted sibling', () => {
    expect(isExtensionDeclinedPush({ type: 'booking_extension_accepted' })).toBe(false);
  });

  it('is false for missing data', () => {
    expect(isExtensionDeclinedPush(undefined)).toBe(false);
  });
});

describe('isAccountStatusPush', () => {
  it.each(['id_reupload_requested', 'nanny_rejected', 'nanny_approved', 'id_rejected', 'id_approved'])(
    'matches %s',
    (type) => {
      expect(isAccountStatusPush({ type })).toBe(true);
    },
  );

  it('matches the enum-cased type defensively', () => {
    expect(isAccountStatusPush({ type: 'NANNY_REJECTED' })).toBe(true);
  });

  it('is false for other types and missing data', () => {
    expect(isAccountStatusPush({ type: 'booking_completed' })).toBe(false);
    expect(isAccountStatusPush(undefined)).toBe(false);
  });
});
