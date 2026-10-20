import { announcementLinkFromPush, isAnnouncementPush } from '@mobile/lib/notificationNavigation';

describe('announcement push', () => {
  it('recognises the announcement type', () => {
    expect(isAnnouncementPush({ type: 'ANNOUNCEMENT', broadcastId: '3' })).toBe(true);
    expect(isAnnouncementPush({ type: 'SURVEY', surveyId: '3' })).toBe(false);
    expect(isAnnouncementPush(undefined)).toBe(false);
  });

  it('reads a promo-code link', () => {
    expect(
      announcementLinkFromPush({ type: 'ANNOUNCEMENT', targetType: 'PROMO_CODE', promoCode: 'SAVE20' }),
    ).toEqual({ type: 'promo_code', code: 'SAVE20' });
  });

  it('reads a package link', () => {
    expect(
      announcementLinkFromPush({ type: 'ANNOUNCEMENT', targetType: 'PACKAGE', packageId: '7' }),
    ).toEqual({ type: 'package', packageId: 7 });
  });

  it('has no link when there is none, or when it is malformed', () => {
    expect(announcementLinkFromPush({ type: 'ANNOUNCEMENT', broadcastId: '3' })).toBeNull();
    expect(announcementLinkFromPush({ type: 'ANNOUNCEMENT', targetType: 'PACKAGE', packageId: 'x' })).toBeNull();
    expect(announcementLinkFromPush({ type: 'ANNOUNCEMENT', targetType: 'PROMO_CODE', promoCode: ' ' })).toBeNull();
  });
});
