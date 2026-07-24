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

/** The admin-configured extra-child rule, plus how many children were booked. */
export interface ExtraChildFeeInput {
  childrenCount: number;
  /** How many children the base rate already covers. */
  includedChildren: number;
  /** null (or a 0 value) = extra children are free. */
  feeType: SkillFeeType | null;
  feeValue: number;
}

/**
 * What the children on a booking add to the hourly rate.
 *
 * The first `includedChildren` are already paid for by the base rate; each one
 * beyond that costs `feeValue` EGP/hour (FLAT) or that percent of the base rate
 * per hour (PERCENTAGE). The charge is per extra child, so a 4-child booking
 * against a 2-child allowance pays twice.
 *
 * Deliberately shaped like `resolveEffectiveRate`: the result is a per-HOUR
 * amount that gets folded into `effectiveHourlyRate` exactly like a skill
 * add-on, which is what makes duration tiers, Care Points and mid-shift
 * extensions price multi-child bookings correctly without knowing this rule
 * exists.
 */
export function resolveExtraChildFee(
  baseRate: number,
  { childrenCount, includedChildren, feeType, feeValue }: ExtraChildFeeInput,
): { extraChildren: number; amountPerHour: number } {
  // Fail to "no fee", not to NaN. A missing or malformed setting must never
  // poison the hourly rate — an under-charge is recoverable, a NaN total is a
  // booking nobody can pay for.
  const count = Number.isFinite(childrenCount) ? Math.floor(childrenCount) : 1;
  const included = Number.isFinite(includedChildren) ? Math.floor(includedChildren) : count;
  const value = Number.isFinite(feeValue) ? feeValue : 0;

  const extraChildren = Math.max(0, count - included);
  if (extraChildren <= 0 || feeType == null || value <= 0) {
    return { extraChildren, amountPerHour: 0 };
  }
  const perChildPerHour = feeType === 'FLAT' ? value : baseRate * (value / 100);
  return { extraChildren, amountPerHour: round2(extraChildren * perChildPerHour) };
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

/** Rounds DOWN to 2 decimals — used where rounding up would overspend. */
function floor2(n: number): number {
  return Math.floor(n * 100) / 100;
}

/**
 * Decides how many prepaid package hours a booking should actually consume.
 *
 * Prepaid hours are a credit, never a re-price — the nanny is still paid the
 * full effective rate and the platform funds the benefit. A covered hour is
 * worth what the mother was actually charged for it: the base rate plus any
 * waived skill surcharges, scaled by the duration multiplier. Skipping the
 * multiplier would credit back more than a discounted long booking cost.
 *
 * The package's free-skill allowance is spent on the most expensive add-ons
 * first (best for the mother); any selected beyond the allowance stay billable.
 *
 * Critically, the hours to redeem are bounded by what the remaining balance can
 * actually pay for. Redeeming the full duration and then capping the credit at
 * the total owed would silently destroy prepaid hours whenever a promo code has
 * already brought the total below the raw value of those hours.
 */
export function resolvePackageHourValue(params: {
  baseRate: number;
  durationMultiplier: number;
  /** Free skill add-ons the package covers. */
  maxSkillsAllowed: number;
  /** Per-hour fee of each selected skill add-on, in any order. */
  skillFeesPerHour: number[];
}): { creditPerHour: number; skillsCovered: number } {
  const descending = [...params.skillFeesPerHour].sort((a, b) => b - a);
  const skillsCovered = Math.min(params.maxSkillsAllowed, descending.length);
  const waivedPerHour = descending
    .slice(0, skillsCovered)
    .reduce((sum, fee) => sum + fee, 0);

  return {
    creditPerHour: round2((params.baseRate + waivedPerHour) * params.durationMultiplier),
    skillsCovered,
  };
}

export function planPackageHoursRedemption(params: {
  baseRate: number;
  durationMultiplier: number;
  /** What is still owed on the booking before any package credit. */
  totalAmount: number;
  durationHours: number;
  /** Prepaid hours the mother currently holds. */
  availableHours: number;
  /**
   * Best allowance across the mother's buckets. Optimistic on purpose: a higher
   * allowance means a higher per-hour value, hence FEWER affordable hours, so
   * this can only under-spend. The caller re-prices against the allowance of the
   * buckets actually drawn from.
   */
  maxSkillsAllowed: number;
  skillFeesPerHour: number[];
}): { hoursToRedeem: number; skillsCovered: number; creditPerHour: number } {
  const none = { hoursToRedeem: 0, skillsCovered: 0, creditPerHour: 0 };
  if (params.availableHours <= 0 || params.durationHours <= 0) return none;
  if (params.totalAmount <= 0) return none;

  const { creditPerHour, skillsCovered } = resolvePackageHourValue(params);
  // A worthless hour must never be spent.
  if (creditPerHour <= 0) return none;

  const affordableHours = floor2(params.totalAmount / creditPerHour);
  const hoursToRedeem = round2(
    Math.min(params.durationHours, params.availableHours, affordableHours),
  );
  if (hoursToRedeem <= 0) return none;

  return { hoursToRedeem, skillsCovered, creditPerHour };
}

/**
 * EGP credit for the hours a booking actually consumed. The cap is a safety
 * net only — planPackageHoursRedemption already bounds the hours so it should
 * never bind.
 */
export function packageHoursCreditFor(params: {
  hoursApplied: number;
  creditPerHour: number;
  totalAmount: number;
}): number {
  if (params.hoursApplied <= 0) return 0;
  return Math.min(round2(params.hoursApplied * params.creditPerHour), params.totalAmount);
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
 *   effectiveHourlyRate = baseRate + skill add-on fees + extra-child fee (per hour)
 *   subtotal            = effectiveHourlyRate × durationHours × durationMultiplier
 *   totalAmount         = max(0, subtotal − promo discount)   ← what the mother pays
 *   nannyAmount         = totalAmount × nannyPercent           ← what the nanny earns
 *   platformAmount      = totalAmount − nannyAmount
 *
 * The nanny/platform split replaces the legacy service fee, so serviceFee* are
 * always 0 here (kept for back-compat with old persisted bookings). All money
 * values are rounded to 2dp; totalAmount is floored at 0 (discount is capped at
 * the subtotal so it can't go negative).
 *
 * `extraChildFee` is optional so callers that genuinely have no children context
 * — the promo preview, old tests — keep pricing a single-child booking.
 */
export function calculatePriceBreakdown({
  baseRate,
  durationHours,
  skillAddOns = [],
  extraChildFee,
  durationMultiplier = 1,
  discountAmount = 0,
  nannyPercent,
  platformPercent,
}: {
  baseRate: number;
  durationHours: number;
  skillAddOns?: SkillAddOnInput[];
  extraChildFee?: ExtraChildFeeInput;
  durationMultiplier?: number;
  discountAmount?: number;
  nannyPercent: number;
  platformPercent: number;
}): PriceBreakdown {
  const { effectiveHourlyRate: rateWithSkills, applied } = resolveEffectiveRate(
    baseRate,
    skillAddOns,
  );
  const children: ExtraChildFeeInput = extraChildFee ?? {
    childrenCount: 1,
    includedChildren: 1,
    feeType: null,
    feeValue: 0,
  };
  const { extraChildren, amountPerHour: extraChildFeePerHour } = resolveExtraChildFee(
    baseRate,
    children,
  );
  const effectiveHourlyRate = round2(rateWithSkills + extraChildFeePerHour);
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
    childrenCount: Math.max(1, Math.floor(children.childrenCount)),
    includedChildren: Math.max(1, Math.floor(children.includedChildren)),
    extraChildren,
    extraChildFeePerHour,
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
