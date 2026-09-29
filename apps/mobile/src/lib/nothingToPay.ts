import type { BookingResponse } from '@nanny-app/shared';

type PricedBooking = Pick<
  BookingResponse,
  'totalAmount' | 'discountAmount' | 'rewardCreditAmount' | 'packageCreditAmount'
>;

/**
 * A booking owes nothing once a promo, Care Points or package hours covered
 * its whole price. It is confirmed without a checkout — Paymob can't take a
 * zero payment, and there is nothing to collect.
 */
export function isNothingToPay(booking: Pick<BookingResponse, 'totalAmount'>): boolean {
  return booking.totalAmount <= 0;
}

/** Why nothing is owed, as a sentence: "Your promo code covers this booking in full." */
export function coveredInFullSentence(booking: PricedBooking): string {
  const parts = [
    // discountAmount already folds in the points and package credit, so a promo
    // is whatever is left once those are taken out.
    promoAmount(booking) > 0 ? 'promo code' : null,
    booking.rewardCreditAmount > 0 ? 'Care Points' : null,
    booking.packageCreditAmount > 0 ? 'package hours' : null,
  ].filter((p): p is string => p !== null);

  const last = parts[parts.length - 1];
  if (!last) return 'This booking is covered in full.';
  const subject = parts.length === 1 ? last : `${parts.slice(0, -1).join(', ')} and ${last}`;
  // "Care Points" and "package hours" are plural; only a lone promo code is not.
  const verb = parts.length === 1 && last === 'promo code' ? 'covers' : 'cover';
  return `Your ${subject} ${verb} this booking in full.`;
}

function promoAmount(booking: PricedBooking): number {
  return booking.discountAmount - booking.rewardCreditAmount - booking.packageCreditAmount;
}
