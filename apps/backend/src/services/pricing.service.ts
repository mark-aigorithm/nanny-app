import type { PriceBreakdown } from '@nanny-app/shared';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure function — computes the full price breakdown for a booking.
 * All monetary values are rounded to 2 decimal places.
 * totalAmount is floored at 0 (discount cannot make it negative).
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
  const actualDiscount = round2(Math.min(discountAmount, subtotal));
  const serviceFeeAmount = round2((subtotal - actualDiscount) * (serviceFeePercent / 100));
  const totalAmount = Math.max(0, round2(subtotal - actualDiscount + serviceFeeAmount));

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
