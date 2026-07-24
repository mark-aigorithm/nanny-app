/**
 * The pure pricing engine lives in @nanny-app/shared so the backend
 * (authoritative pricing) and the mobile app (live estimate) share one source
 * of truth. Re-exported here so existing @backend/services/pricing.service
 * imports keep working.
 */
export {
  calculatePriceBreakdown,
  resolveDurationMultiplier,
  resolveEffectiveRate,
  resolveExtraChildFee,
  type DurationRuleInput,
  type ExtraChildFeeInput,
  type SkillAddOnInput,
} from '@nanny-app/shared';
