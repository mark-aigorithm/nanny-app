import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Campaigns — admin-curated promo cards shown as a carousel on the
// parent Home screen. Each campaign links to exactly one target: a
// Package or a PromoCode. Tapping a card deep-links the parent to
// that target. Engagement is tracked with two counters (impressions,
// taps); "total usage" in the admin table comes from the linked
// target's own usage, not from campaign attribution.
// ──────────────────────────────────────────────────────────────

export const CampaignTargetTypeSchema = z.enum(['PACKAGE', 'PROMO_CODE']);
export type CampaignTargetType = z.infer<typeof CampaignTargetTypeSchema>;

/** Full admin DTO returned by the admin Campaigns endpoints. */
export const CampaignSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  targetType: CampaignTargetTypeSchema,
  packageId: z.number().int().nullable(),
  promoCodeId: z.number().int().nullable(),
  /** Resolved for display: the package name, or the promo code string. */
  targetName: z.string(),
  isActive: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  sortOrder: z.number().int(),
  impressionCount: z.number().int(),
  clickCount: z.number().int(),
  /** The linked target's own cumulative usage (promo redemptions / paid package purchases). */
  targetUsageCount: z.number().int(),
  createdAt: z.string(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

// Exactly one target id, consistent with targetType.
function oneTargetMatchesType(v: {
  targetType?: CampaignTargetType;
  packageId?: number | null;
  promoCodeId?: number | null;
}): boolean {
  if (v.targetType === 'PACKAGE') {
    return v.packageId != null && v.promoCodeId == null;
  }
  if (v.targetType === 'PROMO_CODE') {
    return v.promoCodeId != null && v.packageId == null;
  }
  return true; // targetType not being set is handled elsewhere (create requires it)
}

export const CreateCampaignSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    subtitle: z.string().trim().max(200).optional(),
    imageUrl: z.string().url(),
    targetType: CampaignTargetTypeSchema,
    packageId: z.number().int().positive().optional(),
    promoCodeId: z.number().int().positive().optional(),
    isActive: z.boolean().default(true),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .refine(oneTargetMatchesType, {
    message: 'Set exactly one target matching targetType (packageId for PACKAGE, promoCodeId for PROMO_CODE).',
    path: ['targetType'],
  })
  .refine(
    (v) => !(v.startsAt && v.endsAt) || new Date(v.endsAt) > new Date(v.startsAt),
    { message: 'endsAt must be after startsAt', path: ['endsAt'] },
  );
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    subtitle: z.string().trim().max(200).nullable().optional(),
    imageUrl: z.string().url().optional(),
    targetType: CampaignTargetTypeSchema.optional(),
    packageId: z.number().int().positive().nullable().optional(),
    promoCodeId: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  })
  // When targetType is being set, the accompanying id must match it.
  .refine((v) => v.targetType === undefined || oneTargetMatchesType(v), {
    message: 'When changing targetType, set exactly the matching target id.',
    path: ['targetType'],
  });
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

// ── Mobile-facing carousel DTO ─────────────────────────────────
export const PublicCampaignSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  targetType: CampaignTargetTypeSchema,
  /** Set for PACKAGE campaigns — the package to open at checkout. */
  packageId: z.number().int().nullable(),
  /** Set for PROMO_CODE campaigns — the code to prefill in the booking flow. */
  promoCode: z.string().nullable(),
});
export type PublicCampaign = z.infer<typeof PublicCampaignSchema>;
