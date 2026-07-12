import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Skills — admin-curated nanny specialties (controlled replacement
// for the free-text NannyProfile.specialties array). Linked to
// nannies many-to-many. This module imports nothing internal so it
// can be consumed by both admin and public nanny schemas without
// creating an import cycle.
// ──────────────────────────────────────────────────────────────

/**
 * How a skill's optional booking add-on fee is applied. Mirrors the DB
 * `discount_type` enum (FLAT / PERCENTAGE). Declared locally so this module
 * stays free of internal imports (admin.ts imports from here). `null` feeType
 * means the skill carries no add-on fee.
 */
export const SkillFeeTypeSchema = z.enum(['FLAT', 'PERCENTAGE']);
export type SkillFeeType = z.infer<typeof SkillFeeTypeSchema>;

/** Lightweight skill shape embedded in nanny profile/listing responses. */
export const PublicSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** null = no add-on fee. FLAT = EGP/hour; PERCENTAGE = % of base rate/hour. */
  feeType: SkillFeeTypeSchema.nullable(),
  feeValue: z.number(),
});
export type PublicSkill = z.infer<typeof PublicSkillSchema>;

/** Full admin DTO returned by the admin Skills endpoints. */
export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  feeType: SkillFeeTypeSchema.nullable(),
  feeValue: z.number(),
  createdAt: z.string(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const CreateSkillSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().default(true),
    /** null (default) = no fee. Set with feeValue to add a booking surcharge. */
    feeType: SkillFeeTypeSchema.nullable().default(null),
    feeValue: z.number().min(0).max(100000).default(0),
  })
  .refine((v) => v.feeType !== 'PERCENTAGE' || v.feeValue <= 100, {
    message: 'Percentage fee cannot exceed 100',
    path: ['feeValue'],
  });
export type CreateSkillInput = z.infer<typeof CreateSkillSchema>;

export const UpdateSkillSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
    feeType: SkillFeeTypeSchema.nullable().optional(),
    feeValue: z.number().min(0).max(100000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  })
  .refine((v) => v.feeType !== 'PERCENTAGE' || v.feeValue === undefined || v.feeValue <= 100, {
    message: 'Percentage fee cannot exceed 100',
    path: ['feeValue'],
  });
export type UpdateSkillInput = z.infer<typeof UpdateSkillSchema>;

/** Admin assignment payload — the full desired set of skill ids for a nanny. */
export const SetNannySkillsSchema = z.object({
  skillIds: z.array(z.string()),
});
export type SetNannySkillsInput = z.infer<typeof SetNannySkillsSchema>;
