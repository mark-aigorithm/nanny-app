import { calculatePriceBreakdown } from '@backend/services/pricing.service';

describe('calculatePriceBreakdown', () => {
  it('charges the service fee on the FULL subtotal and applies a flat discount to the gross total', () => {
    const b = calculatePriceBreakdown({
      baseRate: 100,
      durationHours: 2,
      discountAmount: 50,
      serviceFeePercent: 6,
    });
    expect(b.subtotal).toBe(200); // nanny earnings — never reduced
    expect(b.serviceFeeAmount).toBe(12); // 6% of full 200, not the discounted base
    expect(b.discountAmount).toBe(50);
    expect(b.totalAmount).toBe(162); // 212 gross − 50
  });

  it('applies a percentage discount computed on the gross total', () => {
    // caller (validatePromoCode) passes discountAmount = gross(212) * 10% = 21.2
    const b = calculatePriceBreakdown({
      baseRate: 100,
      durationHours: 2,
      discountAmount: 21.2,
      serviceFeePercent: 6,
    });
    expect(b.totalAmount).toBe(190.8);
  });

  it('is regression-identical to the old function when there is no discount', () => {
    const b = calculatePriceBreakdown({ baseRate: 100, durationHours: 2, serviceFeePercent: 6 });
    expect(b.discountAmount).toBe(0);
    expect(b.subtotal).toBe(200);
    expect(b.serviceFeeAmount).toBe(12);
    expect(b.totalAmount).toBe(212); // subtotal + fee
  });

  it('caps the discount at the gross total so totalAmount never goes negative', () => {
    const b = calculatePriceBreakdown({
      baseRate: 100,
      durationHours: 2,
      discountAmount: 500,
      serviceFeePercent: 6,
    });
    expect(b.discountAmount).toBe(212); // capped at gross
    expect(b.totalAmount).toBe(0);
  });

  it('never reduces the nanny subtotal regardless of discount', () => {
    const b = calculatePriceBreakdown({
      baseRate: 100,
      durationHours: 2,
      discountAmount: 50,
      serviceFeePercent: 6,
    });
    expect(b.subtotal).toBe(200);
  });
});
