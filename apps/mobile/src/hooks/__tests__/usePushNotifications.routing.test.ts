jest.mock('@mobile/lib/firebase', () => ({ auth: () => ({ currentUser: null }) }));

import { isBookingCompletedPush } from '@mobile/hooks/usePushNotifications';

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
