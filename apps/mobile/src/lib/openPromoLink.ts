import type { Router } from 'expo-router';
import type { NotificationLink, PublicCampaign } from '@nanny-app/shared';

import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';

/**
 * Where a package or promo-code link takes her. One place for every way in —
 * a campaign banner, an announcement push and an inbox card — so the three can
 * never disagree about the route or about how a code reaches the booking flow.
 *
 * A promo code is handed over through `pendingPromoStore`: the booking flow
 * starts at the date picker, and BookingStep1Screen (two screens later) reads
 * the code once on mount and applies it as soon as the price is known.
 */
export function openPromoLink(router: Router, link: NotificationLink): void {
  if (link.type === 'package') {
    router.push({
      pathname: '/(parent)/packages/checkout',
      params: { packageId: String(link.packageId) },
    } as never);
    return;
  }
  usePendingPromoStore.getState().setPendingPromoCode(link.code);
  router.push('/(parent)/book/booking-date-picker' as never);
}

/** A campaign's target as a link, or null when its package or code is missing. */
export function campaignLink(
  campaign: Pick<PublicCampaign, 'targetType' | 'packageId' | 'promoCode'>,
): NotificationLink | null {
  if (campaign.targetType === 'PACKAGE' && campaign.packageId != null) {
    return { type: 'package', packageId: campaign.packageId };
  }
  if (campaign.targetType === 'PROMO_CODE' && campaign.promoCode) {
    return { type: 'promo_code', code: campaign.promoCode };
  }
  return null;
}
