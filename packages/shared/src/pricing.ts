import type { AppliedSkillFee, PriceBreakdown } from './booking';
import type { SkillFeeType } from './skill';

// ──────────────────────────────────────────────────────────────
// Pure pricing engine — the single source of truth for booking
// money math, shared by the backend (authoritative pricing) and
// the mobile app (live estimate) so the two can never drift.
// ──────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A selectable skill add-on and its configured fee (null feeType = no fee). */
export interface SkillAddOnInput {
  id: number;
  name: string;
  feeType: SkillFeeType | null;
  feeValue: number;
}

/** A duration pricing tier: at ≥ minHours the subtotal is scaled by multiplier. */
export interface DurationRuleInput {
  minHours: number;
  multiplier: number;
}

/**
 * Resolves the effective hourly rate from a base rate and the selected skill
 * add-ons. FLAT fees add EGP/hour; PERCENTAGE fees add a percent of the base
 * rate per hour. A null feeType (or 0 value) contributes nothing. Returns the
 * per-add-on breakdown so the UI can itemise each surcharge.
 */
export function resolveEffectiveRate(
  baseRate: number,
  addOns: SkillAddOnInput[],
): { effectiveHourlyRate: number; applied: AppliedSkillFee[] } {
  const applied: AppliedSkillFee[] = addOns.map((s) => {
    const amountPerHour =
      s.feeType === 'FLAT'
        ? s.feeValue
        : s.feeType === 'PERCENTAGE'
          ? baseRate * (s.feeValue / 100)
          : 0;
    return {
      id: s.id,
      name: s.name,
      feeType: s.feeType,
      feeValue: s.feeValue,
      amountPerHour: round2(amountPerHour),
    };
  });
  const addOnTotal = applied.reduce((sum, a) => sum + a.amountPerHour, 0);
  return { effectiveHourlyRate: round2(baseRate + addOnTotal), applied };
}

/**
 * Values a booking's applied prepaid package hours as an EGP credit.
 *
 * Prepaid hours are a credit, never a re-price — the nanny is still paid the
 * full effective rate and the platform funds the benefit. Covered hours are
 * valued at what the mother was actually charged for them: the base rate plus
 * any waived skill surcharges, scaled by the duration multiplier. Skipping the
 * multiplier would credit back more than a discounted long booking cost.
 *
 * The package's free-skill allowance is spent on the most expensive add-ons
 * first (best for the mother); any selected beyond the allowance stay billable.
 * The credit never exceeds what is still owed.
 */
export function computePackageHoursCredit(params: {
  baseRate: number;
  durationMultiplier: number;
  totalAmount: number;
  hoursApplied: number;
  maxSkillsAllowed: number;
  /** Per-hour fee of each selected skill add-on, in any order. */
  skillFeesPerHour: number[];
}): { credit: number; skillsCovered: number } {
  if (params.hoursApplied <= 0) return { credit: 0, skillsCovered: 0 };

  const descending = [...params.skillFeesPerHour].sort((a, b) => b - a);
  const skillsCovered = Math.min(params.maxSkillsAllowed, descending.length);
  const waivedPerHour = descending
    .slice(0, skillsCovered)
    .reduce((sum, fee) => sum + fee, 0);

  const rawCredit = round2(
    (params.baseRate + waivedPerHour) * params.hoursApplied * params.durationMultiplier,
  );
  return { credit: Math.min(rawCredit, params.totalAmount), skillsCovered };
}

/**
 * Picks the duration multiplier for a booking length: the highest tier whose
 * minHours is ≤ durationHours wins. With no matching tier the multiplier is 1
 * (no adjustment). E.g. a 3-hour booking against a "≥2h → 0.90" tier gets 0.90.
 */
export function resolveDurationMultiplier(
  durationHours: number,
  rules: DurationRuleInput[],
): number {
  const match = rules
    .filter((r) => durationHours >= r.minHours)
    .sort((a, b) => b.minHours - a.minHours)[0];
  return match ? match.multiplier : 1;
}

/**
 * Pure function — computes the full price breakdown for a booking.
 *
 *   effectiveHourlyRate = baseRate + selected skill add-on fees (per hour)
 *   subtotal            = effectiveHourlyRate × durationHours × durationMultiplier
 *   totalAmount         = max(0, subtotal − promo discount)   ← what the mother pays
 *   nannyAmount         = totalAmount × nannyPercent           ← what the nanny earns
 *   platformAmount      = totalAmount − nannyAmount
 *
 * The nanny/platform split replaces the legacy service fee, so serviceFee* are
 * always 0 here (kept for back-compat with old persisted bookings). All money
 * values are rounded to 2dp; totalAmount is floored at 0 (discount is capped at
 * the subtotal so it can't go negative).
 */
export function calculatePriceBreakdown({
  baseRate,
  durationHours,
  skillAddOns = [],
  durationMultiplier = 1,
  discountAmount = 0,
  nannyPercent,
  platformPercent,
}: {
  baseRate: number;
  durationHours: number;
  skillAddOns?: SkillAddOnInput[];
  durationMultiplier?: number;
  discountAmount?: number;
  nannyPercent: number;
  platformPercent: number;
}): PriceBreakdown {
  const { effectiveHourlyRate, applied } = resolveEffectiveRate(baseRate, skillAddOns);
  const rawSubtotal = round2(effectiveHourlyRate * durationHours);
  const subtotal = round2(rawSubtotal * durationMultiplier);
  const actualDiscount = round2(Math.min(discountAmount, subtotal));
  const totalAmount = Math.max(0, round2(subtotal - actualDiscount));
  const nannyAmount = round2(totalAmount * (nannyPercent / 100));
  const platformAmount = Math.max(0, round2(totalAmount - nannyAmount));

  return {
    baseRate: round2(baseRate),
    durationHours: round2(durationHours),
    skillAddOns: applied,
    effectiveHourlyRate,
    subtotal,
    durationMultiplier,
    discountAmount: actualDiscount,
    serviceFeePercent: 0,
    serviceFeeAmount: 0,
    totalAmount,
    nannyPercent,
    platformPercent,
    nannyAmount,
    platformAmount,
  };
}
