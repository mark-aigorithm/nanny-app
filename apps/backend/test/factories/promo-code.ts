/**
 * Promo code factory.
 *
 * Defaults to a live, unlimited 10% code — the least surprising thing a test
 * could apply to a booking. The interesting states (expired, exhausted,
 * per-user cap) are one override away, so specs read as the rule under test.
 */
import { DiscountType, type Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';

/** Unique-code generator; codes are globally unique and the admin console upcases them. */
let sequence = 0;
function uniqueCode(): string {
  sequence += 1;
  return `TEST-${process.pid}-${sequence}`;
}

export type PromoCodeOverrides = Partial<Prisma.PromoCodeCreateInput>;

export function makePromoCode(overrides: PromoCodeOverrides = {}) {
  return prisma.promoCode.create({
    data: {
      code: uniqueCode(),
      discountType: DiscountType.PERCENTAGE,
      value: 10,
      isActive: true,
      ...overrides,
    },
  });
}
