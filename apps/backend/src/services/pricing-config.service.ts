import type {
  PriceBreakdown,
  PricingConfig,
  PublicDurationRule,
  PublicSkill,
  SkillFeeType,
} from '@nanny-app/shared';

import { errors } from '@backend/lib/errors';
import {
  getPlatformConfig,
  getRevenueSplit,
  getServiceFeePercent,
  getStandardHourlyRate,
} from './app-settings.service';
import { listActiveDurationRules } from './duration-rule.service';
import {
  calculatePriceBreakdown,
  resolveDurationMultiplier,
  type SkillAddOnInput,
} from './pricing.service';
import { listActiveSkills } from './skill.service';

/** Everything the pricing engine needs, fetched once from the DB. */
export interface PricingInputs {
  baseRate: number;
  nannyPercent: number;
  platformPercent: number;
  addOnSkills: PublicSkill[];
  durationRules: PublicDurationRule[];
  /** Children covered by the base rate, and what each one beyond that costs. */
  includedChildren: number;
  maxChildren: number;
  extraChildFeeType: SkillFeeType | null;
  extraChildFeeValue: number;
}

/**
 * Loads the base rate, revenue split, add-on skills, duration tiers and the
 * extra-child rule. `getPlatformConfig` already carries the base rate and split,
 * but the two dedicated readers are kept so the call sites that only want one of
 * them don't have to load the whole config.
 */
export async function getPricingInputs(): Promise<PricingInputs> {
  const [baseRate, split, addOnSkills, durationRules, config] = await Promise.all([
    getStandardHourlyRate(),
    getRevenueSplit(),
    listActiveSkills(),
    listActiveDurationRules(),
    getPlatformConfig(),
  ]);
  return {
    baseRate,
    nannyPercent: split.nannyPercent,
    platformPercent: split.platformPercent,
    addOnSkills,
    durationRules,
    includedChildren: config.includedChildrenPerBooking,
    maxChildren: config.maxChildrenPerBooking,
    extraChildFeeType: config.extraChildFeeType,
    extraChildFeeValue: config.extraChildFeeValue,
  };
}

/**
 * Builds a full price breakdown from pre-loaded inputs. Pure aside from the
 * inputs. Unknown skill ids are rejected so a booking can't silently drop an
 * add-on the mother expected to pay for.
 */
export function buildBreakdown(
  inputs: PricingInputs,
  opts: {
    durationHours: number;
    skillIds: number[];
    /** Defaults to 1 for callers with no children context (e.g. promo preview). */
    childrenCount?: number;
    discountAmount?: number;
  },
): PriceBreakdown {
  const uniqueIds = Array.from(new Set(opts.skillIds));
  const selected: SkillAddOnInput[] = uniqueIds.map((id) => {
    const skill = inputs.addOnSkills.find((s) => s.id === id);
    if (!skill) throw errors.badRequest(`Unknown or inactive skill: ${id}`);
    return { id: skill.id, name: skill.name, feeType: skill.feeType, feeValue: skill.feeValue };
  });

  const durationMultiplier = resolveDurationMultiplier(opts.durationHours, inputs.durationRules);

  return calculatePriceBreakdown({
    baseRate: inputs.baseRate,
    durationHours: opts.durationHours,
    skillAddOns: selected,
    extraChildFee: {
      childrenCount: opts.childrenCount ?? 1,
      includedChildren: inputs.includedChildren,
      feeType: inputs.extraChildFeeType,
      feeValue: inputs.extraChildFeeValue,
    },
    durationMultiplier,
    discountAmount: opts.discountAmount ?? 0,
    nannyPercent: inputs.nannyPercent,
    platformPercent: inputs.platformPercent,
  });
}

/**
 * Public pricing inputs for the booking form's live estimate and the admin
 * calculator: base hourly rate, revenue split, selectable skill add-ons and
 * duration tiers. Not secret — any authenticated user may read these.
 */
export async function getPricingConfig(): Promise<PricingConfig> {
  const [inputs, serviceFeePercent] = await Promise.all([
    getPricingInputs(),
    getServiceFeePercent(),
  ]);
  return {
    standardHourlyRate: inputs.baseRate,
    serviceFeePercent,
    nannyPercent: inputs.nannyPercent,
    platformPercent: inputs.platformPercent,
    skillAddOns: inputs.addOnSkills,
    durationRules: inputs.durationRules,
    includedChildrenPerBooking: inputs.includedChildren,
    maxChildrenPerBooking: inputs.maxChildren,
    extraChildFeeType: inputs.extraChildFeeType,
    extraChildFeeValue: inputs.extraChildFeeValue,
  };
}

/** One-shot preview used by the admin calculator. */
export async function previewBreakdown(opts: {
  durationHours: number;
  skillIds: number[];
  childrenCount?: number;
  discountAmount?: number;
}): Promise<PriceBreakdown> {
  const inputs = await getPricingInputs();
  return buildBreakdown(inputs, opts);
}
