import type { PriceBreakdown } from '@nanny-app/shared';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure function — computes the full price breakdown for a booking.
 *
 * The service fee is charged on the FULL subtotal (the nanny's whole earnings,
 * never reduced by a promo), and the discount is subtracted from the gross
 * total (subtotal + serviceFeeAmount). With discountAmount = 0 this is
 * regression-identical to the previous behaviour (total = subtotal + fee).
 *
 * All monetary values are rounded to 2 decimal places. totalAmount is floored
 * at 0 (the discount is capped at the gross total so it cannot go negative).
 */
export function calculatePriceBreakdown({
  baseRate,
  durationHours,
  discountAmount = 0,
  serviceFeePercent,
}: {
  baseRate: number;
  durationHours: number;
  discountAmount?: number;
  serviceFeePercent: number;
}): PriceBreakdown {
  const subtotal = round2(baseRate * durationHours);
  const serviceFeeAmount = round2(subtotal * (serviceFeePercent / 100));
  const grossTotal = round2(subtotal + serviceFeeAmount);
  const actualDiscount = round2(Math.min(discountAmount, grossTotal));
  const totalAmount = Math.max(0, round2(grossTotal - actualDiscount));

  return {
    baseRate: round2(baseRate),
    durationHours: round2(durationHours),
    subtotal,
    discountAmount: actualDiscount,
    serviceFeePercent,
    serviceFeeAmount,
    totalAmount,
  };
}
