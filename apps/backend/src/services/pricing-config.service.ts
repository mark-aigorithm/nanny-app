import type {
  PriceBreakdown,
  PricingConfig,
  PublicDurationRule,
  PublicSkill,
} from '@nanny-app/shared';

import { errors } from '@backend/lib/errors';
import {
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
}

/** Loads the current base rate, revenue split, add-on skills and duration tiers. */
export async function getPricingInputs(): Promise<PricingInputs> {
  const [baseRate, split, addOnSkills, durationRules] = await Promise.all([
    getStandardHourlyRate(),
    getRevenueSplit(),
    listActiveSkills(),
    listActiveDurationRules(),
  ]);
  return {
    baseRate,
    nannyPercent: split.nannyPercent,
    platformPercent: split.platformPercent,
    addOnSkills,
    durationRules,
  };
}

/**
 * Builds a full price breakdown from pre-loaded inputs. Pure aside from the
 * inputs. Unknown skill ids are rejected so a booking can't silently drop an
 * add-on the mother expected to pay for.
 */
export function buildBreakdown(
  inputs: PricingInputs,
  opts: { durationHours: number; skillIds: string[]; discountAmount?: number },
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
  };
}

/** One-shot preview used by the admin calculator. */
export async function previewBreakdown(opts: {
  durationHours: number;
  skillIds: string[];
  discountAmount?: number;
}): Promise<PriceBreakdown> {
  const inputs = await getPricingInputs();
  return buildBreakdown(inputs, opts);
}
