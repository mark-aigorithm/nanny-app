import { campaignLink, openPromoLink } from '@mobile/lib/openPromoLink';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';

function makeRouter() {
  return { push: jest.fn() };
}

beforeEach(() => usePendingPromoStore.getState().clear());

describe('openPromoLink', () => {
  it('opens package checkout for a package link', () => {
    const router = makeRouter();
    openPromoLink(router as never, { type: 'package', packageId: 7 });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(parent)/packages/checkout',
      params: { packageId: '7' },
    });
    expect(usePendingPromoStore.getState().pendingPromoCode).toBeNull();
  });

  it('hands a promo code to the booking flow and starts it', () => {
    const router = makeRouter();
    openPromoLink(router as never, { type: 'promo_code', code: 'SAVE20' });
    expect(usePendingPromoStore.getState().pendingPromoCode).toBe('SAVE20');
    expect(router.push).toHaveBeenCalledWith('/(parent)/book/booking-date-picker');
  });
});

describe('campaignLink', () => {
  it('maps a promo campaign to its code', () => {
    expect(campaignLink({ targetType: 'PROMO_CODE', packageId: null, promoCode: 'WELCOME20' })).toEqual({
      type: 'promo_code',
      code: 'WELCOME20',
    });
  });

  it('maps a package campaign to its package', () => {
    expect(campaignLink({ targetType: 'PACKAGE', packageId: 7, promoCode: null })).toEqual({
      type: 'package',
      packageId: 7,
    });
  });

  it('has no link when the target is missing', () => {
    expect(campaignLink({ targetType: 'PROMO_CODE', packageId: null, promoCode: null })).toBeNull();
    expect(campaignLink({ targetType: 'PACKAGE', packageId: null, promoCode: null })).toBeNull();
  });
});
